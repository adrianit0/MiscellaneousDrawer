import { createContext } from 'react';
import type { MiniAppModule } from '../platform/types';

export type ModuleLoader = () => Promise<{ default: MiniAppModule }>;
export type ModuleRegistry = Readonly<Record<string, ModuleLoader>>;

/** '../apps/tasks/index.tsx' → 'tasks' */
export function appIdFromModulePath(path: string): string | null {
  return /\/apps\/([^/]+)\/index\.tsx$/.exec(path)?.[1] ?? null;
}

export function registryFrom(modules: Record<string, ModuleLoader>): ModuleRegistry {
  const out: Record<string, ModuleLoader> = {};
  for (const [path, loader] of Object.entries(modules)) {
    const id = appIdFromModulePath(path);
    if (id) out[id] = loader;
  }
  return out;
}

/**
 * P-11: la interfaz de cada mini app, localizada por convención en src/apps/<id>/index.tsx. import.meta.glob sin
 * eager genera un fichero aparte por mini app, que solo se descarga al abrirla (ADR-0005).
 */
export const appModules: ModuleRegistry = registryFrom(import.meta.glob<{ default: MiniAppModule }>('../apps/*/index.tsx'));

/** Las pruebas sustituyen el registro por mini apps de prueba. */
export const ModuleRegistryContext = createContext<ModuleRegistry>(appModules);
