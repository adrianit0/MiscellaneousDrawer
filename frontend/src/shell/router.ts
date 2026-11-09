import { create } from 'zustand';

/** N-01 */
export type Route = { kind: 'home' } | { kind: 'app'; appId: string; path: string };

export const HOME: Route = { kind: 'home' };

/** P-01 */
const APP_ID = /^[a-z][a-z0-9-]*[a-z0-9]$/;

/** Subruta de una mini app: '' o '/a/b', sin barra final ni segmentos vacíos. */
export function normalizeAppPath(path: string): string {
  const segments = path.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.includes('..')) throw new Error(`Subruta no válida: ${path}`);
  return segments.length === 0 ? '' : `/${segments.join('/')}`;
}

/** N-01: '#/', '#/apps/<id>' o '#/apps/<id>/<subruta>'; null si está mal formada. */
export function parseRoute(hash: string): Route | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '' || raw === '/') return HOME;
  let decoded: string;
  try {
    decoded = decodeURI(raw);
  } catch {
    return null;
  }
  const match = /^\/apps\/([^/]+)(\/.*)?$/.exec(decoded);
  if (!match || match[1].length > 32 || !APP_ID.test(match[1])) return null;
  try {
    return { kind: 'app', appId: match[1], path: normalizeAppPath(match[2] ?? '') };
  } catch {
    return null;
  }
}

export function formatRoute(route: Route): string {
  return route.kind === 'home' ? '#/' : `#/apps/${route.appId}${encodeURI(route.path)}`;
}

export function appRoute(appId: string, path = ''): Route {
  return { kind: 'app', appId, path: normalizeAppPath(path) };
}

export function sameRoute(a: Route | null, b: Route | null): boolean {
  if (!a || !b) return a === b;
  return formatRoute(a) === formatRoute(b);
}

interface RouterState {
  /** null: la ruta del fragmento está mal formada (N-01). */
  route: Route | null;
  /** N-02: cada navegación entra en el historial del navegador, salvo con replace. */
  navigate: (route: Route, options?: { replace?: boolean }) => void;
}

export const useRouter = create<RouterState>((set) => ({
  route: parseRoute(window.location.hash),
  navigate: (route, options = {}) => {
    const hash = formatRoute(route);
    if (options.replace) {
      window.history.replaceState(window.history.state, '', hash);
    } else if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    set({ route });
  },
}));

/** Sigue los cambios del fragmento: «Atrás», «Adelante» y enlaces (N-02). */
export function startRouter(): () => void {
  const sync = () => {
    const route = parseRoute(window.location.hash);
    if (!sameRoute(route, useRouter.getState().route) || route === null) useRouter.setState({ route });
  };
  sync();
  window.addEventListener('hashchange', sync);
  return () => window.removeEventListener('hashchange', sync);
}
