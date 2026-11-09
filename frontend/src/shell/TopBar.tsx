import type { CatalogApp } from '../api';
import { closeActiveApp, goHome, openApp } from './actions';
import { Icon } from './Icon';
import { useNav } from './navStore';
import { useUi } from './uiStore';

/** N-07, U-08: logotipo y nombre, miga de pan y acciones. */
export function TopBar({ active }: { active: CatalogApp | null }) {
  const subtitle = useNav((s) => (active ? (s.subtitles[active.id] ?? null) : null));
  const pinned = useNav((s) => (active ? s.pinned.includes(active.id) : false));

  return (
    <header className="topbar">
      <a
        className="brand"
        href="#/"
        onClick={(e) => {
          e.preventDefault();
          goHome();
        }}
      >
        <img src="/cajonsastre-icon.svg" alt="" width={28} height={28} />
        <span>Cajón de sastre</span>
      </a>
      {active && (
        <nav className="breadcrumbs" aria-label="Miga de pan">
          <span aria-hidden="true">›</span>
          <button type="button" className="crumb" onClick={() => openApp(active.id)} aria-current={subtitle ? undefined : 'page'}>
            {active.name}
          </button>
          {subtitle && (
            <>
              <span aria-hidden="true">›</span>
              <span className="crumb-current" aria-current="page">
                {subtitle}
              </span>
            </>
          )}
        </nav>
      )}
      <div className="topbar-end">
        {active && (
          <>
            <button
              type="button"
              className="icon-button"
              aria-pressed={pinned}
              aria-label={pinned ? `Desfijar ${active.name}` : `Fijar ${active.name}`}
              title={pinned ? 'Desfijar' : 'Fijar'}
              onClick={() => useNav.getState().togglePin(active.id)}
            >
              {pinned ? '★' : '☆'}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Cerrar ${active.name}`}
              aria-keyshortcuts="Alt+W"
              title="Cerrar (Alt+W)"
              onClick={closeActiveApp}
            >
              ×
            </button>
          </>
        )}
        <button
          type="button"
          className="goto-button"
          aria-keyshortcuts="Control+K"
          onClick={() => useUi.getState().setPaletteOpen(true)}
        >
          Ir a… <kbd>Ctrl+K</kbd>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Ajustes"
          title="Ajustes"
          onClick={() => useUi.getState().setSettingsOpen(true)}
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}
