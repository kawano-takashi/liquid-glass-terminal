import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import path from 'node:path';

export interface LaunchRequest {
  cwd?: string;
  invalidCwd: boolean;
}

export function parseLaunchRequest(argv: string[], workingDirectory: string): LaunchRequest {
  const index = argv.findIndex((value) => value === '--cwd');
  if (index === -1) return { invalidCwd: false };
  const candidate = argv[index + 1];
  if (!candidate || candidate.startsWith('--')) return { invalidCwd: true };
  const resolved = path.resolve(workingDirectory, candidate);
  try {
    return statSync(resolved).isDirectory()
      ? { cwd: resolved, invalidCwd: false }
      : { invalidCwd: true };
  } catch {
    return { invalidCwd: true };
  }
}

export class CwdTokenVault {
  readonly #entries = new Map<string, { path: string; expires: number }>();

  issue(cwd: string): string {
    this.prune();
    const token = randomUUID();
    this.#entries.set(token, { path: cwd, expires: Date.now() + 5 * 60_000 });
    return token;
  }

  consume(token: string | undefined): string | undefined {
    if (!token) return undefined;
    const entry = this.#entries.get(token);
    this.#entries.delete(token);
    return entry && entry.expires >= Date.now() ? entry.path : undefined;
  }

  private prune(): void {
    const now = Date.now();
    for (const [token, entry] of this.#entries) {
      if (entry.expires < now) this.#entries.delete(token);
    }
  }
}
