import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UpdateCheck, UpdateStatus } from '../api';
import { appStateDoc } from '../platform/appState';
import { app, installFakeServer, resetShell, type FakeServer } from '../test/fakeServer';
import { useCatalog } from './catalogStore';
import { SettingsDialog } from './SettingsDialog';
import { useUi } from './uiStore';
import { formatDateTime } from './UpdateSettings';

const REPOSITORY = 'https://github.com/demo/app';
const AVAILABLE: UpdateStatus = { version: '0.1.0', build: 5, commit: '0123456789', available: true, reason: null };
const NEWER: UpdateCheck = {
  newer: true,
  latest: {
    build: 6,
    version: '0.1.0',
    commit: 'abcdef0123',
    date: '2026-11-02T10:15:00Z',
    size: 1024,
    sha256: 'a'.repeat(64),
    commits: ['Corrige el orden de la lista', 'Añade una columna'],
  },
};

let server: FakeServer;

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const repositoryField = () => screen.getByLabelText('URL del repositorio') as HTMLInputElement;

/** Abre «Ajustes» en la categoría «Actualizaciones», ya cargada. */
async function openUpdates() {
  render(<SettingsDialog />);
  const dialog = await screen.findByRole('dialog', { name: 'Ajustes' });
  await within(dialog).findByLabelText(/Puerto/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Actualizaciones' }));
  await within(dialog).findByText(/^0\.1\.0, /);
  return dialog;
}

async function search() {
  await act(async () => {
    fireEvent.click(button('Buscar actualizaciones'));
  });
}

async function askToUpdate() {
  await search();
  await act(async () => {
    fireEvent.click(button('Actualizar'));
  });
}

beforeEach(() => {
  resetShell();
  server = installFakeServer({ config: { port: 47800, autoShutdownMinutes: null, updateRepository: REPOSITORY } });
  server.update.status = AVAILABLE;
  server.update.check = NEWER;
  useUi.setState({ settingsOpen: true });
});

describe('R-10 categoría «Actualizaciones»', () => {
  it('R-10 U-06: va después de «General» y muestra la versión, el build, el commit y la URL guardada', async () => {
    const dialog = await openUpdates();
    const categories = within(within(dialog).getByRole('list', { name: 'Categorías' })).getAllByRole('button');
    expect(categories.map((c) => c.textContent)).toEqual(['General', 'Actualizaciones']);
    expect(within(dialog).getByRole('heading', { name: 'Actualizaciones' })).toBeTruthy();
    expect(within(dialog).getByText('0.1.0, build 5, commit 0123456')).toBeTruthy();
    expect(repositoryField().value).toBe(REPOSITORY);
  });

  it('R-06 R-10: un JAR compilado a mano lo dice', async () => {
    server.update.status = { ...AVAILABLE, build: 0, commit: '' };
    await openUpdates();
    expect(screen.getByText('0.1.0, compilada a mano')).toBeTruthy();
  });

  it('R-14: si no está disponible dice el motivo y no ofrece los botones', async () => {
    server.update.status = { ...AVAILABLE, available: false, reason: 'Las actualizaciones solo funcionan en la instalación de Ubuntu.' };
    await openUpdates();
    expect(screen.getByText('Las actualizaciones solo funcionan en la instalación de Ubuntu.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Buscar actualizaciones' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actualizar' })).toBeNull();
  });
});

describe('R-11 URL del repositorio', () => {
  it('R-11: sin URL guardada no se puede buscar', async () => {
    server.config = { ...server.config, updateRepository: null };
    await openUpdates();
    expect(repositoryField().value).toBe('');
    expect(button('Buscar actualizaciones').disabled).toBe(true);
    expect(button('Actualizar').disabled).toBe(true);
  });

  it('R-11: una URL escrita y sin guardar todavía no vale', async () => {
    await openUpdates();
    fireEvent.change(repositoryField(), { target: { value: 'https://github.com/demo/otra' } });
    expect(screen.getByText('Guarda los ajustes para usar esta URL.')).toBeTruthy();
    expect(button('Buscar actualizaciones').disabled).toBe(true);
  });

  it('R-11 U-06: «Guardar» guarda la URL con el resto de ajustes', async () => {
    server.config = { ...server.config, updateRepository: null };
    await openUpdates();
    fireEvent.change(repositoryField(), { target: { value: ` ${REPOSITORY} ` } });
    fireEvent.click(button('Guardar'));
    await waitFor(() => expect(useUi.getState().settingsOpen).toBe(false));
    expect(server.config).toEqual({ port: 47800, autoShutdownMinutes: null, updateRepository: REPOSITORY });
  });

  it('R-11: «Guardar» rechaza una URL que no es de un repositorio de GitHub', async () => {
    const dialog = await openUpdates();
    fireEvent.change(repositoryField(), { target: { value: 'https://evil.example/demo/app' } });
    fireEvent.click(button('Guardar'));
    expect(await within(dialog).findByText(/debe ser https:\/\/github\.com\//)).toBeTruthy();
    expect(useUi.getState().settingsOpen).toBe(true);
    expect(server.config.updateRepository).toBe(REPOSITORY);
  });

  it('R-11: vaciar el campo quita la URL', async () => {
    await openUpdates();
    fireEvent.change(repositoryField(), { target: { value: '  ' } });
    fireEvent.click(button('Guardar'));
    await waitFor(() => expect(useUi.getState().settingsOpen).toBe(false));
    expect(server.config.updateRepository).toBeNull();
  });

  it('R-12: abrir «Ajustes» y la categoría no busca nada', async () => {
    await openUpdates();
    expect(server.callsTo('POST', '/api/update')).toEqual([]);
  });
});

describe('R-13 búsqueda', () => {
  it('R-13: sin nada nuevo dice «Tienes la última versión»', async () => {
    server.update.check = { ...NEWER, newer: false, latest: { ...NEWER.latest, build: 5 } };
    await openUpdates();
    await search();
    expect(screen.getByRole('status').textContent).toBe('Tienes la última versión');
    expect(button('Actualizar').disabled).toBe(true);
  });

  it('R-13: con una versión nueva muestra build, fecha, commit y commits, y activa «Actualizar»', async () => {
    await openUpdates();
    await search();
    const release = screen.getByRole('region', { name: 'Versión disponible' });
    expect(within(release).getByText(`Build 6, ${formatDateTime(NEWER.latest.date)}, commit abcdef0`)).toBeTruthy();
    expect(within(release).getAllByRole('listitem').map((li) => li.textContent)).toEqual(NEWER.latest.commits);
    expect(button('Actualizar').disabled).toBe(false);
  });

  it('R-13: si falla dice el motivo', async () => {
    server.update.check = { error: 'La firma de la versión publicada no es válida: no se instalará' };
    await openUpdates();
    await search();
    expect(screen.getByRole('alert').textContent).toBe('La firma de la versión publicada no es válida: no se instalará');
    expect(button('Actualizar').disabled).toBe(true);
  });

  it('U-02: la fecha va como dd/MM/yyyy HH:mm en la hora local', () => {
    expect(formatDateTime(new Date(2026, 10, 2, 9, 5).toISOString())).toBe('02/11/2026 09:05');
  });
});

describe('R-40 instalación', () => {
  it('R-40: pide confirmación con el build, el commit y los commits, y avisa del reinicio', async () => {
    await openUpdates();
    await askToUpdate();
    const confirm = screen.getByRole('alertdialog', { name: 'Actualizar Cajón de sastre' });
    expect(within(confirm).getByText(/Se instalará el build 6 \(commit abcdef0\) y Cajón de sastre se reiniciará/)).toBeTruthy();
    expect(within(confirm).getAllByRole('listitem').map((li) => li.textContent)).toEqual(NEWER.latest.commits);
    expect(server.update.applied).toEqual([]);
  });

  it('R-40 R-43: confirmar instala el build mostrado y cierra «Ajustes»', async () => {
    await openUpdates();
    await askToUpdate();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Actualizar ahora' }));
    });
    expect(server.update.applied).toEqual([6]);
    expect(useUi.getState().updating).toBe(true);
    expect(useUi.getState().settingsOpen).toBe(false);
    expect(useUi.getState().notices.at(-1)?.text).toBe('Actualizando Cajón de sastre: la ventana se recargará sola.');
  });

  it('R-40: cancelar, o Esc, no instala nada y deja «Ajustes» abierto', async () => {
    await openUpdates();
    await askToUpdate();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {
      fireEvent.click(button('Actualizar'));
    });
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useUi.getState().settingsOpen).toBe(true);
    expect(server.update.applied).toEqual([]);
    expect(useUi.getState().updating).toBe(false);
  });

  it('R-41: antes de confirmar guarda el estado pendiente de las mini apps', async () => {
    const doc = appStateDoc('notes');
    await doc.load();
    doc.set('filtro', 'pendientes');
    await openUpdates();
    await askToUpdate();
    expect(server.appStates.notes).toEqual({ filtro: 'pendientes' });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('R-41: si el estado de una mini app no se puede guardar, no actualiza y dice de cuál', async () => {
    useCatalog.setState({ apps: [app({ id: 'notes', name: 'Notas' })], status: 'ready' });
    const doc = appStateDoc('notes');
    await doc.load();
    const fakeFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, options: RequestInit = {}) =>
      String(input) === '/api/app-state/notes' && options.method === 'PUT'
        ? new Response(JSON.stringify({ code: 'internal_error', message: 'Error interno del servidor', details: null }), { status: 500 })
        : fakeFetch(input, options)) as typeof fetch;
    doc.set('filtro', 'pendientes');
    await openUpdates();
    await askToUpdate();
    expect(screen.getByRole('alert').textContent).toBe('No se puede actualizar: no se pudo guardar el estado de Notas.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(server.update.applied).toEqual([]);
  });
});
