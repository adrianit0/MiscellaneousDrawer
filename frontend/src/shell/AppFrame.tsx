import { Component, lazy, Suspense, useContext, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import type { CatalogApp } from '../api';
import { createAppApi } from '../platform/appApi';
import { MiniAppContext } from '../platform/context';
import type { MiniAppContextValue } from '../platform/types';
import { navigateInApp } from './actions';
import { FailedPage, MissingUiPage, PlannedPage } from './AppPages';
import { useConsoles } from './consoleStore';
import { useNav } from './navStore';
import { ModuleRegistryContext } from './registry';
import { useUi } from './uiStore';

interface BoundaryProps {
  name: string;
  onRetry: () => void;
  children: ReactNode;
}

/** P-15: un error al pintar o al cargar una mini app se queda en su marco. */
class AppErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`La mini app «${this.props.name}» ha fallado`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-page" role="alert">
        <h2 className="error-text">«{this.props.name}» ha fallado</h2>
        <p className="mono app-error-message">{this.state.error.message || String(this.state.error)}</p>
        <button type="button" onClick={this.props.onRetry}>
          Reintentar
        </button>
      </div>
    );
  }
}

/**
 * Marco de una mini app abierta (P-11, P-12, P-15, N-05): la carga bajo demanda, le da su contexto, la aísla de los
 * errores y la oculta sin desmontarla cuando no está activa.
 */
export function AppFrame({ app, active }: { app: CatalogApp; active: boolean }) {
  const registry = useContext(ModuleRegistryContext);
  const path = useNav((s) => s.paths[app.id] ?? '');
  const [attempt, setAttempt] = useState(0);
  const loader = app.status === 'available' ? registry[app.id] : undefined;

  // Un lazy nuevo en cada intento: «Reintentar» vuelve a descargar si falló la carga (P-15).
  const Root = useMemo<ComponentType | null>(
    () => (loader ? lazy(() => loader().then((m) => ({ default: m.default.Root }))) : null),
    // attempt fuerza un lazy nuevo.
    [loader, attempt],
  );
  const api = useMemo(() => createAppApi(app.id), [app.id]);
  const context = useMemo<MiniAppContextValue>(
    () => ({
      id: app.id,
      manifest: {
        id: app.id,
        name: app.name,
        description: app.description,
        icon: app.icon,
        color: app.color,
        category: app.category,
        keywords: app.keywords,
      },
      active,
      path,
      navigate: (to, options) => navigateInApp(app.id, to, options),
      api,
      notify: (text, kind) => useUi.getState().notify(text, kind),
      setSubtitle: (text) => useNav.getState().setSubtitle(app.id, text),
      showConsole: (id) => useConsoles.getState().show(id),
    }),
    [app, active, path, api],
  );

  let content: ReactNode;
  if (app.status === 'planned') content = <PlannedPage app={app} />;
  else if (app.status === 'failed') content = <FailedPage app={app} />;
  else if (!Root) content = <MissingUiPage app={app} />;
  else
    content = (
      <AppErrorBoundary key={attempt} name={app.name} onRetry={() => setAttempt((a) => a + 1)}>
        <Suspense fallback={<p className="app-loading muted">Cargando {app.name}…</p>}>
          <MiniAppContext.Provider value={context}>
            <Root />
          </MiniAppContext.Provider>
        </Suspense>
      </AppErrorBoundary>
    );

  return (
    <section className="app-frame" hidden={!active} aria-label={app.name} data-app={app.id}>
      {content}
    </section>
  );
}
