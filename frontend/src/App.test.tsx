import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { App } from './App';
import { useMiniApp } from './platform';
import { app, installFakeServer, resetShell, type FakeServer } from './test/fakeServer';
import { flushShellState, LAST_ROUTE_KEY, MAX_OPEN, PINNED_KEY, RECENT_KEY, useNav } from './shell/navStore';
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

beforeEach(() => {
  resetShell();
  server = installFakeServer({ catalog: CATALOG });
});

describe('L-01 a L-03 lanzador', () => {
  it('muestra el buscador con el foco y las mini apps agrupadas por categoría en orden alfabético', async () => {
    renderApp();
    const search = await launcher();
    expect(document.activeElement).toBe(search);
    const all = screen.getByRole('region', { name: 'Todas' });
    const groups = within(all).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(['Datos', 'Productividad', 'Utilidades']);
    const productivity = within(all).getByRole('region', { name: 'Productividad' });
    expect(within(productivity).getAllByRole('listitem').map((li) => li.querySelector('.app-card-name')?.textContent)).toEqual([
      'Notas',
      'Tareas',
    ]);
    expect(screen.queryByRole('region', { name: 'Fijadas' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Recientes' })).toBeNull();
  });

  it('L-02: las tarjetas llevan su insignia y el botón de fijar', async () => {
    renderApp();
    await launcher();
    const tasks = screen.getByRole('button', { name: /Tareas.*Gestor de tareas/ }).closest('li')!;
    expect(within(tasks).getByText('En preparación')).toBeTruthy();
    const broken = screen.getByRole('button', { name: /^Rota/ }).closest('li')!;
    expect(within(broken).getByText('Error')).toBeTruthy();
    const pin = within(tasks).getByRole('button', { name: 'Fijar Tareas' });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pin);
    expect(screen.getAllByRole('button', { name: 'Desfijar Tareas' })[0].getAttribute('aria-pressed')).toBe('true');
    expect(within(screen.getByRole('region', { name: 'Fijadas' })).getByText('Tareas')).toBeTruthy();
  });

  it('L-03: filtra sin acentos, Intro abre el primero y avisa si no hay resultados', async () => {
    renderApp();
    const search = await launcher();
    fireEvent.change(search, { target: { value: 'GESTOR' } });
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(within(results).getAllByRole('listitem').map((li) => li.querySelector('.app-card-name')?.textContent)).toEqual([
      'Base de datos',
      'Tareas',
    ]);
    expect(screen.queryByRole('region', { name: 'Todas' })).toBeNull();
    fireEvent.change(search, { target: { value: 'pruébá' } });
    expect(within(screen.getByRole('region', { name: 'Resultados' })).getByText('Notas')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'xyz' } });
    expect(screen.getByText('Ninguna mini app coincide con «xyz»')).toBeTruthy();
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
    expect(await screen.findByRole('region', { name: 'Todas' })).toBeTruthy();
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
    expect(within(screen.getByRole('region', { name: 'Recientes' })).getByText('Tareas')).toBeTruthy();
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
    expect(screen.queryByRole('region', { name: 'Recientes' })).toBeNull();
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
    expect(server.config).toEqual({ port: 47900, autoShutdownMinutes: 30 });
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
