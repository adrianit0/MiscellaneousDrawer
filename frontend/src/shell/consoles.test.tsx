import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ShellConsole } from '../api';
import { App } from '../App';
import { useMiniApp } from '../platform';
import { app, installFakeServer, resetShell, type FakeServer } from '../test/fakeServer';
import { DEFAULT_HEIGHT, HEIGHT_KEY, OPEN_KEY, clampHeight, useConsoles } from './consoleStore';
import { formatDateTime } from './NotificationBell';
import { ModuleRegistryContext, type ModuleRegistry } from './registry';

function Notes() {
  const { showConsole } = useMiniApp();
  return (
    <button type="button" onClick={() => showConsole(4)}>
      Ver la consola de la copia
    </button>
  );
}

const CATALOG = [
  app({ id: 'database', name: 'Base de datos', icon: 'database', color: 'violet', category: 'data', status: 'planned' }),
  app({ id: 'notes', name: 'Notas', category: 'productivity' }),
];

const registry: ModuleRegistry = { notes: async () => ({ default: { Root: Notes } }) };

function shellConsole(partial: Partial<ShellConsole> & { id: number }): ShellConsole {
  return {
    appId: 'database',
    name: `Trabajo ${partial.id} · Hotfix`,
    state: 'succeeded',
    startedAt: '2026-11-12T09:30:00Z',
    finishedAt: '2026-11-12T09:40:00Z',
    ...partial,
  };
}

const RUNNING = shellConsole({ id: 5, state: 'running', finishedAt: null });
const COPY = shellConsole({ id: 4, appId: 'notes', name: 'Copia de notas', state: 'failed' });
const DONE = shellConsole({ id: 3, name: 'Trabajo 3 · Develop' });
const CANCELLED = shellConsole({ id: 2, name: 'Trabajo 2 · Ambas', state: 'cancelled' });

let server: FakeServer;

async function renderApp() {
  render(
    <ModuleRegistryContext.Provider value={registry}>
      <App />
    </ModuleRegistryContext.Provider>,
  );
  await screen.findByRole('searchbox', { name: 'Buscar mini apps' });
}

const toggle = () => screen.getByRole('button', { name: /^Consolas/ });
const panel = () => screen.getByRole('region', { name: 'Consolas' });
const queryPanel = () => screen.queryByRole('region', { name: 'Consolas' });
const rows = () => within(within(panel()).getByRole('list', { name: 'Lista de consolas' })).getAllByRole('button');
const names = () => rows().map((r) => r.querySelector('.console-item-name')?.textContent);
const output = (name: string) => within(panel()).getByLabelText(`Salida de ${name}`);
const resizer = () => screen.getByRole('separator', { name: 'Altura del panel de consolas' });
const linesCalls = (id: number) => server.callsTo('GET', `/api/consoles/${id}?`).map((c) => c.url);

async function openPanel() {
  await renderApp();
  fireEvent.click(toggle());
}

beforeEach(() => {
  resetShell();
  server = installFakeServer({ catalog: CATALOG });
});

describe('N-14 barra inferior', () => {
  it('ocupa el pie de la ventana, con «Consolas» recogido y el número de las que están en progreso', async () => {
    server.consoles = [RUNNING, COPY];
    await renderApp();
    const dock = document.querySelector('.shell > footer.console-dock');
    expect(dock).not.toBeNull();
    // Después de la zona de trabajo: a todo el ancho, bajo la barra lateral y el escenario.
    expect(dock?.previousElementSibling?.className).toBe('workspace');
    await waitFor(() => expect(toggle().textContent).toBe('▸Consolas · 1 en progreso'));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(queryPanel()).toBeNull();
    // N-15: recogido, no se pide la salida de ninguna.
    expect(linesCalls(5)).toEqual([]);
  });

  it('el botón despliega y recoge el panel, y se guarda', async () => {
    await renderApp();
    expect(toggle().textContent).toBe('▸Consolas');
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(within(panel()).getByText('No hay consolas')).toBeTruthy();
    await waitFor(() => expect(server.settings[OPEN_KEY]).toBe(true));

    fireEvent.click(toggle());
    expect(queryPanel()).toBeNull();
    await waitFor(() => expect(server.settings[OPEN_KEY]).toBe(false));
  });

  it('al volver a abrir la ventana sigue como se dejó', async () => {
    server.settings = { [OPEN_KEY]: true, [HEIGHT_KEY]: 300 };
    await renderApp();
    await waitFor(() => expect(queryPanel()).not.toBeNull());
    expect(panel().style.height).toBe('300px');
  });
});

describe('N-15 lista y salida', () => {
  it('lista las consolas con su nombre, su mini app, su estado y su hora, la más reciente primero y elegida', async () => {
    server.consoles = [RUNNING, COPY, DONE, CANCELLED];
    server.consoleLines = { 5: ['$ aws s3api head-object', 'Bloque 1 descargado'] };
    await openPanel();
    await waitFor(() => expect(names()).toEqual(['Trabajo 5 · Hotfix', 'Copia de notas', 'Trabajo 3 · Develop', 'Trabajo 2 · Ambas']));
    expect(rows().map((r) => r.querySelector('.console-state')?.textContent)).toEqual(['En progreso', 'Error', 'Terminado', 'Cancelado']);
    const [running, copy] = rows();
    expect(within(running).getByText('Base de datos')).toBeTruthy();
    expect(running.querySelector('[data-color="violet"]')).not.toBeNull();
    // U-02
    expect(within(running).getByText(formatDateTime(RUNNING.startedAt))).toBeTruthy();
    expect(within(copy).getByText('Notas')).toBeTruthy();
    expect(running.getAttribute('aria-current')).toBe('true');
    expect(copy.getAttribute('aria-current')).toBeNull();
    await waitFor(() => expect(output('Trabajo 5 · Hotfix').textContent).toBe('$ aws s3api head-object\nBloque 1 descargado'));
    // Solo lectura: ni campos ni nada que escribir.
    expect(within(panel()).queryByRole('textbox')).toBeNull();
  });

  it('pulsar una consola muestra su salida', async () => {
    server.consoles = [RUNNING, COPY];
    server.consoleLines = { 5: ['de la base de datos'], 4: ['Copiando notas', 'ERROR: sin espacio'] };
    await openPanel();
    await waitFor(() => expect(output('Trabajo 5 · Hotfix').textContent).toBe('de la base de datos'));
    fireEvent.click(rows()[1]);
    expect(rows()[1].getAttribute('aria-current')).toBe('true');
    expect(rows()[0].getAttribute('aria-current')).toBeNull();
    await waitFor(() => expect(output('Copia de notas').textContent).toBe('Copiando notas\nERROR: sin espacio'));
    expect(within(panel()).queryByLabelText('Salida de Trabajo 5 · Hotfix')).toBeNull();
  });

  it('P-27: no muestra ni cuenta las de una mini app que no está en el catálogo', async () => {
    server.consoles = [shellConsole({ id: 9, appId: 'quitada', state: 'running', finishedAt: null }), DONE];
    await openPanel();
    await waitFor(() => expect(names()).toEqual(['Trabajo 3 · Develop']));
    expect(toggle().textContent).toBe('▾Consolas');
  });

  it('pide cada segundo solo las líneas nuevas mientras está en progreso, y al terminar deja de pedir', async () => {
    server.consoles = [RUNNING];
    server.consoleLines = { 5: ['uno', 'dos'] };
    await openPanel();
    await waitFor(() => expect(output('Trabajo 5 · Hotfix').textContent).toBe('uno\ndos'));
    expect(linesCalls(5)[0]).toBe('/api/consoles/5?after=0');

    server.consoleLines[5].push('tres');
    await waitFor(() => expect(output('Trabajo 5 · Hotfix').textContent).toBe('uno\ndos\ntres'), { timeout: 3000 });
    expect(linesCalls(5)).toContain('/api/consoles/5?after=2');

    // P-28: termina; su estado llega por el canal y se piden las últimas líneas.
    server.consoleLines[5].push('fin');
    server.consoles = [{ ...RUNNING, state: 'succeeded', finishedAt: '2026-11-12T09:50:00Z' }];
    act(() => server.emit('consoles', { consoles: server.consoles }));
    await waitFor(() => expect(output('Trabajo 5 · Hotfix').textContent).toBe('uno\ndos\ntres\nfin'), { timeout: 3000 });
    expect(rows()[0].querySelector('.console-state')?.textContent).toBe('Terminado');
    expect(toggle().textContent).toBe('▾Consolas');
    const count = linesCalls(5).length;
    await new Promise((r) => setTimeout(r, 1300));
    expect(linesCalls(5)).toHaveLength(count);
  }, 10000);

  it('recogido el panel deja de pedir', async () => {
    server.consoles = [RUNNING];
    await openPanel();
    await waitFor(() => expect(linesCalls(5).length).toBeGreaterThan(0));
    fireEvent.click(toggle());
    const count = linesCalls(5).length;
    await new Promise((r) => setTimeout(r, 1300));
    expect(linesCalls(5)).toHaveLength(count);
  });
});

describe('P-28 consolas por el canal de eventos', () => {
  it('N-15: una consola abierta con la ventana abierta aparece sin recargar', async () => {
    await openPanel();
    expect(within(panel()).getByText('No hay consolas')).toBeTruthy();
    server.consoles = [RUNNING];
    server.consoleLines = { 5: ['recién abierta'] };
    act(() => server.emit('consoles', { consoles: [RUNNING] }));
    await waitFor(() => expect(names()).toEqual(['Trabajo 5 · Hotfix']));
    expect(toggle().textContent).toBe('▾Consolas · 1 en progreso');
    await waitFor(() => expect(output('Trabajo 5 · Hotfix').textContent).toBe('recién abierta'));
    // Un evento que no se entiende se ignora.
    act(() => server.emit('consoles', { otra: 'cosa' }));
    expect(useConsoles.getState().items).toEqual([RUNNING]);
  });
});

describe('N-16 altura del panel', () => {
  it('nace con 260 px y cambia con ↑ y ↓ en su borde, entre el mínimo y el 70 % de la ventana, y se guarda', async () => {
    await openPanel();
    expect(DEFAULT_HEIGHT).toBe(260);
    expect(panel().style.height).toBe('260px');
    expect(resizer().getAttribute('aria-valuenow')).toBe('260');
    expect(resizer().getAttribute('aria-valuemin')).toBe('120');

    fireEvent.keyDown(resizer(), { key: 'ArrowUp' });
    expect(panel().style.height).toBe('284px');
    await waitFor(() => expect(server.settings[HEIGHT_KEY]).toBe(284));

    for (let i = 0; i < 10; i++) fireEvent.keyDown(resizer(), { key: 'ArrowDown' });
    expect(panel().style.height).toBe('120px');
    const max = Math.floor(window.innerHeight * 0.7);
    for (let i = 0; i < 60; i++) fireEvent.keyDown(resizer(), { key: 'ArrowUp' });
    expect(panel().style.height).toBe(`${max}px`);
    expect(clampHeight(5000)).toBe(max);
    expect(clampHeight(10)).toBe(120);
  });

  it('se cambia arrastrando su borde superior y se guarda al soltar', async () => {
    await openPanel();
    fireEvent.mouseDown(resizer(), { clientY: 500 });
    fireEvent.mouseMove(window, { clientY: 440 });
    expect(panel().style.height).toBe('320px');
    expect(server.settings[HEIGHT_KEY]).toBeUndefined();
    fireEvent.mouseUp(window);
    await waitFor(() => expect(server.settings[HEIGHT_KEY]).toBe(320));
    // Soltado, mover el ratón ya no la cambia.
    fireEvent.mouseMove(window, { clientY: 300 });
    expect(panel().style.height).toBe('320px');
  });
});

describe('N-17 «Limpiar terminadas»', () => {
  it('descarta las terminadas, con error y canceladas, y deja las que están en progreso', async () => {
    server.consoles = [RUNNING, COPY, DONE, CANCELLED];
    await openPanel();
    await waitFor(() => expect(names()).toHaveLength(4));
    await act(async () => {
      fireEvent.click(within(document.querySelector('.console-bar') as HTMLElement).getByRole('button', { name: 'Limpiar terminadas' }));
    });
    expect(server.callsTo('DELETE', '/api/consoles')).toHaveLength(1);
    expect(names()).toEqual(['Trabajo 5 · Hotfix']);
    // Sin ninguna terminada no se ofrece.
    expect(screen.queryByRole('button', { name: 'Limpiar terminadas' })).toBeNull();
  });

  it('no aparece con el panel recogido ni sin consolas', async () => {
    server.consoles = [DONE];
    await renderApp();
    expect(screen.queryByRole('button', { name: 'Limpiar terminadas' })).toBeNull();
    fireEvent.click(toggle());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Limpiar terminadas' })).toBeTruthy());
  });
});

describe('P-12 showConsole', () => {
  it('una mini app despliega el panel con una de sus consolas elegida', async () => {
    server.consoles = [RUNNING, COPY];
    server.consoleLines = { 4: ['Copiando notas'] };
    await renderApp();
    window.location.hash = '#/apps/notes';
    fireEvent.click(await screen.findByRole('button', { name: 'Ver la consola de la copia' }));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(rows()[1].getAttribute('aria-current')).toBe('true'));
    await waitFor(() => expect(output('Copia de notas').textContent).toBe('Copiando notas'));
    await waitFor(() => expect(server.settings[OPEN_KEY]).toBe(true));
  });
});
