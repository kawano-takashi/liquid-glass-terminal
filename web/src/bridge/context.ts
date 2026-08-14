import { createContext, useContext } from 'react';
import type { NativeBridge } from './NativeBridge';

export const BridgeContext = createContext<NativeBridge | undefined>(undefined);

export function useBridge(): NativeBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error('Native bridge is unavailable.');
  return bridge;
}
