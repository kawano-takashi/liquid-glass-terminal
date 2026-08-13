import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { MessagePortMain } from 'electron';
import * as nodePty from 'node-pty';
import type { IPty } from 'node-pty';
import type {
  PtyToRendererMessage,
  RendererToPtyMessage,
  SettingsV3,
  ShellProfileDescriptor,
} from '../shared/contracts';
import { isRendererToPtyMessage } from '../shared/validation';
import type { InternalShellProfile } from './shell-profiles';
import type { ShellProfileRegistry } from './shell-profiles';

const PAUSE_AT_BYTES = 256 * 1024;
const RESUME_BELOW_BYTES = 64 * 1024;

interface PtySession {
  id: string;
  ownerId: number;
  port: MessagePortMain;
  profile: InternalShellProfile;
  requestedCwd?: string;
  currentCwd?: string;
  pty?: IPty;
  exited: boolean;
  paused: boolean;
  nextSequence: number;
  outstandingBytes: number;
  pending: Map<number, number>;
  cols: number;
  rows: number;
}

export interface CreatedSession {
  sessionId: string;
  profile: ShellProfileDescriptor;
}

export class PtyManager {
  readonly #sessions = new Map<string, PtySession>();

  constructor(
    private readonly profiles: ShellProfileRegistry,
    private readonly getSettings: () => SettingsV3,
    private readonly countChanged: (ownerId: number, count: number) => void,
  ) {}

  create(
    ownerId: number,
    port: MessagePortMain,
    profileId: string | undefined,
    requestedCwd: string | undefined,
    inheritedSessionId: string | undefined,
    cols: number,
    rows: number,
  ): CreatedSession {
    const profile = this.profiles.get(profileId, this.getSettings());
    if (!profile) throw new Error('profileUnavailable');

    let cwd = requestedCwd;
    if (!cwd && inheritedSessionId) {
      const source = this.#sessions.get(inheritedSessionId);
      if (source?.ownerId === ownerId && source.profile.id === profile.id && source.currentCwd) {
        cwd = source.currentCwd;
      }
    }

    const id = randomUUID();
    const session: PtySession = {
      id,
      ownerId,
      port,
      profile,
      requestedCwd: cwd,
      currentCwd: undefined,
      exited: false,
      paused: false,
      nextSequence: 1,
      outstandingBytes: 0,
      pending: new Map(),
      cols,
      rows,
    };
    this.#sessions.set(id, session);
    this.bindPort(session);
    this.onCountChanged(ownerId);
    return { sessionId: id, profile: this.publicProfile(profile) };
  }

  async start(sessionId: string): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (!session || session.pty) return;
    await this.startPty(session, session.cols, session.rows);
    if (this.#sessions.has(sessionId)) session.port.start();
  }

  count(ownerId: number): number {
    return [...this.#sessions.values()].filter((session) => session.ownerId === ownerId).length;
  }

  closeForOwner(ownerId: number): void {
    for (const session of [...this.#sessions.values()]) {
      if (session.ownerId === ownerId) this.close(session);
    }
  }

  async prepareDroppedPath(
    ownerId: number,
    sessionId: string,
    path: string,
  ): Promise<string | null> {
    const session = this.#sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId || path.length > 32_768) return null;
    return this.profiles.quoteDroppedPath(session.profile, path);
  }

  private bindPort(session: PtySession): void {
    session.port.on('message', (event) => {
      const message: unknown = event.data;
      if (!isRendererToPtyMessage(message)) {
        this.send(session, { type: 'error', messageKey: 'invalidTerminalMessage' });
        this.close(session);
        return;
      }
      void this.handleMessage(session, message);
    });
    session.port.on('close', () => this.close(session));
  }

  private async handleMessage(session: PtySession, message: RendererToPtyMessage): Promise<void> {
    switch (message.type) {
      case 'input':
        if (!session.exited) session.pty?.write(message.data);
        break;
      case 'resize':
        session.cols = message.cols;
        session.rows = message.rows;
        if (!session.exited) session.pty?.resize(message.cols, message.rows);
        break;
      case 'ack': {
        const expected = session.pending.get(message.seq);
        if (expected === undefined || expected !== message.bytes) {
          this.send(session, { type: 'error', messageKey: 'invalidTerminalAck' });
          this.close(session);
          return;
        }
        session.pending.delete(message.seq);
        session.outstandingBytes = Math.max(0, session.outstandingBytes - expected);
        if (session.paused && session.outstandingBytes < RESUME_BELOW_BYTES) {
          session.pty?.resume();
          session.paused = false;
        }
        break;
      }
      case 'cwd':
        await this.updateCwd(session, message.uri);
        break;
      case 'restart':
        if (session.exited) {
          session.pending.clear();
          session.outstandingBytes = 0;
          session.paused = false;
          await this.startPty(session, session.cols, session.rows);
          this.send(session, { type: 'restarted' });
        }
        break;
      case 'close':
        this.close(session);
        break;
    }
  }

  private async startPty(session: PtySession, cols: number, rows: number): Promise<void> {
    const spawn = await this.profiles.spawnDefinition(
      session.profile,
      session.currentCwd ?? session.requestedCwd,
    );
    try {
      const pty = nodePty.spawn(spawn.executable, spawn.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: spawn.cwd,
        env: spawn.env,
        useConpty: true,
      });
      session.pty = pty;
      session.exited = false;
      pty.onData((data) => this.handleData(session, data));
      pty.onExit(({ exitCode, signal }) => {
        if (session.pty !== pty) return;
        session.exited = true;
        session.pty = undefined;
        this.send(session, { type: 'exit', code: exitCode, signal });
      });
      this.send(session, { type: 'ready' });
    } catch (error: unknown) {
      session.exited = true;
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : error instanceof Error
            ? error.name
            : 'unknown';
      console.error(`[pty] spawn failed (${session.profile.kind}, ${code})`);
      this.send(session, { type: 'error', messageKey: 'sessionFailed' });
    }
  }

  private handleData(session: PtySession, data: string): void {
    const bytes = Buffer.byteLength(data, 'utf8');
    const seq = session.nextSequence++;
    session.pending.set(seq, bytes);
    session.outstandingBytes += bytes;
    this.send(session, { type: 'data', seq, bytes, data });
    if (!session.paused && session.outstandingBytes >= PAUSE_AT_BYTES) {
      session.pty?.pause();
      session.paused = true;
    }
  }

  private async updateCwd(session: PtySession, uri: string): Promise<void> {
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== 'file:') return;
      const allowedHosts = new Set([
        '',
        'localhost',
        process.env.COMPUTERNAME?.toLowerCase() ?? '',
        session.profile.wslDistro?.toLowerCase() ?? '',
      ]);
      if (!allowedHosts.has(parsed.hostname.toLowerCase())) return;
      const candidate =
        session.profile.kind === 'wsl'
          ? decodeURIComponent(parsed.pathname)
          : fileURLToPath(parsed);
      if (await this.profiles.isValidCwd(session.profile, candidate))
        session.currentCwd = candidate;
    } catch {
      // Invalid or untrusted OSC 7 values are ignored.
    }
  }

  private close(session: PtySession): void {
    if (!this.#sessions.delete(session.id)) return;
    try {
      session.pty?.kill();
    } catch {
      // The process may already have exited.
    }
    session.pty = undefined;
    try {
      session.port.close();
    } catch {
      // The renderer may already have closed the port.
    }
    this.onCountChanged(session.ownerId);
  }

  private onCountChanged(ownerId: number): void {
    this.countChanged(ownerId, this.count(ownerId));
  }

  private send(session: PtySession, message: PtyToRendererMessage): void {
    try {
      session.port.postMessage(message);
    } catch {
      this.close(session);
    }
  }

  private publicProfile(profile: InternalShellProfile): ShellProfileDescriptor {
    return {
      id: profile.id,
      label: profile.label,
      kind: profile.kind,
      ...(profile.wslDistro ? { wslDistro: profile.wslDistro } : {}),
    };
  }
}
