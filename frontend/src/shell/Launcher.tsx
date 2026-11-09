import { useEffect, useRef, useState } from 'react';
import type { CatalogApp } from '../api';
import { openApp } from './actions';
import { useCatalog } from './catalogStore';
import { Icon } from './Icon';
import { useNav } from './navStore';
import { byName, CATEGORIES, matchesApp } from './search';

/** L-02 */
function AppCard({ app }: { app: CatalogApp }) {
  const pinned = useNav((s) => s.pinned.includes(app.id));
  return (
    <li className="app-card">
      <button type="button" className="app-card-open" onClick={() => openApp(app.id)}>
        <span className="app-tile" data-color={app.color}>
          <Icon name={app.icon} />
        </span>
        <span className="app-card-text">
          <span className="app-card-title">
            <span className="app-card-name">{app.name}</span>
            {app.status === 'planned' && <span className="badge badge-planned">En preparación</span>}
            {app.status === 'failed' && <span className="badge badge-error">Error</span>}
          </span>
          <span className="app-card-description muted">{app.description}</span>
        </span>
      </button>
      <button
        type="button"
        className="app-card-pin icon-button"
        aria-pressed={pinned}
        aria-label={pinned ? `Desfijar ${app.name}` : `Fijar ${app.name}`}
        title={pinned ? 'Desfijar' : 'Fijar'}
        onClick={() => useNav.getState().togglePin(app.id)}
      >
        {pinned ? '★' : '☆'}
      </button>
    </li>
  );
}

function Section({ title, apps }: { title: string; apps: CatalogApp[] }) {
  const id = `launcher-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section className="launcher-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="app-grid">
        {apps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </ul>
    </section>
  );
}

/** L-01 a L-07: «Inicio». */
export function Launcher() {
  const apps = useCatalog((s) => s.apps);
  const status = useCatalog((s) => s.status);
  const error = useCatalog((s) => s.error);
  const pinnedIds = useNav((s) => s.pinned);
  const recentIds = useNav((s) => s.recent);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const byId = new Map(apps.map((a) => [a.id, a]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((a): a is CatalogApp => a !== undefined);
  const results = query.trim() ? byName(apps.filter((a) => matchesApp(a, query))) : [];

  let body;
  if (status === 'error') {
    body = (
      <div className="launcher-message" role="alert">
        <p className="error-text">No se pudo cargar el catálogo: {error}</p>
        <button type="button" onClick={() => void useCatalog.getState().load()}>
          Reintentar
        </button>
      </div>
    );
  } else if (status === 'loading') {
    body = <p className="launcher-message muted">Cargando…</p>;
  } else if (query.trim()) {
    body =
      results.length > 0 ? (
        <Section title="Resultados" apps={results} />
      ) : (
        <p className="launcher-message muted">Ninguna mini app coincide con «{query.trim()}»</p>
      );
  } else {
    const pinned = pick(pinnedIds);
    const recent = pick(recentIds);
    body = (
      <>
        {pinned.length > 0 && <Section title="Fijadas" apps={pinned} />}
        {recent.length > 0 && <Section title="Recientes" apps={recent} />}
        <section className="launcher-section" aria-labelledby="launcher-todas">
          <h2 id="launcher-todas">Todas</h2>
          {CATEGORIES.map((c) => {
            const group = byName(apps.filter((a) => a.category === c.id));
            if (group.length === 0) return null;
            return (
              <section key={c.id} className="launcher-group" aria-labelledby={`launcher-cat-${c.id}`}>
                <h3 id={`launcher-cat-${c.id}`}>{c.label}</h3>
                <ul className="app-grid">
                  {group.map((app) => (
                    <AppCard key={app.id} app={app} />
                  ))}
                </ul>
              </section>
            );
          })}
        </section>
      </>
    );
  }

  return (
    <div className="launcher">
      <div className="launcher-search">
        <Icon name="search" />
        <input
          ref={input}
          type="search"
          aria-label="Buscar mini apps"
          placeholder="Buscar mini apps…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // L-03: Intro abre el primer resultado.
            if (e.key === 'Enter' && results.length > 0) openApp(results[0].id);
          }}
        />
      </div>
      {body}
    </div>
  );
}
