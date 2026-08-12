import type { PreloadApi } from '../shared/contracts';

declare global {
  interface Window {
    liquidGlass: PreloadApi;
  }
}

export {};
