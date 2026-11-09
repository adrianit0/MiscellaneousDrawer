import { appRoute, formatRoute, HOME, normalizeAppPath, parseRoute, startRouter, useRouter } from './router';

describe('N-01 rutas en el fragmento', () => {
  it.each([
    ['', HOME],
    ['#', HOME],
    ['#/', HOME],
    ['#/apps/tasks', { kind: 'app', appId: 'tasks', path: '' }],
    ['#/apps/tasks/', { kind: 'app', appId: 'tasks', path: '' }],
    ['#/apps/tasks/lista/42', { kind: 'app', appId: 'tasks', path: '/lista/42' }],
    ['#/apps/json-tools/a//b/', { kind: 'app', appId: 'json-tools', path: '/a/b' }],
    ['#/apps/tasks/b%C3%BAsqueda', { kind: 'app', appId: 'tasks', path: '/búsqueda' }],
  ])('%s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it.each(['#/ajustes', '#/apps', '#/apps/', '#/apps/Tasks', '#/apps/t', '#/apps/tasks-/x', '#/apps/tasks/../catalog', '#/apps/%E0%A4%A', `#/apps/${'a'.repeat(33)}`])(
    'una ruta mal formada (%s) no es válida',
    (hash) => {
      expect(parseRoute(hash)).toBeNull();
    },
  );

  it('forma la ruta y vuelve a leerla igual', () => {
    for (const route of [HOME, appRoute('tasks'), appRoute('tasks', '/lista/42'), appRoute('tasks', 'búsqueda/ñ')]) {
      expect(parseRoute(formatRoute(route))).toEqual(route);
    }
    expect(formatRoute(appRoute('tasks', '/a/'))).toBe('#/apps/tasks/a');
  });

  it('normaliza la subruta y rechaza ..', () => {
    expect(normalizeAppPath('')).toBe('');
    expect(normalizeAppPath('/')).toBe('');
    expect(normalizeAppPath('lista/')).toBe('/lista');
    expect(normalizeAppPath('/./a//b')).toBe('/a/b');
    expect(() => normalizeAppPath('/a/../b')).toThrow('Subruta no válida');
  });
});

describe('N-02 historial del navegador', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    useRouter.setState({ route: HOME });
  });

  it('cada navegación entra en el historial y replace la sustituye', () => {
    const before = window.history.length;
    useRouter.getState().navigate(appRoute('tasks'));
    expect(window.location.hash).toBe('#/apps/tasks');
    expect(window.history.length).toBe(before + 1);
    useRouter.getState().navigate(appRoute('tasks', '/lista'), { replace: true });
    expect(window.location.hash).toBe('#/apps/tasks/lista');
    expect(window.history.length).toBe(before + 1);
    expect(useRouter.getState().route).toEqual(appRoute('tasks', '/lista'));
  });

  it('sigue los cambios del fragmento, como Atrás y Adelante', () => {
    const stop = startRouter();
    window.history.replaceState(null, '', '#/apps/database/x');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(useRouter.getState().route).toEqual(appRoute('database', '/x'));
    window.history.replaceState(null, '', '#/no-existe');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(useRouter.getState().route).toBeNull();
    stop();
  });
});
