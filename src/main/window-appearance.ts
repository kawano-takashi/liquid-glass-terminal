import type {
  BackdropFailureCode,
  NativeBackdropState,
  SystemAppearance,
} from '../shared/contracts';

export interface BackdropAppearanceInput {
  nativeState?: NativeBackdropState;
  failureCode?: BackdropFailureCode;
  systemAppearance: SystemAppearance;
  screenReaderMode: boolean;
}

export interface ResolvedBackdropAppearance {
  backdropMode: 'frosted' | 'opaque';
  backdropStatus: 'active' | 'policy-disabled' | 'runtime-failure';
  backdropFailureCode?: BackdropFailureCode;
}

export function resolveBackdropAppearance(
  input: BackdropAppearanceInput,
): ResolvedBackdropAppearance {
  if (input.failureCode || input.nativeState === 'capability-lost') {
    return {
      backdropMode: 'opaque',
      backdropStatus: 'runtime-failure',
      backdropFailureCode: input.failureCode ?? 'runtime-rebuild-failed',
    };
  }
  if (
    input.systemAppearance.highContrast ||
    input.systemAppearance.reducedTransparency ||
    input.screenReaderMode ||
    input.nativeState === 'policy-disabled'
  ) {
    return { backdropMode: 'opaque', backdropStatus: 'policy-disabled' };
  }
  return { backdropMode: 'frosted', backdropStatus: 'active' };
}
