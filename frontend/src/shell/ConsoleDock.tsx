import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { api, type ConsoleState, type ShellConsole } from '../api';
import { useCatalog } from './catalogStore';
import { HEIGHT_STEP, MIN_HEIGHT, clampHeight, useConsoles } from './consoleStore';
import { Icon } from './Icon';
import { formatDateTime } from './NotificationBell';
import { useUi } from './uiStore';

/** N-15: cada cuánto se piden las líneas nuevas de la consola elegida. */
export const POLL_MS = 1000;
/** P-26 */
const MAX_LINES = 5000;

/** P-25, N-15 */
export const STATE_LABELS: Record<ConsoleState, string> = {
  running: 'En progreso',
  succeeded: 'Terminado',
  failed: 'Error',
  cancelled: 'Cancelado',
};

/**
 * N-14 a N-17: la barra inferior y el panel de consolas, con la lista a la izquierda y la salida de la elegida a la
 * derecha. Es de solo lectura: las consolas las escriben las mini apps desde su servidor (P-25).
 */
export function ConsoleDock() {
  const items = useConsoles((s) => s.items);
  const open = useConsoles((s) => s.open);
  const height = useConsoles((s) => s.height);
  const selected = useConsoles((s) => s.selected);
  const apps = useCatalog((s) => s.apps);

  // P-27: sin las de mini apps que no están en el catálogo.
  const visible = items.flatMap((console) => {
    const app = apps.find((a) => a.id === console.appId);
    return app ? [{ console, app }] : [];
  });
  const running = visible.filter((v) => v.console.state === 'running').length;
  // N-15: la elegida o, si no hay o ya no está, la más reciente.
  const current = visible.find((v) => v.console.id === selected) ?? visible[0] ?? null;

  const clear = async () => {
    try {
      await useConsoles.getState().clear();
    } catch (e) {
      useUi.getState().notify(e instanceof Error ? e.message : 'No se pudieron limpiar las consolas', 'error');
    }
  };

  // N-16: arrastrar el borde superior; hacia arriba crece.
  const startDrag = (e: MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = useConsoles.getState().height;
    const onMove = (move: globalThis.MouseEvent) => useConsoles.getState().setHeight(startHeight + startY - move.clientY);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      useConsoles.getState().saveHeight();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // N-16, U-04: con el teclado.
  const onResizeKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const store = useConsoles.getState();
    store.setHeight(store.height + (e.key === 'ArrowUp' ? HEIGHT_STEP : -HEIGHT_STEP));
    store.saveHeight();
  };

  return (
    <footer className="console-dock">
      {open && (
        <div
          className="console-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Altura del panel de consolas"
          aria-valuenow={height}
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={clampHeight(Number.MAX_SAFE_INTEGER)}
          tabIndex={0}
          onMouseDown={startDrag}
          onKeyDown={onResizeKey}
        />
      )}
      <div className="console-bar">
        <button
          type="button"
          className="console-toggle"
          aria-expanded={open}
          aria-controls="console-panel"
          onClick={() => useConsoles.getState().setOpen(!open)}
        >
          <span className="console-caret" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          Consolas{running > 0 && ` · ${running} en progreso`}
        </button>
        {open && visible.some((v) => v.console.state !== 'running') && (
          <button type="button" className="console-clear" onClick={() => void clear()}>
            Limpiar terminadas
          </button>
        )}
      </div>
      {open && (
        <section id="console-panel" className="console-panel" aria-label="Consolas" style={{ height }}>
          {current === null ? (
            <p className="console-empty muted">No hay consolas</p>
          ) : (
            <>
              <ul className="console-list" aria-label="Lista de consolas">
                {visible.map(({ console, app }) => (
                  <li key={console.id}>
                    <button
                      type="button"
                      className="console-item"
                      aria-current={console.id === current.console.id ? 'true' : undefined}
                      onClick={() => useConsoles.getState().select(console.id)}
                    >
                      <span className="app-tile app-tile-small" data-color={app.color}>
                        <Icon name={app.icon} />
                      </span>
                      <span className="console-item-body">
                        <span className="console-item-name">{console.name}</span>
                        <span className="console-item-meta muted">
                          <span>{app.name}</span>
                          <time dateTime={console.startedAt}>{formatDateTime(console.startedAt)}</time>
                        </span>
                      </span>
                      <span className={`console-state console-state-${console.state}`}>{STATE_LABELS[console.state]}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <ConsoleOutput key={current.console.id} console={current.console} />
            </>
          )}
        </section>
      )}
    </footer>
  );
}

/** N-15: la salida de una consola. Pide las líneas nuevas cada segundo mientras está en progreso. */
function ConsoleOutput({ console }: { console: ShellConsole }) {
  const [lines, setLines] = useState<string[]>([]);
  const next = useRef(0);
  const box = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  const { id, state } = console;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const received = await api.consoleLines(id, next.current);
        if (stopped) return;
        next.current = received.next;
        if (received.lines.length > 0) setLines((previous) => [...previous, ...received.lines].slice(-MAX_LINES));
        // Al terminar, el cambio de estado llega por el canal (P-28) y se piden las últimas.
        if (received.console.state === 'running') timer = setTimeout(tick, POLL_MS);
      } catch {
        // Sin contacto: se reintenta mientras siga en progreso.
        if (!stopped && state === 'running') timer = setTimeout(tick, POLL_MS);
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, state]);

  // N-15: baja sola hasta el final, salvo que el usuario haya subido.
  useLayoutEffect(() => {
    if (box.current && stick.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);

  return (
    <pre
      ref={box}
      className="console-output"
      aria-label={`Salida de ${console.name}`}
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {lines.join('\n')}
    </pre>
  );
}
