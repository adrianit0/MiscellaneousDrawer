import { useEffect, useRef, useState } from 'react';
import type { CatalogApp, ShellNotification } from '../api';
import { openApp } from './actions';
import { useCatalog } from './catalogStore';
import { Icon } from './Icon';
import { unreadCount, useNotifications } from './notificationStore';
import { appRoute, useRouter } from './router';
import { useUi } from './uiStore';

const pad = (n: number) => String(n).padStart(2, '0');

/** U-02: dd/MM/yyyy HH:mm, en la hora local. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** N-13: abre la mini app de la notificación, en su subruta si la tiene. */
function openNotification(notification: ShellNotification) {
  if (notification.path === null) {
    openApp(notification.appId);
    return;
  }
  try {
    useRouter.getState().navigate(appRoute(notification.appId, notification.path));
  } catch {
    openApp(notification.appId);
  }
}

/** N-11 a N-13: la campana de la barra superior y su desplegable con las notificaciones de las mini apps. */
export function NotificationBell() {
  const items = useNotifications((s) => s.items);
  const seen = useNotifications((s) => s.seen);
  const apps = useCatalog((s) => s.apps);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // P-22: sin las de mini apps que no están en el catálogo.
  const visible = items.flatMap((notification) => {
    const app = apps.find((a) => a.id === notification.appId);
    return app ? [{ notification, app }] : [];
  });
  const unread = unreadCount(
    visible.map((v) => v.notification),
    seen,
  );

  // N-12: quedan leídas al abrir y, las que llegaron con él abierto, al cerrar.
  const close = () => {
    setOpen(false);
    useNotifications.getState().markSeen();
  };
  const toggle = () => {
    if (open) close();
    else {
      setOpen(true);
      useNotifications.getState().markSeen();
    }
  };

  // N-11: un clic fuera lo cierra.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const go = (notification: ShellNotification) => {
    close();
    openNotification(notification);
  };

  const clear = async () => {
    try {
      await useNotifications.getState().clear();
    } catch (e) {
      useUi.getState().notify(e instanceof Error ? e.message : 'No se pudieron limpiar las notificaciones', 'error');
    }
  };

  return (
    <div
      className="bell"
      ref={root}
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="icon-button bell-button"
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        aria-haspopup="true"
        aria-expanded={open}
        title="Notificaciones"
        onClick={toggle}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="bell-count" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <section className="bell-panel" aria-label="Notificaciones">
          <header className="bell-header">
            <h2>Notificaciones</h2>
            {visible.length > 0 && (
              <button type="button" onClick={() => void clear()}>
                Limpiar todo
              </button>
            )}
          </header>
          {visible.length === 0 ? (
            <p className="bell-empty muted">No hay notificaciones</p>
          ) : (
            <ul className="bell-list">
              {visible.map(({ notification, app }) => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} app={app} onOpen={() => go(notification)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function NotificationItem({ notification, app, onOpen }: { notification: ShellNotification; app: CatalogApp; onOpen: () => void }) {
  return (
    <button type="button" className={`bell-item bell-item-${notification.kind}`} onClick={onOpen}>
      <span className="app-tile app-tile-small" data-color={app.color}>
        <Icon name={app.icon} />
      </span>
      <span className="bell-item-body">
        <span className="bell-item-meta muted">
          <span className="bell-item-app">{app.name}</span>
          <time dateTime={notification.createdAt}>{formatDateTime(notification.createdAt)}</time>
        </span>
        <span className="bell-item-title">
          {notification.kind === 'error' && <span className="bell-item-kind">Error</span>}
          {notification.title}
        </span>
        {notification.text && <span className="bell-item-text muted">{notification.text}</span>}
      </span>
    </button>
  );
}
