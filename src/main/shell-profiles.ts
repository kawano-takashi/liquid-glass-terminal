import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SettingsV1, ShellProfileDescriptor, ShellProfileKind } from '../shared/contracts';
import { quotePathForShell } from '../shared/validation';

const execFileAsync = promisify(execFile);

export interface InternalShellProfile extends ShellProfileDescriptor {
  executable: string;
  args: string[];
}

export interface SpawnDefinition {
  executable: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

function isDirectory(candidate: string | undefined): candidate is string {
  if (!candidate) return false;
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

async function findWindowsExecutable(name: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('where.exe', [name], { windowsHide: true });
    return stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}

function profile(
  id: string,
  label: string,
  kind: ShellProfileKind,
  executable: string,
  args: string[],
  wslDistro?: string,
): InternalShellProfile {
  return { id, label, kind, executable, args, ...(wslDistro ? { wslDistro } : {}) };
}

export class ShellProfileRegistry {
  readonly #profiles = new Map<string, InternalShellProfile>();

  async detect(): Promise<void> {
    this.#profiles.clear();
    const detected = process.platform === 'win32' ? await this.detectWindows() : this.detectPosix();
    for (const item of detected) this.#profiles.set(item.id, item);
  }

  descriptors(): ShellProfileDescriptor[] {
    return [...this.#profiles.values()].map((item) =>
      Object.freeze({
        id: item.id,
        label: item.label,
        kind: item.kind,
        ...(item.wslDistro ? { wslDistro: item.wslDistro } : {}),
      }),
    );
  }

  get(id: string | undefined, settings: SettingsV1): InternalShellProfile | undefined {
    const selected = id && id !== 'auto' ? id : settings.defaultProfileId;
    if (selected && selected !== 'auto' && this.#profiles.has(selected)) {
      return this.#profiles.get(selected);
    }
    return this.#profiles.values().next().value;
  }

  byId(id: string): InternalShellProfile | undefined {
    return this.#profiles.get(id);
  }

  async spawnDefinition(
    profile: InternalShellProfile,
    requestedCwd?: string,
  ): Promise<SpawnDefinition> {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    Object.assign(env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'LiquidGlassTerminal',
      TERM_PROGRAM_VERSION: '0.1.0',
    });

    if (profile.kind === 'wsl') {
      const linuxCwd = await this.toWslPath(profile, requestedCwd);
      const args = [...profile.args];
      if (linuxCwd) args.push('--cd', linuxCwd);
      return { executable: profile.executable, args, cwd: os.homedir(), env };
    }

    return {
      executable: profile.executable,
      args: [...profile.args],
      cwd: isDirectory(requestedCwd) ? requestedCwd : os.homedir(),
      env,
    };
  }

  async quoteDroppedPath(
    profile: InternalShellProfile,
    droppedPath: string,
  ): Promise<string | null> {
    if (!existsSync(droppedPath)) return null;
    const converted =
      profile.kind === 'wsl' ? await this.toWslPath(profile, droppedPath) : droppedPath;
    return converted ? quotePathForShell(converted, profile.kind) : null;
  }

  async isValidCwd(profile: InternalShellProfile, cwd: string): Promise<boolean> {
    if (profile.kind !== 'wsl') return isDirectory(cwd);
    if (!profile.wslDistro || !cwd.startsWith('/')) return false;
    try {
      await execFileAsync('wsl.exe', ['-d', profile.wslDistro, '--', 'test', '-d', cwd], {
        windowsHide: true,
        timeout: 2_000,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async detectWindows(): Promise<InternalShellProfile[]> {
    const result: InternalShellProfile[] = [];
    const pwsh = await findWindowsExecutable('pwsh.exe');
    if (pwsh) result.push(profile('windows:pwsh', 'PowerShell 7', 'powershell', pwsh, ['-NoLogo']));

    const windowsPowerShell = await findWindowsExecutable('powershell.exe');
    if (windowsPowerShell) {
      result.push(
        profile(
          'windows:powershell',
          'Windows PowerShell',
          'windows-powershell',
          windowsPowerShell,
          ['-NoLogo'],
        ),
      );
    }

    const commandPrompt = process.env.ComSpec ?? (await findWindowsExecutable('cmd.exe'));
    if (commandPrompt) {
      result.push(profile('windows:cmd', 'Command Prompt', 'cmd', commandPrompt, ['/Q']));
    }

    const git = await findWindowsExecutable('git.exe');
    if (git) {
      const gitBash = path.join(path.dirname(path.dirname(git)), 'bin', 'bash.exe');
      if (existsSync(gitBash)) {
        result.push(
          profile('windows:git-bash', 'Git Bash', 'git-bash', gitBash, ['--login', '-i']),
        );
      }
    }

    const wsl = await findWindowsExecutable('wsl.exe');
    if (wsl) {
      try {
        const { stdout } = await execFileAsync(wsl, ['--list', '--quiet'], {
          encoding: 'buffer',
          windowsHide: true,
          timeout: 3_000,
          maxBuffer: 1024 * 1024,
        });
        const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
        const decoded = buffer.includes(0) ? buffer.toString('utf16le') : buffer.toString('utf8');
        const names = decoded
          .replace(/^\ufeff/, '')
          .split(/\r?\n/)
          .map((name) => name.replaceAll('\0', '').trim())
          .filter(
            (name) =>
              name.length > 0 &&
              !['docker-desktop', 'docker-desktop-data', 'podman-machine-default'].includes(
                name.toLowerCase(),
              ),
          );
        for (const name of names) {
          result.push(profile(`wsl:${name}`, `WSL · ${name}`, 'wsl', wsl, ['-d', name], name));
        }
      } catch {
        // WSL is optional; leave it out when enumeration fails.
      }
    }
    return result;
  }

  private detectPosix(): InternalShellProfile[] {
    const result: InternalShellProfile[] = [];
    const candidates = [
      process.env.SHELL,
      '/bin/zsh',
      '/usr/bin/zsh',
      '/bin/bash',
      '/usr/bin/bash',
    ];
    for (const candidate of candidates) {
      if (
        !candidate ||
        !existsSync(candidate) ||
        result.some((item) => item.executable === candidate)
      )
        continue;
      const base = path.basename(candidate);
      const kind: ShellProfileKind = base === 'zsh' ? 'zsh' : base === 'bash' ? 'bash' : 'posix';
      if (result.some((item) => item.id === `posix:${base}`)) continue;
      const args = process.platform === 'darwin' ? ['-l'] : ['-i'];
      result.push(
        profile(
          `posix:${base}`,
          base === 'zsh' ? 'Zsh' : base === 'bash' ? 'Bash' : base,
          kind,
          candidate,
          args,
        ),
      );
    }
    return result;
  }

  private async toWslPath(
    profile: InternalShellProfile,
    candidate: string | undefined,
  ): Promise<string | undefined> {
    if (!candidate || !profile.wslDistro) return undefined;
    if (candidate.startsWith('/')) {
      return (await this.isValidCwd(profile, candidate)) ? candidate : undefined;
    }
    if (!isDirectory(candidate) && !existsSync(candidate)) return undefined;
    try {
      const { stdout } = await execFileAsync(
        'wsl.exe',
        ['-d', profile.wslDistro, '--', 'wslpath', '-a', candidate],
        { windowsHide: true, timeout: 3_000 },
      );
      const converted = stdout.trim();
      return converted.length > 0 ? converted : undefined;
    } catch {
      return undefined;
    }
  }
}
