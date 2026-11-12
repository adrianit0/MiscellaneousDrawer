import { create } from 'zustand';
import { api, type Settings, type ShellConsole } from '../api';

/** D-04, N-14, N-16: claves de la tabla setting. */
export const OPEN_KEY = 'shell.consoleOpen';
export const HEIGHT_KEY = 'shell.consoleHeight';

/** N-16 */
export const MIN_HEIGHT = 120;
export const DEFAULT_HEIGHT = 260;
export const MAX_HEIGHT_RATIO = 0.7;
export const HEIGHT_STEP = 24;

/** N-16: entre 120 px y el 70 % del alto de la ventana. */
export function clampHeight(height: number): number {
  const max = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight * MAX_HEIGHT_RATIO));
  return Math.round(Math.min(Math.max(height, MIN_HEIGHT), max));
}

interface ConsoleStoreState {
  /** P-27: de la más reciente a la más antigua. */
  items: ShellConsole[];
  /** N-14: el panel está desplegado. */
  open: boolean;
  /** N-16 */
  height: number;
  /** N-15: la consola elegida; null, la más reciente. */
  selected: number | null;
  hydrate: (settings: Settings) => void;
  /** Al abrir la ventana y al recuperar el contacto (U-07). */
  load: () => Promise<void>;
  /** P-28: la lista entera, del canal de eventos. */
  set: (items: ShellConsole[]) => void;
  /** N-14: despliega o recoge el panel, y lo guarda. */
  setOpen: (open: boolean) => void;
  select: (id: number) => void;
  /** P-12: despliega el panel con esa consola elegida. */
  show: (id: number) => void;
  /** N-16: mientras se arrastra no se guarda. */
  setHeight: (height: number) => void;
  saveHeight: () => void;
  /** N-17: «Limpiar terminadas». Lanza el error si el servidor no las descarta. */
  clear: () => Promise<void>;
}

function save(changes: Settings) {
  void api.saveSettings(changes).catch(() => {});
}

export const useConsoles = create<ConsoleStoreState>((set, get) => ({
  items: [],
  open: false,
  height: DEFAULT_HEIGHT,
  selected: null,

  hydrate: (settings) => {
    const height = settings[HEIGHT_KEY];
    set({
      open: settings[OPEN_KEY] === true,
      height: typeof height === 'number' && Number.isFinite(height) ? clampHeight(height) : DEFAULT_HEIGHT,
    });
  },

  load: async () => {
    try {
      set({ items: await api.consoles() });
    } catch {
      // Se quedan las que había; se volverán a pedir al recuperar el contacto.
    }
  },

  set: (items) => set({ items }),

  setOpen: (open) => {
    if (get().open === open) return;
    set({ open });
    save({ [OPEN_KEY]: open });
  },

  select: (id) => set({ selected: id }),

  show: (id) => {
    set({ selected: id });
    get().setOpen(true);
  },

  setHeight: (height) => set({ height: clampHeight(height) }),

  saveHeight: () => save({ [HEIGHT_KEY]: get().height }),

  clear: async () => {
    set({ items: await api.clearConsoles() });
  },
}));

/** Solo para las pruebas. */
export function resetConsoles() {
  useConsoles.setState({ items: [], open: false, height: DEFAULT_HEIGHT, selected: null });
}
