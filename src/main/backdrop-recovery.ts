export function initializeBackdropWithRetry<T>(
  initialize: () => T,
  cleanup: (error: unknown, attempt: number) => void,
): T {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return initialize();
    } catch (error: unknown) {
      lastError = error;
      cleanup(error, attempt);
    }
  }
  throw lastError;
}

export class OneShotBackdropRecovery {
  #attempted = false;

  get attempted(): boolean {
    return this.#attempted;
  }

  run<T>(rebuild: () => T): T {
    if (this.#attempted) throw new Error('The one permitted backdrop rebuild was exhausted.');
    this.#attempted = true;
    return rebuild();
  }
}
