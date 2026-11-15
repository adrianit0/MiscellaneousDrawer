import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { ReposApp } from '../apps/repos/ReposApp';
import { createAppApi } from '../platform/appApi';
import { jobSummary, pendingLabel, stateLabel, type Job, type Repo, type Status } from '../apps/repos/types';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** RG-40 a RG-45: la interfaz de «Repositorios», con su API simulada. No ejecuta git. Datos inventados (S-31). */

const BASE = '/api/apps/repos';

const DEMO: Repo = { id: 1, name: 'api-demo', dir: '/srv/git/api-demo', remoteUrl: 'https://git.example.com/demo/api-demo.git', defaultBranch: 'develop' };
const OTRA: Repo = { id: 2, name: 'api-otra', dir: '/srv/git/api-otra', remoteUrl: 'git@git.example.com:demo/api-otra.git', defaultBranch: 'main' };

const OK: Status = {
  id: 1,
  state: 'ok',
  branch: 'develop',
  head: 'abcdef01',
  changes: 0,
  untracked: 0,
  ahead: 0,
  behind: 0,
  branches: ['develop', 'hotfix'],
  remoteMatches: true,
  error: null,
};
const MISSING: Status = { ...OK, id: 2, state: 'missing', branch: null, head: null, changes: null, untracked: null, ahead: null, behind: null, branches: [], remoteMatches: null };

interface Backend {
  repos: Repo[];
  statuses: Status[];
  warning: string | null;
  job: Job | null;
  /** Lo que devuelve el trabajo iniciado: en marcha y, a la siguiente consulta, terminado con esto. */
  outcome: Partial<Job>;
  fail: { status: number; code: string; message: string; details?: unknown } | null;
}

let server: FakeServer;
let backend: Backend;
let notices: { text: string; kind: string | undefined }[];
let shownConsoles: number[];

function route(call: Call): { status?: number; body?: unknown } | undefined {
  const path = call.url.slice(BASE.length);
  if (call.method !== 'GET' && backend.fail) {
    const f = backend.fail;
    backend.fail = null;
    return { status: f.status, body: { code: f.code, message: f.message, details: f.details ?? null } };
  }
  if (path === '/repos' && call.method === 'GET') return { body: { repos: backend.repos } };
  if (path === '/repos' && call.method === 'POST') {
    const created = { ...(call.body as Omit<Repo, 'id'>), id: 7 };
    backend.repos = [...backend.repos, created];
    return { status: 201, body: created };
  }
  if (path === '/status') return { body: { statuses: backend.statuses, warning: backend.warning } };
  if (path === '/job' && call.method === 'GET') {
    const current = backend.job;
    // Un trabajo en marcha termina en la consulta siguiente.
    if (current?.state === 'running' && backend.outcome.state !== 'running') {
      backend.job = { ...current, state: 'succeeded', finishedAt: '2026-01-01T10:00:05Z', ...backend.outcome };
    }
    return { body: { job: current } };
  }
  if (path === '/jobs') {
    const body = call.body as { action: Job['action']; repoId?: number };
    const targets = body.repoId === undefined ? backend.repos : backend.repos.filter((r) => r.id === body.repoId);
    backend.job = {
      id: 1,
      action: body.action,
      state: 'running',
      startedAt: '2026-01-01T10:00:00Z',
      finishedAt: null,
      message: null,
      consoleId: 41,
      repos: targets.map((r) => ({ repoId: r.id, name: r.name, result: 'running', detail: null })),
    };
    return { status: 202, body: { job: backend.job } };
  }
  if (path === '/job/cancel') {
    backend.job = { ...backend.job!, state: 'cancelled', message: 'Trabajo cancelado' };
    return { body: { cancelling: true } };
  }
  const match = /^\/repos\/(\d+)$/.exec(path);
  if (!match) return undefined;
  const id = Number(match[1]);
  if (call.method === 'PUT') {
    const updated = { ...(call.body as Omit<Repo, 'id'>), id };
    backend.repos = backend.repos.map((r) => (r.id === id ? updated : r));
    return { body: updated };
  }
  if (call.method === 'DELETE') {
    backend.repos = backend.repos.filter((r) => r.id !== id);
    return { body: { deleted: true } };
  }
  return undefined;
}

/** Como en AppFrame: el cliente es el mismo aunque cambie si la mini app se ve. */
const api = createAppApi('repos');

function Harness({ active = true }: { active?: boolean }) {
  const value = useMemo(
    () =>
      testContext({
        id: 'repos',
        api,
        active,
        notify: (text, kind) => notices.push({ text, kind }),
        showConsole: (id) => shownConsoles.push(id),
      }),
    [active],
  );
  return (
    <InApp value={value}>
      <ReposApp />
    </InApp>
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const statusCalls = () => server.callsTo('GET', `${BASE}/status`);
const jobs = () => server.callsTo('POST', `${BASE}/jobs`).map((c) => c.body);
const tableRows = () => within(screen.getByRole('table', { name: 'Repositorios' })).getAllByRole('row').slice(1);
const rowOf = (name: string) => tableRows().find((tr) => within(tr).queryByText(name))!;
const cells = (name: string) =>
  within(rowOf(name))
    .getAllByRole('cell')
    .slice(2, 4)
    .map((td) => td.textContent);
const summary = () => screen.getByRole('status', { name: 'Trabajo' }).textContent;

async function open(active = true) {
  const view = render(<Harness active={active} />);
  await screen.findByRole('button', { name: 'Nuevo repositorio' });
  return view;
}

async function openLoaded() {
  const view = await open();
  await waitFor(() => expect(cells('api-demo')[0]).toBe('Limpio'));
  return view;
}

async function menu(name: string, item: string) {
  fireEvent.click(button(`Más acciones de ${name}`));
  await act(async () => {
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: item }));
  });
}

beforeEach(() => {
  resetShell();
  notices = [];
  shownConsoles = [];
  backend = { repos: [DEMO, OTRA], statuses: [OK, MISSING], warning: null, job: null, outcome: {}, fail: null };
  server = installFakeServer({ appRoutes: route });
});

describe('RG-40 RG-41 tabla', () => {
  it('RG-40: muestra los repositorios con su rama, su estado y sus pendientes, y las acciones de arriba', async () => {
    await openLoaded();
    expect(tableRows()).toHaveLength(2);
    expect((screen.getByRole('combobox', { name: 'Rama de api-demo' }) as HTMLSelectElement).value).toBe('develop');
    expect(cells('api-demo')).toEqual(['Limpio', 'Al día']);
    expect(cells('api-otra')).toEqual(['Sin clonar', '—']);
    expect(within(rowOf('api-demo')).getByText('/srv/git/api-demo')).toBeTruthy();
    for (const name of ['Actualizar todas', 'Consultar todas', 'Refrescar', 'Nuevo repositorio']) expect(button(name).disabled).toBe(false);
    // RG-42: el clonado tiene «Actualizar»; el que falta, «Clonar».
    expect(within(rowOf('api-demo')).getByRole('button', { name: 'Actualizar' })).toBeTruthy();
    expect(within(rowOf('api-otra')).queryByRole('button', { name: 'Actualizar' })).toBeNull();
    expect(within(rowOf('api-otra')).getByRole('button', { name: 'Clonar' })).toBeTruthy();
  });

  it('RG-40: sin repositorios lo dice e invita a crear uno', async () => {
    backend.repos = [];
    backend.statuses = [];
    await open();
    expect(screen.getByText(/No hay ningún repositorio\. Añade uno con «Nuevo repositorio»/)).toBeTruthy();
    expect(button('Actualizar todas').disabled).toBe(true);
    expect(button('Consultar todas').disabled).toBe(true);
  });

  it('RG-41: los textos del estado y de los pendientes', () => {
    expect(stateLabel({ ...OK, changes: 1 })).toBe('1 cambio');
    expect(stateLabel({ ...OK, changes: 3, untracked: 2 })).toBe('3 cambios, 2 sin seguimiento');
    expect(stateLabel({ ...OK, untracked: 2 })).toBe('2 sin seguimiento');
    expect(stateLabel({ ...OK, state: 'not_git' })).toBe('No es un repositorio');
    expect(stateLabel({ ...OK, state: 'error', error: 'fatal: bad object HEAD' })).toBe('fatal: bad object HEAD');
    expect(pendingLabel({ ...OK, behind: 4 })).toBe('↓ 4');
    expect(pendingLabel({ ...OK, ahead: 2, behind: 1 })).toBe('↓ 1 ↑ 2');
    expect(pendingLabel({ ...OK, ahead: null, behind: null })).toBe('—');
  });

  it('RG-41: con la cabecera suelta muestra el commit', async () => {
    backend.statuses = [{ ...OK, branch: null, ahead: null, behind: null }, MISSING];
    await open();
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Rama de api-demo' }) as HTMLSelectElement).value).toBe('(abcdef01)'));
  });

  it('RG-15: avisa si no hay git', async () => {
    backend.warning = 'No se encontró el comando «git»';
    backend.statuses = [
      { ...MISSING, id: 1, state: 'error', error: backend.warning },
      { ...MISSING, state: 'error', error: backend.warning },
    ];
    await open();
    expect(await screen.findAllByText('No se encontró el comando «git»')).toHaveLength(3);
  });
});

describe('RG-41 a RG-43 acciones', () => {
  it('RG-42 RG-43: «Actualizar» inicia el trabajo, y al terminar avisa y refresca el estado', async () => {
    backend.outcome = { message: 'Actualizado', repos: [{ repoId: 1, name: 'api-demo', result: 'updated', detail: null }] };
    await openLoaded();
    expect(statusCalls()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(within(rowOf('api-demo')).getByRole('button', { name: 'Actualizar' }));
    });
    expect(jobs()).toEqual([{ action: 'pull', repoId: 1 }]);
    await waitFor(() => expect(summary()).toBe('Actualizar · api-demo: Actualizado'), { timeout: 3000 });
    expect(notices).toEqual([{ text: 'Actualizar · api-demo: Actualizado', kind: 'info' }]);
    await waitFor(() => expect(statusCalls()).toHaveLength(2));
    fireEvent.click(button('Ver consola'));
    expect(shownConsoles).toEqual([41]);
  });

  it('RG-41: elegir otra rama inicia «Cambiar de rama»', async () => {
    await openLoaded();
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Rama de api-demo' }), { target: { value: 'hotfix' } });
    });
    expect(jobs()).toEqual([{ action: 'switch', repoId: 1, branch: 'hotfix' }]);
  });

  it('RG-42: «Clonar» y «Consultar el remoto»', async () => {
    await openLoaded();
    await act(async () => {
      fireEvent.click(within(rowOf('api-otra')).getByRole('button', { name: 'Clonar' }));
    });
    await waitFor(() => expect(summary()).toContain('Clonar · api-otra'), { timeout: 3000 });
    await waitFor(() => expect(button('Actualizar todas').disabled).toBe(false), { timeout: 3000 });
    await menu('api-demo', 'Consultar el remoto');
    expect(jobs()).toEqual([
      { action: 'clone', repoId: 2 },
      { action: 'fetch', repoId: 1 },
    ]);
  });

  it('RG-42: «Descartar cambios» solo aparece con cambios y pide confirmación con el número de ficheros', async () => {
    await openLoaded();
    fireEvent.click(button('Más acciones de api-demo'));
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'Descartar cambios' })).toBeNull();
    fireEvent.click(button('Más acciones de api-demo'));

    backend.statuses = [{ ...OK, changes: 2, untracked: 1 }, MISSING];
    fireEvent.click(button('Refrescar'));
    await waitFor(() => expect(cells('api-demo')[0]).toBe('2 cambios, 1 sin seguimiento'));
    await menu('api-demo', 'Descartar cambios');
    const dialog = screen.getByRole('alertdialog', { name: 'Descartar cambios' });
    expect(dialog.textContent).toContain('Se desharán los cambios de 2 ficheros de «api-demo». No se pueden recuperar.');
    expect(dialog.textContent).toContain('Los ficheros sin seguimiento no se tocan.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(jobs()).toEqual([]);

    await menu('api-demo', 'Descartar cambios');
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Descartar' }));
    });
    expect(jobs()).toEqual([{ action: 'discard', repoId: 1 }]);
  });

  it('RG-42: avisa de que el remoto no es el configurado y ofrece usarlo', async () => {
    backend.statuses = [{ ...OK, remoteMatches: false }, MISSING];
    await open();
    await screen.findByText(/El remoto «origin» no es el configurado/);
    await act(async () => {
      fireEvent.click(button('Usar el configurado'));
    });
    expect(jobs()).toEqual([{ action: 'set-remote', repoId: 1 }]);
  });

  it('RG-43: con un trabajo en marcha no se inicia otro, cada fila muestra su resultado y se puede cancelar', async () => {
    backend.outcome = { state: 'running' };
    await openLoaded();
    await act(async () => {
      fireEvent.click(button('Actualizar todas'));
    });
    expect(jobs()).toEqual([{ action: 'update-all' }]);
    expect(summary()).toBe('Actualizar todas: 0 de 2');
    for (const name of ['Actualizar todas', 'Consultar todas', 'Nuevo repositorio']) expect(button(name).disabled).toBe(true);
    expect((within(rowOf('api-demo')).getByRole('button', { name: 'Actualizar' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Rama de api-demo' }) as HTMLSelectElement).disabled).toBe(true);
    expect(within(rowOf('api-demo')).getByText('En marcha')).toBeTruthy();

    await act(async () => {
      fireEvent.click(button('Cancelar'));
    });
    expect(server.callsTo('POST', `${BASE}/job/cancel`)).toHaveLength(1);
    await waitFor(() => expect(summary()).toBe('Actualizar todas: Trabajo cancelado'), { timeout: 3000 });
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(button('Actualizar todas').disabled).toBe(false);
  });

  it('RG-43: un trabajo que falla se avisa como error, con el resultado de cada repositorio', async () => {
    backend.statuses = [OK, { ...OK, id: 2 }];
    backend.outcome = {
      state: 'failed',
      message: '1 de 2 repositorios ha fallado',
      repos: [
        { repoId: 1, name: 'api-demo', result: 'updated', detail: null },
        { repoId: 2, name: 'api-otra', result: 'failed', detail: 'fatal: unable to access' },
      ],
    };
    await openLoaded();
    await act(async () => {
      fireEvent.click(button('Actualizar todas'));
    });
    await waitFor(() => expect(notices).toEqual([{ text: 'Actualizar todas: 1 de 2 repositorios ha fallado', kind: 'error' }]), {
      timeout: 3000,
    });
    expect(within(rowOf('api-demo')).getByText('Actualizado')).toBeTruthy();
    expect(within(rowOf('api-otra')).getByText('Error').getAttribute('title')).toBe('fatal: unable to access');
  });

  it('RG-43: los textos del trabajo', () => {
    const job: Job = { id: 1, action: 'fetch-all', state: 'running', startedAt: '', finishedAt: null, message: null, consoleId: 1, repos: [] };
    expect(jobSummary({ ...job, repos: [{ repoId: 1, name: 'a', result: 'done', detail: null }, { repoId: 2, name: 'b', result: 'running', detail: null }] })).toBe('Consultar todas: 1 de 2');
    expect(jobSummary({ ...job, action: 'pull', repos: [{ repoId: 1, name: 'a', result: 'running', detail: null }] })).toBe('Actualizar · a: en marcha');
    expect(jobSummary({ ...job, state: 'succeeded', message: '2 consultados' })).toBe('Consultar todas: 2 consultados');
  });

  it('RG-43: un error al iniciar se avisa y no rompe la pantalla', async () => {
    backend.fail = { status: 409, code: 'job_running', message: 'Hay un trabajo de git en marcha: espera a que termine o cancélalo' };
    await openLoaded();
    await act(async () => {
      fireEvent.click(button('Consultar todas'));
    });
    expect(notices).toEqual([{ text: 'Hay un trabajo de git en marcha: espera a que termine o cancélalo', kind: 'error' }]);
    expect(screen.getByRole('table', { name: 'Repositorios' })).toBeTruthy();
  });
});

describe('RG-44 cuándo se consulta', () => {
  it('RG-44: el estado se pide al abrir y al pulsar «Refrescar», y no se repite solo', async () => {
    await openLoaded();
    expect(statusCalls()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(button('Refrescar'));
    });
    expect(statusCalls()).toHaveLength(2);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(statusCalls()).toHaveLength(2);
    // Sin trabajo en marcha, tampoco se consulta el trabajo.
    expect(server.callsTo('GET', `${BASE}/job`)).toHaveLength(1);
  });

  it('RG-44: oculta no consulta; al volver a verse, consulta', async () => {
    const view = await open(false);
    expect(statusCalls()).toHaveLength(0);
    expect(server.callsTo('GET', `${BASE}/job`)).toHaveLength(0);
    view.rerender(<Harness active />);
    await waitFor(() => expect(cells('api-demo')[0]).toBe('Limpio'));
    expect(statusCalls()).toHaveLength(1);
    view.rerender(<Harness active={false} />);
    view.rerender(<Harness active />);
    await waitFor(() => expect(statusCalls()).toHaveLength(2));
  });
});

describe('RG-45 formulario', () => {
  it('RG-45: «Nuevo repositorio» crea uno y vuelve a la tabla; lo vacío viaja como null', async () => {
    await openLoaded();
    fireEvent.click(button('Nuevo repositorio'));
    const form = screen.getByRole('form', { name: 'Nuevo repositorio' });
    expect(within(form).getAllByRole('textbox').map((i) => (i as HTMLInputElement).value)).toEqual(['', '', '', '']);
    fireEvent.change(field('Nombre'), { target: { value: '  api-nueva  ' } });
    fireEvent.change(field('Carpeta'), { target: { value: '/srv/git/api-nueva' } });
    fireEvent.change(field('URL del remoto'), { target: { value: 'https://git.example.com/demo/api-nueva.git' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('POST', `${BASE}/repos`).map((c) => c.body)).toEqual([
      { name: 'api-nueva', dir: '/srv/git/api-nueva', remoteUrl: 'https://git.example.com/demo/api-nueva.git', defaultBranch: null },
    ]);
    expect(tableRows()).toHaveLength(3);
    expect(notices.at(-1)?.text).toBe('Repositorio guardado.');
    // RG-44: tras guardar se pide el estado.
    await waitFor(() => expect(statusCalls()).toHaveLength(2));
  });

  it('RG-45: «Editar» modifica el repositorio', async () => {
    await openLoaded();
    await menu('api-demo', 'Editar');
    screen.getByRole('form', { name: 'Editar repositorio' });
    expect(field('Nombre').value).toBe('api-demo');
    expect(field('Rama por defecto').value).toBe('develop');
    fireEvent.change(field('Rama por defecto'), { target: { value: 'main' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('PUT', `${BASE}/repos/1`).map((c) => c.body)).toEqual([{ ...DEMO, id: undefined, defaultBranch: 'main' }]);
    expect(screen.getByRole('table', { name: 'Repositorios' })).toBeTruthy();
  });

  it('RG-02 RG-45: un error de formato se muestra junto a su campo y no cierra el formulario', async () => {
    await openLoaded();
    fireEvent.click(button('Nuevo repositorio'));
    fireEvent.change(field('Nombre'), { target: { value: 'malo' } });
    backend.fail = {
      status: 400,
      code: 'invalid_repo',
      message: '«URL del remoto» no debe llevar contraseña: git usa las credenciales que ya tenga configuradas',
      details: { field: 'remoteUrl' },
    };
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(screen.getByRole('alert').textContent).toContain('no debe llevar contraseña');
    expect(field('URL del remoto').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('form', { name: 'Nuevo repositorio' })).toBeTruthy();
    fireEvent.click(button('Cancelar'));
    expect(screen.getByRole('table', { name: 'Repositorios' })).toBeTruthy();
  });

  it('RG-42: «Eliminar» pide confirmación y dice que no borra nada del disco', async () => {
    await openLoaded();
    await menu('api-demo', 'Eliminar');
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar repositorio' });
    expect(dialog.textContent).toContain('Se quitará «api-demo» de la lista. No se borra nada del disco.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(server.callsTo('DELETE', BASE)).toEqual([]);

    await menu('api-demo', 'Eliminar');
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));
    });
    expect(server.callsTo('DELETE', `${BASE}/repos/1`)).toHaveLength(1);
    expect(tableRows()).toHaveLength(1);
    expect(notices.at(-1)?.text).toBe('Repositorio eliminado de la lista.');
  });
});
