import { describe, expect, it, vi } from 'vitest';
import {
  initializeBackdropWithRetry,
  OneShotBackdropRecovery,
} from '../../src/main/backdrop-recovery';

describe('native backdrop recovery policy', () => {
  it('allows exactly two startup attempts and cleans up each rejection', () => {
    const failure = new Error('attach failed');
    const initialize = vi.fn(() => {
      throw failure;
    });
    const cleanup = vi.fn();
    expect(() => initializeBackdropWithRetry(initialize, cleanup)).toThrow(failure);
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenNthCalledWith(1, failure, 1);
    expect(cleanup).toHaveBeenNthCalledWith(2, failure, 2);
  });

  it('returns a successful retry without a third attempt', () => {
    const initialize = vi
      .fn<() => string>()
      .mockImplementationOnce(() => {
        throw new Error('first attempt');
      })
      .mockReturnValue('active');
    expect(initializeBackdropWithRetry(initialize, vi.fn())).toBe('active');
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('permits only one runtime rebuild even when it succeeds', () => {
    const recovery = new OneShotBackdropRecovery();
    expect(recovery.run(() => 'active')).toBe('active');
    expect(recovery.attempted).toBe(true);
    expect(() => recovery.run(() => 'active')).toThrow(/one permitted backdrop rebuild/);
  });
});
