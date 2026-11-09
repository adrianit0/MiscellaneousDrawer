import { create } from 'zustand';
import { api, type Settings } from '../api';

/** N-05, ADR-0007 */
export const MAX_OPEN = 5;
/** L-04 */
export const MAX_RECENT = 6;
const PERSIST_DELAY = 400;

/** D-04: claves de la tabla setting. */
export const PINNED_KEY = 'shell.pinned';
export const RECENT_KEY = 'shell.recent';
export const LAST_ROUTE_KEY = 'shell.lastRoute';

interface NavState {
  /** N-04, N-05: mini apps montadas, en el orden en que se abrieron. */
  open: string[];
  /** Orden de último uso de cada abierta, para cerrar la que lleva más tiempo sin usarse (N-05). */
  lastUsed: Record<string, number>;
  /** N-05: última subruta de cada mini app abierta. */
  paths: Record<string, string>;
  /** N-07 */
  subtitles: Record<string, string | null>;
  /** L-04: en el orden en que se fijaron. */
  pinned: string[];
  /** L-04: la más reciente primero. */
  recent: string[];
  /** N-03 */
  lastRoute: string | null;
  hydrate: (settings: Settings) => void;
  /** L-04: olvida los identificadores que ya no están en el catálogo. */
  prune: (known: ReadonlySet<string>) => void;
  activate: (id: string, path: string) => void;
  setPath: (id: string, path: string) => void;
  /** N-06: devuelve la abierta usada más recientemente, o null. */
  close: (id: string) => string | null;
  togglePin: (id: string) => void;
  setSubtitle: (id: string, text: string | null) => void;
  setLastRoute: (hash: string) => void;
}

let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Settings = {};

function persist(changes: Settings) {
  pending = { ...pending, ...changes };
  clearTimeout(timer);
  timer = setTimeout(() => void flushShellState(), PERSIST_DELAY);
}

/** Guarda ya lo pendiente; al cerrar la ventana, con keepalive. */
export async function flushShellState(keepalive = false): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (Object.keys(pending).length === 0) return;
  const changes = pending;
  pending = {};
  try {
    await api.saveSettings(changes, { keepalive });
  } catch {
    pending = { ...changes, ...pending };
  }
}

function idList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string'))] : [];
}

export const useNav = create<NavState>((set, get) => ({
  open: [],
  lastUsed: {},
  paths: {},
  subtitles: {},
  pinned: [],
  recent: [],
  lastRoute: null,

  hydrate: (settings) =>
    set({
      pinned: idList(settings[PINNED_KEY]),
      recent: idList(settings[RECENT_KEY]).slice(0, MAX_RECENT),
      lastRoute: typeof settings[LAST_ROUTE_KEY] === 'string' ? (settings[LAST_ROUTE_KEY] as string) : null,
    }),

  prune: (known) =>
    set((s) => ({ pinned: s.pinned.filter((id) => known.has(id)), recent: s.recent.filter((id) => known.has(id)) })),

  activate: (id, path) => {
    const s = get();
    let open = s.open.includes(id) ? s.open : [...s.open, id];
    const lastUsed = { ...s.lastUsed, [id]: ++seq };
    const paths = { ...s.paths, [id]: path };
    const subtitles = { ...s.subtitles };
    // N-05: con más de MAX_OPEN se cierra la que lleva más tiempo sin usarse.
    while (open.length > MAX_OPEN) {
      const oldest = open.filter((o) => o !== id).reduce((a, b) => (lastUsed[a] <= lastUsed[b] ? a : b));
      open = open.filter((o) => o !== oldest);
      delete lastUsed[oldest];
      delete paths[oldest];
      delete subtitles[oldest];
    }
    const recent = [id, ...s.recent.filter((r) => r !== id)].slice(0, MAX_RECENT);
    const recentChanged = recent.join() !== s.recent.join();
    set({ open, lastUsed, paths, subtitles, recent });
    if (recentChanged) persist({ [RECENT_KEY]: recent });
  },

  setPath: (id, path) => set((s) => (s.open.includes(id) ? { paths: { ...s.paths, [id]: path } } : s)),

  close: (id) => {
    const s = get();
    if (!s.open.includes(id)) return null;
    const open = s.open.filter((o) => o !== id);
    const lastUsed = { ...s.lastUsed };
    const paths = { ...s.paths };
    const subtitles = { ...s.subtitles };
    delete lastUsed[id];
    delete paths[id];
    delete subtitles[id];
    set({ open, lastUsed, paths, subtitles });
    if (open.length === 0) return null;
    return open.reduce((a, b) => (lastUsed[a] >= lastUsed[b] ? a : b));
  },

  togglePin: (id) => {
    const pinned = get().pinned.includes(id) ? get().pinned.filter((p) => p !== id) : [...get().pinned, id];
    set({ pinned });
    persist({ [PINNED_KEY]: pinned });
  },

  setSubtitle: (id, text) =>
    set((s) => (s.subtitles[id] === text || !s.open.includes(id) ? s : { subtitles: { ...s.subtitles, [id]: text } })),

  setLastRoute: (hash) => {
    if (get().lastRoute === hash) return;
    set({ lastRoute: hash });
    persist({ [LAST_ROUTE_KEY]: hash });
  },
}));

/** N-04, N-10: elementos de la barra lateral en su orden; 'home' es Inicio. */
export function railItems(nav: Pick<NavState, 'pinned' | 'open'>, known: ReadonlySet<string>): string[] {
  const pinned = nav.pinned.filter((id) => known.has(id));
  const openUnpinned = nav.open.filter((id) => known.has(id) && !pinned.includes(id));
  return ['home', ...pinned, ...openUnpinned];
}

/** Solo para las pruebas. */
export function resetNav() {
  clearTimeout(timer);
  timer = undefined;
  pending = {};
  seq = 0;
  useNav.setState({ open: [], lastUsed: {}, paths: {}, subtitles: {}, pinned: [], recent: [], lastRoute: null });
}
