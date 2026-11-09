import type { CatalogApp } from '../api';
import { goHome, openApp } from './actions';
import { useCatalog } from './catalogStore';
import { Icon } from './Icon';
import { useNav } from './navStore';

function RailButton({ app, active, open }: { app: CatalogApp; active: boolean; open: boolean }) {
  return (
    <li>
      <button
        type="button"
        className="rail-button"
        data-color={app.color}
        aria-current={active ? 'page' : undefined}
        title={`${app.name}: ${app.description}`}
        onClick={() => openApp(app.id)}
      >
        <Icon name={app.icon} />
        {open && <span className="rail-dot" aria-hidden="true" />}
        <span className="sr-only">
          {app.name}
          {open ? ' (abierta)' : ''}
        </span>
      </button>
    </li>
  );
}

/** N-04: Inicio, las fijadas, un separador y las abiertas que no están fijadas. */
export function Rail({ activeId }: { activeId: string | null }) {
  const apps = useCatalog((s) => s.apps);
  const pinnedIds = useNav((s) => s.pinned);
  const openIds = useNav((s) => s.open);
  const byId = new Map(apps.map((a) => [a.id, a]));
  const pinned = pinnedIds.map((id) => byId.get(id)).filter((a): a is CatalogApp => a !== undefined);
  const openUnpinned = openIds
    .filter((id) => !pinnedIds.includes(id))
    .map((id) => byId.get(id))
    .filter((a): a is CatalogApp => a !== undefined);

  return (
    <nav className="rail" aria-label="Mini apps">
      <ul>
        <li>
          <button
            type="button"
            className="rail-button rail-home"
            aria-current={activeId === null ? 'page' : undefined}
            title="Inicio (Alt+0)"
            onClick={goHome}
          >
            <Icon name="home" />
            <span className="sr-only">Inicio</span>
          </button>
        </li>
      </ul>
      {pinned.length > 0 && (
        <ul aria-label="Fijadas">
          {pinned.map((app) => (
            <RailButton key={app.id} app={app} active={app.id === activeId} open={openIds.includes(app.id)} />
          ))}
        </ul>
      )}
      {openUnpinned.length > 0 && (
        <>
          <hr className="rail-separator" />
          <ul aria-label="Abiertas">
            {openUnpinned.map((app) => (
              <RailButton key={app.id} app={app} active={app.id === activeId} open />
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}
