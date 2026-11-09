import { installFakeServer, resetShell } from '../test/fakeServer';
import { flushShellState, LAST_ROUTE_KEY, MAX_OPEN, MAX_RECENT, PINNED_KEY, railItems, RECENT_KEY, useNav } from './navStore';

const nav = () => useNav.getState();

beforeEach(() => {
  resetShell();
});

describe('N-05 mini apps abiertas', () => {
  it('abrir monta y recuerda la subruta de cada una', () => {
    nav().activate('a', '/x');
    nav().activate('b', '');
    nav().activate('a', '/y');
    expect(nav().open).toEqual(['a', 'b']);
    expect(nav().paths).toEqual({ a: '/y', b: '' });
  });

  it(`con más de ${MAX_OPEN} se cierra la que lleva más tiempo sin usarse`, () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) nav().activate(id, '');
    nav().activate('a', '');
    nav().activate('f', '');
    expect(nav().open).toEqual(['a', 'c', 'd', 'e', 'f']);
    expect(nav().paths.b).toBeUndefined();
  });
});

describe('N-06 cerrar', () => {
  it('devuelve la abierta usada más recientemente o null', () => {
    nav().activate('a', '');
    nav().activate('b', '');
    nav().activate('c', '');
    nav().activate('b', '');
    expect(nav().close('b')).toBe('c');
    expect(nav().open).toEqual(['a', 'c']);
    expect(nav().close('c')).toBe('a');
    expect(nav().close('a')).toBeNull();
    expect(nav().close('a')).toBeNull();
  });
});

describe('L-04 fijadas y recientes', () => {
  it(`las recientes son las ${MAX_RECENT} últimas distintas, la más reciente primero`, () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) nav().activate(id, '');
    nav().activate('d', '');
    expect(nav().recent).toEqual(['d', 'g', 'f', 'e', 'c', 'b']);
  });

  it('las fijadas van en el orden en que se fijaron', () => {
    nav().togglePin('b');
    nav().togglePin('a');
    nav().togglePin('c');
    nav().togglePin('a');
    expect(nav().pinned).toEqual(['b', 'c']);
  });

  it('se guardan en la tabla setting y se recuperan', async () => {
    const server = installFakeServer();
    nav().togglePin('tasks');
    nav().activate('tasks', '');
    nav().setLastRoute('#/apps/tasks');
    await flushShellState();
    expect(server.settings).toEqual({ [PINNED_KEY]: ['tasks'], [RECENT_KEY]: ['tasks'], [LAST_ROUTE_KEY]: '#/apps/tasks' });
    resetShell();
    nav().hydrate(server.settings);
    expect(nav().pinned).toEqual(['tasks']);
    expect(nav().recent).toEqual(['tasks']);
    expect(nav().lastRoute).toBe('#/apps/tasks');
  });

  it('ignora valores guardados que no son listas de identificadores y los que ya no están en el catálogo', () => {
    nav().hydrate({ [PINNED_KEY]: ['a', 3, 'a', 'b'], [RECENT_KEY]: 'x' });
    expect(nav().pinned).toEqual(['a', 'b']);
    expect(nav().recent).toEqual([]);
    nav().prune(new Set(['b']));
    expect(nav().pinned).toEqual(['b']);
  });
});

describe('N-04 barra lateral', () => {
  it('Inicio, fijadas y abiertas sin fijar, sin repetir', () => {
    nav().togglePin('b');
    nav().togglePin('z');
    nav().activate('a', '');
    nav().activate('b', '');
    nav().activate('c', '');
    expect(railItems(nav(), new Set(['a', 'b', 'c']))).toEqual(['home', 'b', 'a', 'c']);
  });
});

describe('N-07 subtítulo', () => {
  it('solo lo tiene una mini app abierta y se olvida al cerrarla', () => {
    nav().setSubtitle('a', 'Lista');
    expect(nav().subtitles.a).toBeUndefined();
    nav().activate('a', '');
    nav().setSubtitle('a', 'Lista');
    expect(nav().subtitles.a).toBe('Lista');
    nav().close('a');
    expect(nav().subtitles.a).toBeUndefined();
  });
});
