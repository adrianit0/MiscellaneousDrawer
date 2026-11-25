import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { App } from './App';
import { useMiniApp } from './platform';
import { app, installFakeServer, resetShell, type FakeServer } from './test/fakeServer';
import { flushShellState, LAST_ROUTE_KEY, MAX_OPEN, PINNED_KEY, RECENT_AT_KEY, RECENT_KEY, useNav } from './shell/navStore';
import { formatDateTime } from './shell/NotificationBell';
import { ModuleRegistryContext, type ModuleRegistry } from './shell/registry';

function Notes() {
  const { path, navigate, setSubtitle } = useMiniApp();
  const [draft, setDraft] = useState('');
  return (
    <div>
      <h1>Notas de prueba</h1>
      <p>subruta={path || '(raíz)'}</p>
      <input aria-label="borrador" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button
        type="button"
        onClick={() => {
          navigate('/detalle');
          setSubtitle('Detalle');
        }}
      >
        Ver detalle
      </button>
    </div>
  );
}

const CATALOG = [
  app({ id: 'database', name: 'Base de datos', description: 'Gestor de bases de datos', icon: 'database', color: 'violet', category: 'data', keywords: ['sql'], status: 'planned' }),
  app({ id: 'tasks', name: 'Tareas', description: 'Gestor de tareas', icon: 'tasks', color: 'green', category: 'productivity', keywords: ['pendientes'], status: 'planned' }),
  app({ id: 'notes', name: 'Notas', description: 'Notas de prueba', category: 'productivity' }),
  app({ id: 'broken', name: 'Rota', description: 'No arranca', status: 'failed', error: 'Sin configuración' }),
];

const registry: ModuleRegistry = { notes: async () => ({ default: { Root: Notes } }) };

let server: FakeServer;

function renderApp() {
  return render(
    <ModuleRegistryContext.Provider value={registry}>
      <App />
    </ModuleRegistryContext.Provider>,
  );
}

const rail = () => screen.getByRole('navigation', { name: 'Mini apps' });
const launcher = async () => screen.findByRole('searchbox', { name: 'Buscar mini apps' });
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
const panel = () => screen.getByRole('tabpanel');
const cardNames = (container: HTMLElement) =>
  within(container)
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('.app-card-name')?.textContent);

/** L-11: un DataTransfer suficiente para arrastrar en jsdom. */
function dataTransfer() {
  const data: Record<string, string> = {};
  return {
    get types() {
      return Object.keys(data);
    },
    setData: (type: string, value: string) => {
      data[type] = value;
    },
    getData: (type: string) => data[type] ?? '',
    effectAllowed: '',
    dropEffect: '',
  };
}

beforeEach(() => {
  resetShell();
  server = installFakeServer({ catalog: CATALOG });
});

describe('L-01 a L-11 lanzador', () => {
  it('L-01 el grupo «Ocio» va el último', async () => {
    server.catalog = [...CATALOG, app({ id: 'lootboxes', name: 'Lootboxes', category: 'leisure' })];
    renderApp();
    await launcher();
    const groups = within(panel()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(['Datos', 'Productividad', 'Utilidades', 'Ocio']);
  });

  it('L-01: buscador con el foco, tres pestañas con su contador y, sin fijadas, «Todas las aplicaciones» por categoría', async () => {
    server.settings = { [RECENT_KEY]: ['notes'] };
    renderApp();
    const search = await launcher();
    expect(document.activeElement).toBe(search);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Fijadas0',
      'Usado recientemente1',
      'Todas las aplicaciones4',
    ]);
    expect(tab('Todas las aplicaciones').getAttribute('aria-selected')).toBe('true');
    const groups = within(panel()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(['Datos', 'Productividad', 'Utilidades']);
    const productivity = within(panel()).getByRole('region', { name: 'Productividad' });
    expect(cardNames(productivity)).toEqual(['Notas', 'Tareas']);
    // Cada mini app, una sola vez en pantalla.
    expect(screen.getAllByText('Notas')).toHaveLength(1);
  });

  it('L-01: con alguna fijada, Inicio se abre en «Fijadas»', async () => {
    server.settings = { [PINNED_KEY]: ['tasks', 'database'] };
    renderApp();
    await launcher();
    expect(tab('Fijadas').getAttribute('aria-selected')).toBe('true');
    expect(cardNames(panel())).toEqual(['Tareas', 'Base de datos']);
  });

  it('L-02: las tarjetas llevan su insignia, «Abierta» y el botón de fijar', async () => {
    renderApp();
    await launcher();
    const tasks = screen.getByRole('button', { name: /Tareas.*Gestor de tareas/ }).closest('li')!;
    expect(within(tasks).getByText('En preparación')).toBeTruthy();
    const broken = screen.getByRole('button', { name: /^Rota/ }).closest('li')!;
    expect(within(broken).getByText('Error')).toBeTruthy();
    const pin = within(tasks).getByRole('button', { name: 'Fijar Tareas' });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pin);
    expect(within(tasks).getByRole('button', { name: 'Desfijar Tareas' }).getAttribute('aria-pressed')).toBe('true');
    expect(tab('Fijadas').textContent).toBe('Fijadas1');

    expect(within(tasks).queryByText('Abierta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Tareas.*Gestor de tareas/ }));
    await screen.findByText(/Llegará en una versión próxima/);
    fireEvent.click(within(rail()).getByRole('button', { name: 'Inicio' }));
    await launcher();
    const again = screen.getByRole('button', { name: /Tareas.*Gestor de tareas/ }).closest('li')!;
    expect(within(again).getByText('Abierta')).toBeTruthy();
  });

  it('L-02, L-04: «Usado recientemente» dice cuándo se abrió cada una', async () => {
    const now = Date.now();
    const old = now - 3 * 24 * 3_600_000;
    server.settings = {
      [RECENT_KEY]: ['notes', 'tasks', 'database', 'broken'],
      [RECENT_AT_KEY]: { notes: now - 5 * 60_000, tasks: now - 3 * 3_600_000, database: old },
    };
    renderApp();
    await launcher();
    fireEvent.click(tab('Usado recientemente'));
    expect(cardNames(panel())).toEqual(['Notas', 'Tareas', 'Base de datos', 'Rota']);
    const meta = within(panel())
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.app-card-meta')?.textContent ?? null);
    expect(meta).toEqual(['Hace 5 min', 'Hace 3 h', formatDateTime(new Date(old).toISOString()), null]);
  });

  it('L-03: busca en todas, marca el primero con «Intro», avisa si no hay resultados y al vaciar vuelve la pestaña', async () => {
    server.settings = { [PINNED_KEY]: ['notes'] };
    renderApp();
    const search = await launcher();
    fireEvent.change(search, { target: { value: 'GESTOR' } });
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(cardNames(results)).toEqual(['Base de datos', 'Tareas']);
    expect(within(results).getAllByText('Intro')).toHaveLength(1);
    expect(within(results).getAllByRole('listitem')[0].textContent).toContain('Intro');
    expect(screen.queryByRole('tabpanel')).toBeNull();
    fireEvent.change(search, { target: { value: 'pruébá' } });
    expect(within(screen.getByRole('region', { name: 'Resultados' })).getByText('Notas')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'xyz' } });
    expect(screen.getByText('Ninguna mini app coincide con «xyz»')).toBeTruthy();
    fireEvent.change(search, { target: { value: '' } });
    expect(tab('Fijadas').getAttribute('aria-selected')).toBe('true');
    expect(cardNames(panel())).toEqual(['Notas']);
    fireEvent.change(search, { target: { value: 'sql' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(window.location.hash).toBe('#/apps/database');
  });

  it('L-07: si no se puede cargar el catálogo, muestra el error y «Reintentar»', async () => {
    server.catalog = { error: 'Error interno del servidor' };
    renderApp();
    expect(await screen.findByText('No se pudo cargar el catálogo: Error interno del servidor')).toBeTruthy();
    server.catalog = CATALOG;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('tablist', { name: 'Listas de mini apps' })).toBeTruthy();
  });

  it('L-08: desfijar en «Fijadas» no mueve nada; se puede volver a fijar en su sitio y se va al cambiar de pestaña', async () => {
    server.settings = { [PINNED_KEY]: ['tasks', 'notes', 'database'] };
    renderApp();
    await launcher();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Desfijar Notas' }));
    expect(cardNames(panel())).toEqual(['Tareas', 'Notas', 'Base de datos']);
    expect(within(panel()).getByRole('button', { name: 'Fijar Notas' }).textContent).toBe('☆');
    expect(tab('Fijadas').textContent).toBe('Fijadas2');
    expect(useNav.getState().pinned).toEqual(['tasks', 'database']);

    fireEvent.click(within(panel()).getByRole('button', { name: 'Fijar Notas' }));
    expect(useNav.getState().pinned).toEqual(['tasks', 'notes', 'database']);
    expect(cardNames(panel())).toEqual(['Tareas', 'Notas', 'Base de datos']);

    fireEvent.click(within(panel()).getByRole('button', { name: 'Desfijar Tareas' }));
    fireEvent.click(tab('Todas las aplicaciones'));
    fireEvent.click(tab('Fijadas'));
    expect(cardNames(panel())).toEqual(['Notas', 'Base de datos']);
  });

  it('L-09: las pestañas vacías lo explican y «Ver todas las aplicaciones» lleva a la tercera', async () => {
    renderApp();
    await launcher();
    fireEvent.click(tab('Fijadas'));
    expect(
      within(panel()).getByText(
        'No hay mini apps fijadas. Pulsa ☆ en una tarjeta para tenerla aquí, en la barra lateral y en Alt+1 a Alt+9.',
      ),
    ).toBeTruthy();
    fireEvent.click(tab('Usado recientemente'));
    expect(within(panel()).getByText('Todavía no se ha abierto ninguna mini app.')).toBeTruthy();
    fireEvent.click(tab('Fijadas'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Ver todas las aplicaciones' }));
    expect(tab('Todas las aplicaciones').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Todas las aplicaciones'));
  });

  it('L-10: Ctrl+1 a Ctrl+3, las flechas en las pestañas y en las tarjetas, y una letra vuelve al buscador', async () => {
    server.settings = { [PINNED_KEY]: ['tasks', 'notes'] };
    renderApp();
    const search = await launcher();
    fireEvent.keyDown(search, { key: '3', code: 'Digit3', ctrlKey: true });
    expect(tab('Todas las aplicaciones').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(search, { key: '2', code: 'Digit2', ctrlKey: true });
    expect(tab('Usado recientemente').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(search, { key: '1', code: 'Digit1', ctrlKey: true });
    expect(tab('Fijadas').getAttribute('aria-selected')).toBe('true');

    tab('Fijadas').focus();
    fireEvent.keyDown(tab('Fijadas'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab('Usado recientemente'));
    expect(tab('Usado recientemente').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(tab('Todas las aplicaciones').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(tab('Fijadas').getAttribute('aria-selected')).toBe('true');

    search.focus();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const [first, second] = within(panel()).getAllByRole('button', { name: /Gestor de tareas|Notas de prueba/ });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
    // En jsdom todas las tarjetas están en la misma fila: ↑ vuelve al buscador.
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(search);

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'b' });
    expect(document.activeElement).toBe(search);
    expect((search as HTMLInputElement).value).toBe('b');
    expect(screen.getByRole('region', { name: 'Resultados' })).toBeTruthy();
  });

  it('L-11: Ctrl+← y Ctrl+→ y arrastrar cambian el orden de las fijadas, que se guarda', async () => {
    server.settings = { [PINNED_KEY]: ['tasks', 'notes', 'database'] };
    renderApp();
    await launcher();
    const tasks = within(panel()).getByRole('button', { name: /Gestor de tareas/ });
    tasks.focus();
    fireEvent.keyDown(tasks, { key: 'ArrowRight', ctrlKey: true });
    expect(useNav.getState().pinned).toEqual(['notes', 'tasks', 'database']);
    expect(cardNames(panel())).toEqual(['Notas', 'Tareas', 'Base de datos']);
    expect(document.activeElement).toBe(tasks);
    fireEvent.keyDown(tasks, { key: 'ArrowLeft', ctrlKey: true });
    expect(useNav.getState().pinned).toEqual(['tasks', 'notes', 'database']);
    // N-04: la barra lateral sigue el mismo orden.
    const railPinned = within(rail()).getByRole('list', { name: 'Fijadas' });
    expect(within(railPinned).getAllByRole('button').map((b) => b.querySelector('.sr-only')?.textContent)).toEqual([
      'Tareas',
      'Notas',
      'Base de datos',
    ]);

    const items = within(panel()).getAllByRole('listitem');
    const transfer = dataTransfer();
    fireEvent.dragStart(items[2], { dataTransfer: transfer });
    fireEvent.dragOver(items[0], { dataTransfer: transfer });
    fireEvent.drop(items[0], { dataTransfer: transfer });
    expect(useNav.getState().pinned).toEqual(['database', 'tasks', 'notes']);
    expect(cardNames(panel())).toEqual(['Base de datos', 'Tareas', 'Notas']);
    await act(async () => {
      await flushShellState();
    });
    expect(server.settings[PINNED_KEY]).toEqual(['database', 'tasks', 'notes']);
  });
});

describe('N-01 a N-08 navegación', () => {
  it('L-05, N-04, N-07, N-08: abrir una mini app la muestra, la añade a la barra lateral y cambia el título', async () => {
    renderApp();
    await launcher();
    fireEvent.click(screen.getByRole('button', { name: /Tareas.*Gestor de tareas/ }));
    expect(window.location.hash).toBe('#/apps/tasks');
    expect(await screen.findByText('Esta mini app aún no está disponible. Llegará en una versión próxima.')).toBeTruthy();
    expect(document.title).toBe('Tareas · Cajón de sastre');
    const tasksButton = within(rail()).getByRole('button', { name: 'Tareas (abierta)' });
    expect(tasksButton.getAttribute('aria-current')).toBe('page');
    expect(within(screen.getByRole('navigation', { name: 'Miga de pan' })).getByText('Tareas')).toBeTruthy();

    fireEvent.click(within(rail()).getByRole('button', { name: 'Inicio' }));
    expect(await launcher()).toBeTruthy();
    expect(document.title).toBe('Cajón de sastre');
    fireEvent.click(tab('Usado recientemente'));
    expect(cardNames(panel())).toEqual(['Tareas']);
    expect(within(panel()).getByText('Ahora')).toBeTruthy();
  });

  it('N-05, N-07: al volver, una mini app abierta conserva su estado y su subruta', async () => {
    renderApp();
    await launcher();
    fireEvent.click(screen.getByRole('button', { name: /Notas.*Notas de prueba/ }));
    fireEvent.change(await screen.findByLabelText('borrador'), { target: { value: 'sin guardar' } });
    fireEvent.click(screen.getByText('Ver detalle'));
    expect(window.location.hash).toBe('#/apps/notes/detalle');
    expect(within(screen.getByRole('navigation', { name: 'Miga de pan' })).getByText('Detalle')).toBeTruthy();

    fireEvent.click(within(rail()).getByRole('button', { name: 'Inicio' }));
    await launcher();
    fireEvent.click(within(rail()).getByRole('button', { name: 'Notas (abierta)' }));
    expect(window.location.hash).toBe('#/apps/notes/detalle');
    expect(((await screen.findByLabelText('borrador')) as HTMLInputElement).value).toBe('sin guardar');
    expect(screen.getByText('subruta=/detalle')).toBeTruthy();
  });

  it('N-06: cerrar desmonta la activa y muestra la abierta usada más recientemente', async () => {
    renderApp();
    await launcher();
    fireEvent.click(screen.getByRole('button', { name: /Notas.*Notas de prueba/ }));
    fireEvent.change(await screen.findByLabelText('borrador'), { target: { value: 'se perderá' } });
    act(() => {
      window.location.hash = '#/apps/tasks';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await screen.findByText(/Llegará en una versión próxima/);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Tareas' }));
    expect(window.location.hash).toBe('#/apps/notes');
    expect(within(rail()).queryByRole('button', { name: /Tareas/ })).toBeNull();
    // Alt+W cierra Notas: ya no queda ninguna y se vuelve a Inicio.
    fireEvent.keyDown(window, { key: 'w', code: 'KeyW', altKey: true });
    expect(await launcher()).toBeTruthy();
    expect(useNav.getState().open).toEqual([]);
    // Ahora aparece también en «Recientes».
    fireEvent.click(screen.getAllByRole('button', { name: /Notas.*Notas de prueba/ })[0]);
    expect(((await screen.findByLabelText('borrador')) as HTMLInputElement).value).toBe('');
  });

  it(`N-05: con ${MAX_OPEN} abiertas, abrir otra cierra la que lleva más tiempo sin usarse`, async () => {
    server.catalog = Array.from({ length: 6 }, (_, i) => app({ id: `app-${i + 1}`, name: `App ${i + 1}`, status: 'planned' }));
    renderApp();
    await launcher();
    for (let i = 1; i <= 6; i++) {
      act(() => {
        window.location.hash = `#/apps/app-${i}`;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await screen.findByRole('heading', { name: `App ${i}` });
    }
    expect(useNav.getState().open).toEqual(['app-2', 'app-3', 'app-4', 'app-5', 'app-6']);
  });

  it('N-01: una ruta mal formada o de una mini app que no existe lleva a Inicio', async () => {
    window.history.replaceState(null, '', '#/apps/no-existe');
    renderApp();
    expect(await screen.findByText('La mini app «no-existe» no existe')).toBeTruthy();
    expect(window.location.hash).toBe('#/');
    act(() => {
      window.location.hash = '#/esto/no/es/una/ruta';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(window.location.hash).toBe('#/'));
  });

  it('N-03: sin ruta, vuelve a la última visitada si su mini app sigue en el catálogo', async () => {
    server.settings = { [LAST_ROUTE_KEY]: '#/apps/notes/detalle' };
    renderApp();
    expect(await screen.findByText('subruta=/detalle')).toBeTruthy();
    expect(window.location.hash).toBe('#/apps/notes/detalle');
  });

  it('N-03: si la última ruta es de una mini app que ya no existe, abre Inicio', async () => {
    server.settings = { [LAST_ROUTE_KEY]: '#/apps/quitada' };
    renderApp();
    expect(await launcher()).toBeTruthy();
    expect(window.location.hash).toBe('#/');
  });

  it('L-04, D-04: fijadas, recientes y última ruta se guardan, y se olvidan las que ya no están', async () => {
    server.settings = { [PINNED_KEY]: ['quitada', 'tasks'], [RECENT_KEY]: ['quitada'] };
    renderApp();
    await launcher();
    expect(within(rail()).getByRole('button', { name: 'Tareas' })).toBeTruthy();
    expect(tab('Usado recientemente').textContent).toBe('Usado recientemente0');
    fireEvent.click(within(rail()).getByRole('button', { name: 'Tareas' }));
    await screen.findByText(/Llegará en una versión próxima/);
    await act(async () => {
      await flushShellState();
    });
    expect(server.settings[RECENT_KEY]).toEqual(['tasks']);
    expect(server.settings[LAST_ROUTE_KEY]).toBe('#/apps/tasks');
  });
});

describe('N-09 «Ir a…»', () => {
  it('Ctrl+K abre la paleta, filtra, elige con las flechas, abre con Intro y Esc la cierra', async () => {
    renderApp();
    await launcher();
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true });
    const dialog = screen.getByRole('dialog', { name: 'Ir a…' });
    const input = within(dialog).getByRole('combobox');
    expect(document.activeElement).toBe(input);
    expect(within(dialog).getAllByRole('option').map((o) => o.querySelector('.palette-label')?.textContent)).toEqual([
      'Inicio',
      'Ajustes',
      'Base de datos',
      'Notas',
      'Rota',
      'Tareas',
    ]);
    fireEvent.change(input, { target: { value: 'gestor' } });
    expect(within(dialog).getAllByRole('option').map((o) => o.querySelector('.palette-label')?.textContent)).toEqual([
      'Base de datos',
      'Tareas',
    ]);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(within(dialog).getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByRole('dialog', { name: 'Ir a…' })).toBeNull();
    expect(window.location.hash).toBe('#/apps/tasks');

    fireEvent.click(screen.getByRole('button', { name: /Ir a…/ }));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Ir a…' })).toBeNull();
  });
});

describe('N-10 atajos del shell', () => {
  it('Alt+número abre la fijada, Alt+0 Inicio y Alt+AvPág/RePág recorren la barra lateral', async () => {
    server.settings = { [PINNED_KEY]: ['tasks', 'database'] };
    renderApp();
    await launcher();
    fireEvent.keyDown(window, { key: '2', code: 'Digit2', altKey: true });
    expect(window.location.hash).toBe('#/apps/database');
    fireEvent.keyDown(window, { key: '0', code: 'Digit0', altKey: true });
    expect(window.location.hash).toBe('#/');
    fireEvent.keyDown(window, { key: 'PageDown', code: 'PageDown', altKey: true });
    expect(window.location.hash).toBe('#/apps/tasks');
    fireEvent.keyDown(window, { key: 'PageDown', code: 'PageDown', altKey: true });
    expect(window.location.hash).toBe('#/apps/database');
    fireEvent.keyDown(window, { key: 'PageDown', code: 'PageDown', altKey: true });
    expect(window.location.hash).toBe('#/');
    fireEvent.keyDown(window, { key: 'PageUp', code: 'PageUp', altKey: true });
    expect(window.location.hash).toBe('#/apps/database');
    // Una posición sin fijada no hace nada.
    fireEvent.keyDown(window, { key: '9', code: 'Digit9', altKey: true });
    expect(window.location.hash).toBe('#/apps/database');
  });
});

describe('U-06 «Ajustes»', () => {
  it('carga, valida y guarda el puerto y el apagado automático', async () => {
    renderApp();
    await launcher();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajustes' });
    const port = await within(dialog).findByLabelText(/Puerto/);
    expect((port as HTMLInputElement).value).toBe('47800');
    fireEvent.change(port, { target: { value: '80' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('El puerto debe estar entre 1024 y 65535')).toBeTruthy();
    fireEvent.change(port, { target: { value: '47900' } });
    fireEvent.change(within(dialog).getByLabelText(/Apagado automático/), { target: { value: '30' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ajustes' })).toBeNull());
    expect(server.config).toEqual({
      port: 47900,
      autoShutdownMinutes: 30,
      updateRepository: null,
      notificationSound: true,
      desktopNotifications: true,
    });
    expect(screen.getByText('Ajustes guardados. El puerto nuevo se usará al siguiente arranque.')).toBeTruthy();
  });

  it('Esc cierra sin guardar', async () => {
    renderApp();
    await launcher();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajustes' });
    fireEvent.change(await within(dialog).findByLabelText(/Puerto/), { target: { value: '48000' } });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Ajustes' })).toBeNull();
    expect(server.config.port).toBe(47800);
  });
});

describe('U-08 barra superior', () => {
  it('el logotipo y el nombre son el enlace a Inicio', async () => {
    window.history.replaceState(null, '', '#/apps/tasks');
    renderApp();
    await screen.findByText(/Llegará en una versión próxima/);
    fireEvent.click(screen.getByRole('link', { name: 'Cajón de sastre' }));
    expect(await launcher()).toBeTruthy();
  });
});
