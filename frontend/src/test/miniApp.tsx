import type { ReactNode } from 'react';
import { createAppApi } from '../platform/appApi';
import { MiniAppContext } from '../platform/context';
import type { MiniAppContextValue } from '../platform/types';

/** Contexto de una mini app de prueba, como el que da AppFrame. */
export function testContext(overrides: Partial<MiniAppContextValue> = {}): MiniAppContextValue {
  const id = overrides.id ?? 'demo';
  return {
    id,
    manifest: { id, name: 'Demo', description: 'Mini app de prueba', icon: 'app', color: 'blue', category: 'utilities', keywords: [] },
    active: true,
    path: '',
    navigate: () => {},
    api: createAppApi(id),
    notify: () => {},
    setSubtitle: () => {},
    showConsole: () => {},
    ...overrides,
  };
}

export function InApp({ value, children }: { value: MiniAppContextValue; children: ReactNode }) {
  return <MiniAppContext.Provider value={value}>{children}</MiniAppContext.Provider>;
}
