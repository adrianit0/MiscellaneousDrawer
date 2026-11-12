import { useEffect, useState } from 'react';
import { api } from './api';
import { flushAppStates } from './platform/appState';
import { startPresence } from './presence';
import { activeAppId, closeActiveApp, cycleRail, goHome, knownIds, openPinned } from './shell/actions';
import { AppHost } from './shell/AppHost';
import { useCatalog } from './shell/catalogStore';
import { CommandPalette } from './shell/CommandPalette';
import { matchShellShortcut } from './shell/keyboard';
import { Launcher } from './shell/Launcher';
import { flushShellState, useNav } from './shell/navStore';
import { Notices } from './shell/Notices';
import { useNotifications } from './shell/notificationStore';
import { Rail } from './shell/Rail';
import { formatRoute, HOME, parseRoute, startRouter, useRouter } from './shell/router';
import { SettingsDialog } from './shell/SettingsDialog';
import { TopBar } from './shell/TopBar';
import { useUi } from './shell/uiStore';

export const APP_TITLE = 'Cajón de sastre';

/** N-03: si la ventana se abre sin ruta, vuelve a la última visitada si su mini app sigue en el catálogo. */
function restoreRoute(openedWithoutRoute: boolean) {
  if (!openedWithoutRoute) return;
  const last = useNav.getState().lastRoute;
  const route = last ? parseRoute(last) : null;
  const valid = route?.kind === 'app' ? knownIds().has(route.appId) : route !== null;
  useRouter.getState().navigate(valid && route ? route : HOME, { replace: true });
}

/** Disposición de la ventana: barra superior, barra lateral y escenario (navegacion.md). */
export function App() {
  const route = useRouter((s) => s.route);
  const catalogStatus = useCatalog((s) => s.status);
  const apps = useCatalog((s) => s.apps);
  const paletteOpen = useUi((s) => s.paletteOpen);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const contactLost = useUi((s) => s.contactLost);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const openedWithoutRoute = window.location.hash === '' || window.location.hash === '#';
    const stopRouter = startRouter();
    const stopPresence = startPresence();
    const settings = api
      .settings()
      .then((s) => {
        useNav.getState().hydrate(s);
        useNotifications.getState().hydrate(s);
      })
      .catch(() => {});
    // N-11: las notificaciones guardadas; las nuevas llegan por el canal de presencia (P-23).
    void useNotifications.getState().load();
    void Promise.all([useCatalog.getState().load(), settings]).then(() => {
      if (useCatalog.getState().status === 'ready') useNav.getState().prune(knownIds());
      restoreRoute(openedWithoutRoute);
      setReady(true);
    });

    // N-10: atajos del shell, en toda la ventana.
    const onKeyDown = (e: KeyboardEvent) => {
      const action = matchShellShortcut(e);
      if (!action) return;
      e.preventDefault();
      switch (action.kind) {
        case 'palette':
          useUi.getState().setPaletteOpen(true);
          break;
        case 'home':
          goHome();
          break;
        case 'pinned':
          openPinned(action.index);
          break;
        case 'cycle':
          cycleRail(action.step);
          break;
        case 'close':
          closeActiveApp();
          break;
      }
    };
    // P-14, D-04: al cerrar la ventana se guarda lo pendiente.
    const onPageHide = () => {
      void flushShellState(true);
      void flushAppStates(true);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', onPageHide);
      stopRouter();
      stopPresence();
    };
  }, []);

  // N-01, N-03, N-05: cada ruta válida activa su mini app y queda como la última visitada.
  useEffect(() => {
    if (!ready) return;
    const navigate = useRouter.getState().navigate;
    if (route === null) {
      navigate(HOME, { replace: true });
      return;
    }
    if (route.kind === 'app') {
      if (catalogStatus !== 'ready') return;
      if (!apps.some((a) => a.id === route.appId)) {
        useUi.getState().notify(`La mini app «${route.appId}» no existe`, 'error');
        navigate(HOME, { replace: true });
        return;
      }
      useNav.getState().activate(route.appId, route.path);
    }
    useNav.getState().setLastRoute(formatRoute(route));
  }, [ready, route, catalogStatus, apps]);

  const activeId = ready ? activeAppId() : null;
  const active = apps.find((a) => a.id === activeId) ?? null;

  // N-08
  useEffect(() => {
    document.title = active ? `${active.name} · ${APP_TITLE}` : APP_TITLE;
  }, [active]);

  return (
    <div className="shell">
      <TopBar active={active} />
      {contactLost && (
        // U-07
        <div className="contact-banner" role="alert">
          Sin contacto con Cajón de sastre. Reintentando…
        </div>
      )}
      <div className="workspace">
        <Rail activeId={activeId} />
        <main className="stage">
          {!ready ? <p className="launcher-message muted">Cargando…</p> : !active && <Launcher />}
          <AppHost activeId={activeId} />
        </main>
      </div>
      {paletteOpen && <CommandPalette />}
      {settingsOpen && <SettingsDialog />}
      <Notices />
    </div>
  );
}
