import { create } from 'zustand';
import { api, type Settings, type ShellNotification } from '../api';

/** D-04, N-12: clave de la tabla setting con el identificador de la última notificación vista. */
export const SEEN_KEY = 'shell.notificationsSeen';
/** P-22 */
export const MAX_NOTIFICATIONS = 50;

interface NotificationState {
  /** P-22: de la más reciente a la más antigua. */
  items: ShellNotification[];
  /** N-12: las de identificador mayor están sin leer. */
  seen: number;
  hydrate: (settings: Settings) => void;
  /** Al abrir la ventana y al recuperar el contacto (U-07). */
  load: () => Promise<void>;
  /** P-23: una notificación nueva del canal de eventos. */
  add: (notification: ShellNotification) => void;
  /** N-12: todas las que hay pasan a estar leídas. */
  markSeen: () => void;
  /** N-13: «Limpiar todo». Lanza el error si el servidor no las borra. */
  clear: () => Promise<void>;
}

export const useNotifications = create<NotificationState>((set, get) => ({
  items: [],
  seen: 0,

  hydrate: (settings) => {
    const seen = settings[SEEN_KEY];
    if (typeof seen === 'number' && seen > get().seen) set({ seen });
  },

  load: async () => {
    try {
      set({ items: await api.notifications() });
    } catch {
      // Se quedan las que había; se volverán a pedir al recuperar el contacto.
    }
  },

  add: (notification) =>
    set((s) =>
      s.items.some((n) => n.id === notification.id)
        ? s
        : { items: [notification, ...s.items].sort((a, b) => b.id - a.id).slice(0, MAX_NOTIFICATIONS) },
    ),

  markSeen: () => {
    const latest = get().items.reduce((max, n) => Math.max(max, n.id), 0);
    if (latest <= get().seen) return;
    set({ seen: latest });
    void api.saveSettings({ [SEEN_KEY]: latest }).catch(() => {});
  },

  clear: async () => {
    await api.clearNotifications();
    set({ items: [] });
  },
}));

/** N-12: cuántas de estas notificaciones están sin leer. */
export function unreadCount(items: readonly ShellNotification[], seen: number): number {
  return items.filter((n) => n.id > seen).length;
}
