import { createContext, useContext } from 'react';
import type { MiniAppContextValue } from './types';

/** P-12: el marco de cada mini app lo proporciona (shell/AppFrame.tsx). */
export const MiniAppContext = createContext<MiniAppContextValue | null>(null);

/** P-12: el contexto de la mini app que se está pintando. */
export function useMiniApp(): MiniAppContextValue {
  const value = useContext(MiniAppContext);
  if (!value) throw new Error('useMiniApp solo se puede usar dentro de una mini app');
  return value;
}
