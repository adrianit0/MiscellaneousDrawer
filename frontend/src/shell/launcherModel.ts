import { formatDateTime } from './NotificationBell';

/** L-10: posición en pantalla de cada tarjeta, en su orden. */
export interface CardBox {
  left: number;
  top: number;
}

/** Dos tarjetas con menos diferencia de altura que esta están en la misma fila. */
const ROW_TOLERANCE = 4;

/**
 * L-10: a qué tarjeta lleva cada flecha. ↑ y ↓ eligen, en la fila de arriba o de abajo, la que esté más cerca en
 * horizontal, así que vale para cualquier número de columnas. ↑ en la primera fila devuelve 'search'; null es no moverse.
 */
export function cardTarget(boxes: readonly CardBox[], index: number, key: string): number | 'search' | null {
  const last = boxes.length - 1;
  if (index < 0 || index > last) return null;
  switch (key) {
    case 'ArrowLeft':
      return index > 0 ? index - 1 : null;
    case 'ArrowRight':
      return index < last ? index + 1 : null;
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'ArrowUp':
    case 'ArrowDown': {
      const here = boxes[index];
      const down = key === 'ArrowDown';
      const others = boxes
        .map((b, i) => ({ ...b, i }))
        .filter((b) => (down ? b.top > here.top + ROW_TOLERANCE : b.top < here.top - ROW_TOLERANCE));
      if (others.length === 0) return down ? null : 'search';
      const rowTop = down ? Math.min(...others.map((b) => b.top)) : Math.max(...others.map((b) => b.top));
      const row = others.filter((b) => Math.abs(b.top - rowTop) <= ROW_TOLERANCE);
      return row.reduce((a, b) => (Math.abs(b.left - here.left) < Math.abs(a.left - here.left) ? b : a)).i;
    }
    default:
      return null;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** L-02: cuándo se abrió una reciente; desde las 24 h, la fecha (U-02). */
export function formatAgo(at: number, now: number): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return 'Ahora';
  if (elapsed < HOUR) return `Hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `Hace ${Math.floor(elapsed / HOUR)} h`;
  return formatDateTime(new Date(at).toISOString());
}

/**
 * L-08: lo que muestra la pestaña «Fijadas». Sigue el orden de las fijadas, pero las que se desfijaron mientras
 * estaba abierta se quedan en el sitio que tenían.
 */
export function mergePinnedView(previous: readonly string[], pinned: readonly string[]): string[] {
  const view = [...pinned];
  previous.forEach((id, index) => {
    if (!pinned.includes(id)) view.splice(Math.min(index, view.length), 0, id);
  });
  return view;
}

/** L-08: al volver a fijar desde «Fijadas», la posición entre las fijadas que le corresponde por su sitio. */
export function pinnedIndexInView(view: readonly string[], pinned: readonly string[], id: string): number {
  return view.slice(0, view.indexOf(id)).filter((v) => pinned.includes(v)).length;
}
