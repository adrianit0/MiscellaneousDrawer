import { useEffect, useRef, useState } from 'react';
import { goHome, openApp } from './actions';
import { useCatalog } from './catalogStore';
import { Icon } from './Icon';
import { byName, matchesApp, matchesText } from './search';
import { useUi } from './uiStore';

interface Entry {
  key: string;
  label: string;
  detail: string;
  icon: string;
  color?: string;
  run: () => void;
}

/** N-09: «Ir a…» (Ctrl+K). */
export function CommandPalette() {
  const apps = useCatalog((s) => s.apps);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const close = () => useUi.getState().setPaletteOpen(false);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const fixed: Entry[] = [
    { key: 'home', label: 'Inicio', detail: 'Todas las mini apps', icon: 'home', run: goHome },
    { key: 'settings', label: 'Ajustes', detail: 'Puerto y apagado automático', icon: 'settings', run: () => useUi.getState().setSettingsOpen(true) },
  ];
  const entries: Entry[] = [
    ...fixed.filter((e) => matchesText(`${e.label} ${e.detail}`, query)),
    ...byName(apps.filter((a) => matchesApp(a, query))).map((a) => ({
      key: `app-${a.id}`,
      label: a.name,
      detail: a.status === 'planned' ? `${a.description} · En preparación` : a.description,
      icon: a.icon,
      color: a.color,
      run: () => openApp(a.id),
    })),
  ];
  const current = Math.min(selected, Math.max(0, entries.length - 1));

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    close();
    entry.run();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Ir a…">
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={entries[current] ? `palette-${entries[current].key}` : undefined}
          aria-label="Ir a…"
          placeholder="Ir a…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelected((current + 1) % Math.max(1, entries.length));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelected((current - 1 + entries.length) % Math.max(1, entries.length));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(entries[current]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        />
        <ul id="palette-list" role="listbox" aria-label="Destinos">
          {entries.map((entry, i) => (
            <li
              key={entry.key}
              id={`palette-${entry.key}`}
              role="option"
              aria-selected={i === current}
              className="palette-option"
              onMouseMove={() => setSelected(i)}
              onClick={() => choose(entry)}
            >
              <span className="app-tile app-tile-small" data-color={entry.color}>
                <Icon name={entry.icon} />
              </span>
              <span className="palette-label">{entry.label}</span>
              <span className="palette-detail muted">{entry.detail}</span>
            </li>
          ))}
          {entries.length === 0 && <li className="palette-empty muted">Nada coincide con «{query.trim()}»</li>}
        </ul>
      </div>
    </div>
  );
}
