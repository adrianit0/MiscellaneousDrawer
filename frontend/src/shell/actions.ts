import type { NavigateOptions } from '../platform/types';
import { useCatalog } from './catalogStore';
import { railItems, useNav } from './navStore';
import { appRoute, HOME, normalizeAppPath, useRouter } from './router';

/** La mini app activa: la de la ruta, si está en el catálogo. */
export function activeAppId(): string | null {
  const route = useRouter.getState().route;
  if (route?.kind !== 'app') return null;
  const catalog = useCatalog.getState();
  return catalog.status === 'ready' && catalog.apps.some((a) => a.id === route.appId) ? route.appId : null;
}

/** N-05: una mini app abierta vuelve a su última subruta. */
export function openApp(id: string) {
  useRouter.getState().navigate(appRoute(id, useNav.getState().paths[id] ?? ''));
}

export function goHome() {
  useRouter.getState().navigate(HOME);
}

/** N-06: cierra la activa y muestra la abierta usada más recientemente o Inicio. */
export function closeActiveApp() {
  const id = activeAppId();
  if (!id) return;
  const next = useNav.getState().close(id);
  if (next) openApp(next);
  else goHome();
}

/** N-10: Alt+1 a Alt+9. */
export function openPinned(index: number) {
  const known = knownIds();
  const id = useNav.getState().pinned.filter((p) => known.has(p))[index];
  if (id) openApp(id);
}

/** N-10: Alt+RePág y Alt+AvPág recorren la barra lateral de forma circular. */
export function cycleRail(step: 1 | -1) {
  const items = railItems(useNav.getState(), knownIds());
  const current = activeAppId() ?? 'home';
  const index = Math.max(0, items.indexOf(current));
  const next = items[(index + step + items.length) % items.length];
  if (next === 'home') goHome();
  else openApp(next);
}

/** P-12: navigate de una mini app. Una oculta solo cambia su subruta guardada, sin quitar el foco a la visible. */
export function navigateInApp(id: string, path: string, options: NavigateOptions = {}) {
  const normalized = normalizeAppPath(path);
  if (activeAppId() === id) useRouter.getState().navigate(appRoute(id, normalized), options);
  else useNav.getState().setPath(id, normalized);
}

export function knownIds(): Set<string> {
  return new Set(useCatalog.getState().apps.map((a) => a.id));
}
