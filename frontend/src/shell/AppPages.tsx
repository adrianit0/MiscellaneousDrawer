import type { CatalogApp } from '../api';
import { Icon } from './Icon';

/** Cabecera común de las páginas que el shell pinta en nombre de una mini app. */
function AppHeading({ app }: { app: CatalogApp }) {
  return (
    <div className="app-page-heading">
      <span className="app-tile app-tile-large" data-color={app.color}>
        <Icon name={app.icon} />
      </span>
      <div>
        <h1>{app.name}</h1>
        <p className="muted">{app.description}</p>
      </div>
    </div>
  );
}

/** L-05 */
export function PlannedPage({ app }: { app: CatalogApp }) {
  return (
    <div className="app-page">
      <AppHeading app={app} />
      <p className="badge badge-planned">En preparación</p>
      <p>Esta mini app aún no está disponible. Llegará en una versión próxima.</p>
    </div>
  );
}

/** L-06 */
export function FailedPage({ app }: { app: CatalogApp }) {
  return (
    <div className="app-page" role="alert">
      <AppHeading app={app} />
      <h2 className="error-text">No se pudo arrancar «{app.name}»</h2>
      {app.error && <p className="mono app-error-message">{app.error}</p>}
      <p className="muted">
        El detalle está en el registro: <code>~/.local/state/cajonsastre/cajonsastre.log</code>
      </p>
    </div>
  );
}

/** P-11 */
export function MissingUiPage({ app }: { app: CatalogApp }) {
  return (
    <div className="app-page" role="alert">
      <AppHeading app={app} />
      <h2 className="error-text">Esta mini app no tiene interfaz</h2>
      <p className="muted">
        Falta <code>frontend/src/apps/{app.id}/index.tsx</code>.
      </p>
    </div>
  );
}
