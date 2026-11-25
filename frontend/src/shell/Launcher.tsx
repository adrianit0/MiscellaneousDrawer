import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { CatalogApp } from '../api';
import { comboFromEvent } from '../platform/shortcuts';
import { openApp } from './actions';
import { useCatalog } from './catalogStore';
import { Icon } from './Icon';
import { cardTarget, formatAgo, mergePinnedView, pinnedIndexInView } from './launcherModel';
import { useNav } from './navStore';
import { byName, CATEGORIES, matchesApp } from './search';

/** L-01: las pestañas de Inicio, en su orden (Ctrl+1 a Ctrl+3, L-10). */
const TABS = [
  { id: 'pinned', label: 'Fijadas' },
  { id: 'recent', label: 'Usado recientemente' },
  { id: 'all', label: 'Todas las aplicaciones' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** L-02: el texto de «Hace N min» se renueva solo. */
const CLOCK_TICK = 30_000;

interface CardProps {
  app: CatalogApp;
  /** L-02: en «Usado recientemente». */
  openedAt?: number;
  now: number;
  /** L-03: el primer resultado, el que abre Intro. */
  enterHint?: boolean;
  /** L-11: se puede arrastrar y mover con Ctrl+← y Ctrl+→. */
  reorderable?: boolean;
  /** L-08: desfijada mientras «Fijadas» estaba abierta. */
  ghost?: boolean;
  onTogglePin?: (app: CatalogApp) => void;
  onMove?: (app: CatalogApp, step: 1 | -1) => void;
  onDropOn?: (app: CatalogApp, draggedId: string) => void;
}

const DRAG_TYPE = 'application/x-cajonsastre-app';

/** L-02 */
function AppCard({ app, openedAt, now, enterHint, reorderable, ghost, onTogglePin, onMove, onDropOn }: CardProps) {
  const pinned = useNav((s) => s.pinned.includes(app.id));
  const isOpen = useNav((s) => s.open.includes(app.id));
  const [dropTarget, setDropTarget] = useState(false);

  const dragProps = reorderable
    ? {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          e.dataTransfer.setData(DRAG_TYPE, app.id);
          e.dataTransfer.effectAllowed = 'move';
        },
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropTarget(true);
        },
        onDragLeave: () => setDropTarget(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDropTarget(false);
          const dragged = e.dataTransfer.getData(DRAG_TYPE);
          if (dragged && dragged !== app.id) onDropOn?.(app, dragged);
        },
      }
    : {};

  const classes = ['app-card'];
  if (ghost) classes.push('app-card-ghost');
  if (dropTarget) classes.push('app-card-drop');
  if (reorderable) classes.push('app-card-reorderable');

  return (
    <li className={classes.join(' ')} data-app-id={app.id} {...dragProps}>
      <button
        type="button"
        className="app-card-open"
        onClick={() => openApp(app.id)}
        title={reorderable ? 'Arrastra o usa Ctrl+← y Ctrl+→ para cambiar el orden' : undefined}
        onKeyDown={(e) => {
          // L-11
          if (reorderable && onMove && e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            e.stopPropagation();
            onMove(app, e.key === 'ArrowLeft' ? -1 : 1);
          }
        }}
      >
        <span className="app-tile" data-color={app.color}>
          <Icon name={app.icon} />
        </span>
        <span className="app-card-text">
          <span className="app-card-title">
            <span className="app-card-name">{app.name}</span>
            {isOpen && <span className="badge badge-open">Abierta</span>}
            {app.status === 'planned' && <span className="badge badge-planned">En preparación</span>}
            {app.status === 'failed' && <span className="badge badge-error">Error</span>}
            {enterHint && <kbd className="app-card-enter">Intro</kbd>}
          </span>
          <span className="app-card-description muted">{app.description}</span>
          {openedAt !== undefined && <span className="app-card-meta muted">{formatAgo(openedAt, now)}</span>}
        </span>
      </button>
      <button
        type="button"
        className="app-card-pin icon-button"
        aria-pressed={pinned}
        aria-label={pinned ? `Desfijar ${app.name}` : `Fijar ${app.name}`}
        title={pinned ? 'Desfijar' : 'Fijar'}
        onClick={() => (onTogglePin ? onTogglePin(app) : useNav.getState().togglePin(app.id))}
      >
        {pinned ? '★' : '☆'}
      </button>
    </li>
  );
}

function CardGrid({ children }: { children: ReactNode }) {
  return <ul className="app-grid">{children}</ul>;
}

/** L-01 a L-11: «Inicio». */
export function Launcher() {
  const apps = useCatalog((s) => s.apps);
  const status = useCatalog((s) => s.status);
  const error = useCatalog((s) => s.error);
  const pinnedIds = useNav((s) => s.pinned);
  const recentIds = useNav((s) => s.recent);
  const recentAt = useNav((s) => s.recentAt);
  const [query, setQuery] = useState('');
  /** L-01: se decide al entrar, con el catálogo cargado: «Fijadas» o, sin ninguna, «Todas las aplicaciones». */
  const [chosenTab, setChosenTab] = useState<TabId | null>(null);
  /** L-08: lo que muestra «Fijadas», con las desfijadas en su sitio hasta cambiar de pestaña. */
  const [pinnedView, setPinnedView] = useState({ source: pinnedIds, ids: pinnedIds });
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ pinned: null, recent: null, all: null });

  if (pinnedView.source !== pinnedIds) {
    setPinnedView({ source: pinnedIds, ids: mergePinnedView(pinnedView.ids, pinnedIds) });
  }

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK);
    return () => clearInterval(timer);
  }, []);

  const byId = new Map(apps.map((a) => [a.id, a]));
  const pick = (ids: readonly string[]) => ids.map((id) => byId.get(id)).filter((a): a is CatalogApp => a !== undefined);
  const pinnedApps = pick(pinnedIds);
  const recentApps = pick(recentIds);
  const trimmed = query.trim();
  const results = trimmed ? byName(apps.filter((a) => matchesApp(a, query))) : [];
  // L-08: decidida una vez, fijar la primera o desfijar la última no cambia de pestaña.
  if (chosenTab === null && status === 'ready') setChosenTab(pinnedApps.length > 0 ? 'pinned' : 'all');
  const tab: TabId = chosenTab ?? 'all';
  const counts: Record<TabId, number> = { pinned: pinnedApps.length, recent: recentApps.length, all: apps.length };

  const selectTab = (id: TabId, focus = false) => {
    if (id !== tab) setPinnedView({ source: pinnedIds, ids: pinnedIds });
    setChosenTab(id);
    if (focus) tabRefs.current[id]?.focus();
  };

  // L-10: Ctrl+1 a Ctrl+3, desde cualquier sitio de Inicio.
  const selectTabRef = useRef(selectTab);
  selectTabRef.current = selectTab;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const match = /^Ctrl\+([1-3])$/.exec(comboFromEvent(e));
      if (!match) return;
      e.preventDefault();
      setQuery('');
      selectTabRef.current(TABS[Number(match[1]) - 1].id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const cards = () => [...(panel.current?.querySelectorAll<HTMLButtonElement>('.app-card-open') ?? [])];

  /** L-10: las flechas recorren las tarjetas como una rejilla; una letra lleva al buscador. */
  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('app-card-open')) return;
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      setQuery((q) => q + e.key);
      input.current?.focus();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    const list = cards();
    const index = list.indexOf(target as HTMLButtonElement);
    const boxes = list.map((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    const next = cardTarget(boxes, index, e.key);
    if (next === null) {
      if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') e.preventDefault();
      return;
    }
    e.preventDefault();
    if (next === 'search') input.current?.focus();
    else list[next].focus();
  };

  /** L-08: volver a fijar una desfijada la deja en el sitio que tiene en la pestaña. */
  const togglePinInView = (app: CatalogApp) => {
    const nav = useNav.getState();
    if (nav.pinned.includes(app.id)) {
      nav.togglePin(app.id);
      return;
    }
    const index = pinnedIndexInView(pinnedView.ids, nav.pinned, app.id);
    nav.togglePin(app.id);
    nav.movePinned(app.id, index);
  };

  /** L-11 */
  const movePinned = (app: CatalogApp, step: 1 | -1) => {
    const nav = useNav.getState();
    const index = nav.pinned.indexOf(app.id);
    if (index >= 0) nav.movePinned(app.id, index + step);
  };
  const dropOn = (app: CatalogApp, draggedId: string) => {
    const nav = useNav.getState();
    const index = nav.pinned.indexOf(app.id);
    if (index >= 0 && nav.pinned.includes(draggedId)) nav.movePinned(draggedId, index);
  };

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
  } else if (trimmed) {
    body = (
      <section className="launcher-panel" aria-labelledby="launcher-results" ref={panel} onKeyDown={onPanelKeyDown}>
        <h2 id="launcher-results" className="launcher-results-title">
          Resultados
        </h2>
        {results.length > 0 ? (
          <CardGrid>
            {results.map((app, i) => (
              <AppCard key={app.id} app={app} now={now} enterHint={i === 0} />
            ))}
          </CardGrid>
        ) : (
          <p className="launcher-empty muted">Ninguna mini app coincide con «{trimmed}»</p>
        )}
      </section>
    );
  } else {
    let content;
    if (tab === 'pinned') {
      const view = pick(pinnedView.ids);
      content =
        view.length > 0 ? (
          <CardGrid>
            {view.map((app) => {
              const isPinned = pinnedIds.includes(app.id);
              return (
                <AppCard
                  key={app.id}
                  app={app}
                  now={now}
                  ghost={!isPinned}
                  reorderable={isPinned}
                  onTogglePin={togglePinInView}
                  onMove={movePinned}
                  onDropOn={dropOn}
                />
              );
            })}
          </CardGrid>
        ) : (
          <div className="launcher-empty">
            <p className="muted">
              No hay mini apps fijadas. Pulsa ☆ en una tarjeta para tenerla aquí, en la barra lateral y en Alt+1 a Alt+9.
            </p>
            <button type="button" onClick={() => selectTab('all', true)}>
              Ver todas las aplicaciones
            </button>
          </div>
        );
    } else if (tab === 'recent') {
      content =
        recentApps.length > 0 ? (
          <CardGrid>
            {recentApps.map((app) => (
              <AppCard key={app.id} app={app} now={now} openedAt={recentAt[app.id]} />
            ))}
          </CardGrid>
        ) : (
          <p className="launcher-empty muted">Todavía no se ha abierto ninguna mini app.</p>
        );
    } else {
      content = CATEGORIES.map((c) => {
        const group = byName(apps.filter((a) => a.category === c.id));
        if (group.length === 0) return null;
        return (
          <section key={c.id} className="launcher-group" aria-labelledby={`launcher-cat-${c.id}`}>
            <h3 id={`launcher-cat-${c.id}`}>{c.label}</h3>
            <CardGrid>
              {group.map((app) => (
                <AppCard key={app.id} app={app} now={now} />
              ))}
            </CardGrid>
          </section>
        );
      });
    }
    body = (
      <>
        <div className="launcher-tabs" role="tablist" aria-label="Listas de mini apps">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`launcher-tab-${t.id}`}
              className="launcher-tab"
              aria-selected={tab === t.id}
              aria-controls="launcher-panel"
              tabIndex={tab === t.id ? 0 : -1}
              title={`Ctrl+${i + 1}`}
              onClick={() => selectTab(t.id)}
              onKeyDown={(e) => {
                // L-10: patrón de pestañas.
                const last = TABS.length - 1;
                const target =
                  e.key === 'ArrowLeft' ? (i + last) % TABS.length
                  : e.key === 'ArrowRight' ? (i + 1) % TABS.length
                  : e.key === 'Home' ? 0
                  : e.key === 'End' ? last
                  : e.key === 'ArrowDown' ? -1
                  : null;
                if (target === null) return;
                e.preventDefault();
                if (target === -1) cards()[0]?.focus();
                else selectTab(TABS[target].id, true);
              }}
            >
              <span>{t.label}</span>
              <span className="launcher-tab-count">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div
          id="launcher-panel"
          className="launcher-panel"
          role="tabpanel"
          aria-labelledby={`launcher-tab-${tab}`}
          ref={panel}
          onKeyDown={onPanelKeyDown}
        >
          {content}
        </div>
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
            // L-10: ↓ lleva a la primera tarjeta.
            if (e.key === 'ArrowDown') {
              const first = cards()[0];
              if (first) {
                e.preventDefault();
                first.focus();
              }
            }
          }}
        />
      </div>
      {body}
    </div>
  );
}
