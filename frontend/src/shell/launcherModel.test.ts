import { cardTarget, formatAgo, mergePinnedView, pinnedIndexInView } from './launcherModel';
import { formatDateTime } from './NotificationBell';

describe('L-10 flechas en la rejilla de tarjetas', () => {
  // Tres columnas: 0 1 2 / 3 4 5 / 6 7
  const grid = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ left: (i % 3) * 300, top: Math.floor(i / 3) * 100 }));

  it('← y → llevan a la anterior y a la siguiente, sin dar la vuelta', () => {
    expect(cardTarget(grid, 4, 'ArrowLeft')).toBe(3);
    expect(cardTarget(grid, 4, 'ArrowRight')).toBe(5);
    expect(cardTarget(grid, 0, 'ArrowLeft')).toBeNull();
    expect(cardTarget(grid, 7, 'ArrowRight')).toBeNull();
  });

  it('↑ y ↓ llevan a la de la misma columna en la fila de al lado, o a la más cercana', () => {
    expect(cardTarget(grid, 1, 'ArrowDown')).toBe(4);
    expect(cardTarget(grid, 4, 'ArrowUp')).toBe(1);
    expect(cardTarget(grid, 5, 'ArrowDown')).toBe(7);
    expect(cardTarget(grid, 6, 'ArrowDown')).toBeNull();
  });

  it('↑ en la primera fila vuelve al buscador', () => {
    expect(cardTarget(grid, 2, 'ArrowUp')).toBe('search');
  });

  it('Inicio y Fin llevan a la primera y a la última; otras teclas no mueven', () => {
    expect(cardTarget(grid, 4, 'Home')).toBe(0);
    expect(cardTarget(grid, 4, 'End')).toBe(7);
    expect(cardTarget(grid, 4, 'a')).toBeNull();
    expect(cardTarget([], 0, 'ArrowDown')).toBeNull();
  });

  it('tolera unos píxeles de diferencia dentro de la misma fila', () => {
    const uneven = [
      { left: 0, top: 0 },
      { left: 300, top: 2 },
      { left: 0, top: 100 },
    ];
    expect(cardTarget(uneven, 1, 'ArrowUp')).toBe('search');
    expect(cardTarget(uneven, 1, 'ArrowDown')).toBe(2);
  });
});

describe('L-02 cuándo se abrió una reciente', () => {
  const now = Date.UTC(2026, 10, 25, 12, 0);

  it('«Ahora», «Hace N min», «Hace N h» y, desde las 24 h, la fecha', () => {
    expect(formatAgo(now - 30_000, now)).toBe('Ahora');
    expect(formatAgo(now + 5_000, now)).toBe('Ahora');
    expect(formatAgo(now - 60_000, now)).toBe('Hace 1 min');
    expect(formatAgo(now - 59 * 60_000, now)).toBe('Hace 59 min');
    expect(formatAgo(now - 60 * 60_000, now)).toBe('Hace 1 h');
    expect(formatAgo(now - 23 * 3_600_000, now)).toBe('Hace 23 h');
    const old = now - 24 * 3_600_000;
    expect(formatAgo(old, now)).toBe(formatDateTime(new Date(old).toISOString()));
  });
});

describe('L-08 la pestaña «Fijadas» no mueve nada', () => {
  it('las desfijadas se quedan en su sitio', () => {
    expect(mergePinnedView(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
    expect(mergePinnedView(['a', 'b', 'c'], ['c'])).toEqual(['a', 'b', 'c']);
    expect(mergePinnedView(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });

  it('sigue el orden nuevo de las fijadas y añade al final las nuevas', () => {
    expect(mergePinnedView(['a', 'b', 'c'], ['b', 'a', 'c'])).toEqual(['b', 'a', 'c']);
    expect(mergePinnedView(['a', 'b'], ['a', 'b', 'd'])).toEqual(['a', 'b', 'd']);
  });

  it('volver a fijar la coloca entre las fijadas según su sitio en la pestaña', () => {
    expect(pinnedIndexInView(['a', 'b', 'c'], ['a', 'c'], 'b')).toBe(1);
    expect(pinnedIndexInView(['a', 'b', 'c'], ['b', 'c'], 'a')).toBe(0);
    expect(pinnedIndexInView(['a', 'b', 'c'], ['a', 'b'], 'c')).toBe(2);
  });
});
