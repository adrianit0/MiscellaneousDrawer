import { create } from 'zustand';
import { api, type CatalogApp } from '../api';

interface CatalogState {
  apps: CatalogApp[];
  status: 'loading' | 'ready' | 'error';
  /** L-07 */
  error: string | null;
  load: () => Promise<void>;
}

/** P-04: el catálogo con el estado de cada mini app. */
export const useCatalog = create<CatalogState>((set) => ({
  apps: [],
  status: 'loading',
  error: null,
  load: async () => {
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading', error: null }));
    try {
      const apps = await api.catalog();
      set({ apps, status: 'ready', error: null });
    } catch (e) {
      set((s) => (s.status === 'ready' ? s : { status: 'error', error: (e as Error).message }));
    }
  },
}));

export function findApp(id: string | null | undefined): CatalogApp | undefined {
  return id ? useCatalog.getState().apps.find((a) => a.id === id) : undefined;
}
