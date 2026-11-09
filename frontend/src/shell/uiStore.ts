import { create } from 'zustand';
import type { NoticeKind } from '../platform/types';

export interface Notice {
  id: number;
  kind: NoticeKind;
  text: string;
}

/** U-05: los avisos informativos se van solos. */
export const NOTICE_TIMEOUT = 5000;

interface UiState {
  notices: Notice[];
  notify: (text: string, kind?: NoticeKind) => void;
  dismiss: (id: number) => void;
  /** N-09 */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** U-06 */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** U-07 */
  contactLost: boolean;
  setContactLost: (lost: boolean) => void;
  /** R-45: se pidió actualizar y el servidor se está reiniciando. */
  updating: boolean;
  setUpdating: (updating: boolean) => void;
}

let nextNotice = 1;

export const useUi = create<UiState>((set, get) => ({
  notices: [],
  notify: (text, kind = 'info') => {
    const id = nextNotice++;
    set((s) => ({ notices: [...s.notices.filter((n) => n.text !== text), { id, kind, text }] }));
    if (kind === 'info') setTimeout(() => get().dismiss(id), NOTICE_TIMEOUT);
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  contactLost: false,
  setContactLost: (contactLost) => set({ contactLost }),
  updating: false,
  setUpdating: (updating) => set({ updating }),
}));
