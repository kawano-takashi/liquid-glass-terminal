import { screen, type BrowserWindow, type Rectangle } from 'electron';
import Store from 'electron-store';

interface PersistedWindowState extends Rectangle {
  maximized: boolean;
}

const DEFAULT_WINDOW_STATE: PersistedWindowState = {
  x: 80,
  y: 80,
  width: 1100,
  height: 720,
  maximized: false,
};

export class WindowStateStore {
  readonly #store = new Store<PersistedWindowState>({
    name: 'window-state',
    defaults: DEFAULT_WINDOW_STATE,
    schema: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number', minimum: 720 },
      height: { type: 'number', minimum: 420 },
      maximized: { type: 'boolean' },
    },
    clearInvalidConfig: true,
  });
  #timer?: NodeJS.Timeout;

  restore(): PersistedWindowState {
    const state = { ...DEFAULT_WINDOW_STATE, ...this.#store.store };
    const display = screen.getDisplayMatching(state);
    const area = display.workArea;
    const width = Math.min(Math.max(state.width, 720), area.width);
    const height = Math.min(Math.max(state.height, 420), area.height);
    const x = Math.min(Math.max(state.x, area.x), area.x + area.width - width);
    const y = Math.min(Math.max(state.y, area.y), area.y + area.height - height);
    return { x, y, width, height, maximized: state.maximized };
  }

  track(window: BrowserWindow): void {
    const schedule = () => {
      if (this.#timer) clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.save(window), 250);
    };
    window.on('resize', schedule);
    window.on('move', schedule);
    window.on('maximize', schedule);
    window.on('unmaximize', schedule);
    window.on('close', () => this.save(window));
  }

  private save(window: BrowserWindow): void {
    if (window.isDestroyed() || window.isMinimized()) return;
    const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
    this.#store.store = { ...bounds, maximized: window.isMaximized() };
  }
}
