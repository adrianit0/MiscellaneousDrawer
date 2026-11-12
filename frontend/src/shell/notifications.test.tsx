import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ShellNotification } from '../api';
import { App } from '../App';
import { useMiniApp } from '../platform';
import { takeEvents } from '../presence';
import { app, installFakeServer, resetShell, type FakeServer } from '../test/fakeServer';
import { formatDateTime } from './NotificationBell';
import { SEEN_KEY, useNotifications } from './notificationStore';
import { ModuleRegistryContext, type ModuleRegistry } from './registry';

function Notes() {
  const { path } = useMiniApp();
  return <p>Notas en {path || '(raíz)'}</p>;
}

const CATALOG = [
  app({ id: 'database', name: 'Base de datos', icon: 'database', color: 'violet', category: 'data', status: 'planned' }),
  app({ id: 'notes', name: 'Notas', category: 'productivity' }),
];

const registry: ModuleRegistry = { notes: async () => ({ default: { Root: Notes } }) };

function notification(partial: Partial<ShellNotification> & { id: number }): ShellNotification {
  return {
    appId: 'notes',
    kind: 'info',
    title: `Notificación ${partial.id}`,
    text: null,
    path: null,
    createdAt: '2026-11-12T09:30:00Z',
    ...partial,
  };
}

const FINISHED = notification({ id: 7, appId: 'database', kind: 'success', title: 'El trabajo ha terminado correctamente', path: '/' });
const EXPORTED = notification({ id: 8, kind: 'error', title: 'La exportación ha fallado', text: 'Falta espacio en disco', path: '/exports/42' });

let server: FakeServer;

async function renderApp() {
  render(
    <ModuleRegistryContext.Provider value={registry}>
      <App />
    </ModuleRegistryContext.Provider>,
  );
  await screen.findByRole('searchbox', { name: 'Buscar mini apps' });
}

const bell = () => screen.getByRole('button', { name: /^Notificaciones/ });
/** N-12: el contador de la campana; null si no hay ninguna sin leer. */
const count = () => bell().querySelector('.bell-count')?.textContent ?? null;
const panel = () => screen.getByRole('region', { name: 'Notificaciones' });
const queryPanel = () => screen.queryByRole('region', { name: 'Notificaciones' });
const titles = () =>
  within(panel())
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.bell-item-title')?.textContent);

beforeEach(() => {
  resetShell();
  server = installFakeServer({ catalog: CATALOG });
});

describe('N-11 «Notificaciones» en la barra superior', () => {
  it('N-07 N-11: la campana está entre «Ir a…» y «Ajustes» y despliega las guardadas, la más reciente primero', async () => {
    server.notifications = [EXPORTED, FINISHED];
    await renderApp();
    const actions = [...document.querySelectorAll('.topbar-end button')].map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(actions.map((a) => a?.replace(/,.*/, ''))).toEqual(['Ir a… Ctrl+K', 'Notificaciones', 'Ajustes']);
    expect(queryPanel()).toBeNull();
    await waitFor(() => expect(bell().getAttribute('aria-label')).toBe('Notificaciones, 2 sin leer'));

    fireEvent.click(bell());
    expect(bell().getAttribute('aria-expanded')).toBe('true');
    expect(titles()).toEqual(['ErrorLa exportación ha fallado', 'El trabajo ha terminado correctamente']);
    const [exported, finished] = within(panel()).getAllByRole('listitem');
    expect(within(exported).getByText('Notas')).toBeTruthy();
    expect(within(exported).getByText('Falta espacio en disco')).toBeTruthy();
    // U-02
    expect(within(exported).getByText(formatDateTime(EXPORTED.createdAt))).toBeTruthy();
    expect(formatDateTime('2026-11-12T09:30:00')).toBe('12/11/2026 09:30');
    expect(exported.querySelector('.bell-item-error')).not.toBeNull();
    // Icono y color del manifiesto de su mini app.
    expect(within(finished).getByText('Base de datos')).toBeTruthy();
    expect(finished.querySelector('[data-color="violet"]')).not.toBeNull();
    expect(finished.querySelector('.bell-item-error')).toBeNull();
  });

  it('N-11 N-13: sin ninguna lo dice y no ofrece «Limpiar todo»; Esc, un clic fuera y la campana lo cierran', async () => {
    await renderApp();
    expect(bell().getAttribute('aria-label')).toBe('Notificaciones');
    fireEvent.click(bell());
    expect(within(panel()).getByText('No hay notificaciones')).toBeTruthy();
    expect(within(panel()).queryByRole('button', { name: 'Limpiar todo' })).toBeNull();

    fireEvent.keyDown(panel(), { key: 'Escape' });
    expect(queryPanel()).toBeNull();
    expect(document.activeElement).toBe(bell());

    fireEvent.click(bell());
    fireEvent.mouseDown(document.querySelector('.stage')!);
    expect(queryPanel()).toBeNull();

    fireEvent.click(bell());
    fireEvent.click(bell());
    expect(queryPanel()).toBeNull();
    expect(bell().getAttribute('aria-expanded')).toBe('false');
  });

  it('P-22: no muestra ni cuenta las de una mini app que no está en el catálogo', async () => {
    server.notifications = [notification({ id: 3, appId: 'quitada' }), notification({ id: 2 })];
    await renderApp();
    await waitFor(() => expect(bell().getAttribute('aria-label')).toBe('Notificaciones, 1 sin leer'));
    fireEvent.click(bell());
    expect(titles()).toEqual(['Notificación 2']);
  });
});

describe('N-12 notificaciones sin leer', () => {
  it('la campana las cuenta, y al abrir el desplegable quedan leídas y se guarda', async () => {
    server.notifications = [EXPORTED, FINISHED];
    await renderApp();
    await waitFor(() => expect(count()).toBe('2'));

    fireEvent.click(bell());
    expect(bell().getAttribute('aria-label')).toBe('Notificaciones');
    expect(bell().querySelector('.bell-count')).toBeNull();
    await waitFor(() => expect(server.settings[SEEN_KEY]).toBe(8));
  });

  it('con más de nueve muestra «9+»', async () => {
    server.notifications = Array.from({ length: 12 }, (_, i) => notification({ id: 12 - i }));
    await renderApp();
    await waitFor(() => expect(count()).toBe('9+'));
    expect(bell().getAttribute('aria-label')).toBe('Notificaciones, 12 sin leer');
  });

  it('al volver a abrir la ventana solo cuentan las posteriores a la última vista', async () => {
    server.settings = { [SEEN_KEY]: 7 };
    server.notifications = [EXPORTED, FINISHED];
    await renderApp();
    await waitFor(() => expect(bell().getAttribute('aria-label')).toBe('Notificaciones, 1 sin leer'));
  });
});

describe('N-13 abrir y limpiar', () => {
  it('pulsar una notificación abre su mini app en su subruta y cierra el desplegable', async () => {
    server.notifications = [EXPORTED, FINISHED];
    await renderApp();
    await waitFor(() => expect(count()).toBe('2'));
    fireEvent.click(bell());
    fireEvent.click(within(panel()).getByRole('button', { name: /La exportación ha fallado/ }));
    expect(queryPanel()).toBeNull();
    expect(window.location.hash).toBe('#/apps/notes/exports/42');
    expect(await screen.findByText('Notas en /exports/42')).toBeTruthy();

    // La subruta «/» es la raíz de la mini app.
    fireEvent.click(bell());
    fireEvent.click(within(panel()).getByRole('button', { name: /El trabajo ha terminado correctamente/ }));
    expect(window.location.hash).toBe('#/apps/database');
  });

  it('sin subruta, la mini app se abre como estuviera (N-05)', async () => {
    server.notifications = [notification({ id: 4 })];
    await renderApp();
    await waitFor(() => expect(count()).toBe('1'));
    window.location.hash = '#/apps/notes/detalle';
    expect(await screen.findByText('Notas en /detalle')).toBeTruthy();
    window.location.hash = '#/';
    await screen.findByRole('searchbox', { name: 'Buscar mini apps' });

    fireEvent.click(bell());
    fireEvent.click(within(panel()).getByRole('button', { name: /Notificación 4/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/apps/notes/detalle'));
  });

  it('«Limpiar todo» las borra en el servidor y deja el desplegable vacío', async () => {
    server.notifications = [EXPORTED, FINISHED];
    await renderApp();
    await waitFor(() => expect(count()).toBe('2'));
    fireEvent.click(bell());
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Limpiar todo' }));
    });
    expect(server.callsTo('DELETE', '/api/notifications')).toHaveLength(1);
    expect(server.notifications).toEqual([]);
    expect(within(panel()).getByText('No hay notificaciones')).toBeTruthy();
    expect(within(panel()).queryByRole('button', { name: 'Limpiar todo' })).toBeNull();
  });
});

describe('P-23 notificaciones nuevas por el canal de eventos', () => {
  it('N-11: una notificación emitida con la ventana abierta aparece sin recargar', async () => {
    await renderApp();
    expect(bell().getAttribute('aria-label')).toBe('Notificaciones');
    fireEvent.click(bell());
    expect(within(panel()).getByText('No hay notificaciones')).toBeTruthy();

    act(() => server.emit('notification', FINISHED));
    await waitFor(() => expect(titles()).toEqual(['El trabajo ha terminado correctamente']));
    // N-12: llegó con el desplegable abierto; queda leída al cerrarlo.
    expect(count()).toBe('1');
    fireEvent.click(bell());
    expect(bell().getAttribute('aria-label')).toBe('Notificaciones');

    act(() => server.emit('notification', EXPORTED));
    await waitFor(() => expect(bell().getAttribute('aria-label')).toBe('Notificaciones, 1 sin leer'));
    // La misma dos veces no se repite.
    act(() => server.emit('notification', EXPORTED));
    await waitFor(() => expect(useNotifications.getState().items.map((n) => n.id)).toEqual([8, 7]));
  });

  it('separa los eventos completos de un trozo del canal e ignora los latidos', () => {
    const first = takeEvents(': conectado\n\n: latido\nevent: notification\ndata: {"id":1}\n\nevent: notification\ndata: {"id"');
    expect(first.events).toEqual([{ event: 'notification', data: '{"id":1}' }]);
    expect(first.rest).toBe('event: notification\ndata: {"id"');
    const second = takeEvents(first.rest + ':2}\r\n\r\ndata: suelto\n\n');
    expect(second.events).toEqual([
      { event: 'notification', data: '{"id":2}' },
      { event: 'message', data: 'suelto' },
    ]);
    expect(second.rest).toBe('');
  });
});

describe('U-06 «Ajustes», categoría «Notificaciones»', () => {
  it('P-24: sonido y notificación de escritorio están marcados por defecto y se guardan con el resto', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajustes' });
    await within(dialog).findByLabelText(/Puerto/);
    expect(within(within(dialog).getByRole('list', { name: 'Categorías' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'General',
      'Notificaciones',
      'Actualizaciones',
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Notificaciones' }));
    const sound = within(dialog).getByRole('checkbox', { name: 'Sonido' }) as HTMLInputElement;
    const desktop = within(dialog).getByRole('checkbox', { name: 'Notificación de escritorio' }) as HTMLInputElement;
    expect(sound.checked).toBe(true);
    expect(desktop.checked).toBe(true);

    fireEvent.click(sound);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ajustes' })).toBeNull());
    expect(server.config).toMatchObject({ port: 47800, notificationSound: false, desktopNotifications: true });
  });
});
