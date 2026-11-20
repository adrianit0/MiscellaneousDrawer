import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { ResubmitApp } from '../apps/resubmit/ResubmitApp';
import { createAppApi } from '../platform/appApi';
import { jobSummary, resultLabel, type Candidate, type ConfigView, type Job } from '../apps/resubmit/types';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** RP-40 a RP-45: la interfaz de «Reenviar PR», con su API simulada. No contacta con Bitbucket. Datos inventados (S-31). */

const BASE = '/api/apps/resubmit';

const CONFIG: ConfigView = {
  baseUrl: 'https://bitbucket.example.test',
  projectKey: 'PROJ',
  repoSlug: 'demo',
  username: 'persona',
  dir: '/srv/git/demo',
  targetBranch: null,
  branchPrefix: null,
  tokenSet: true,
  missing: [],
};

const EMPTY: ConfigView = {
  baseUrl: null,
  projectKey: null,
  repoSlug: null,
  username: null,
  dir: null,
  targetBranch: null,
  branchPrefix: null,
  tokenSet: false,
  missing: ['baseUrl', 'token', 'projectKey', 'repoSlug', 'username', 'dir'],
};

const ONE: Candidate = {
  id: 12,
  title: 'Corrige el cálculo inventado',
  branch: 'bug/TICKET-0001',
  ticket: 'TICKET-0001',
  link: 'https://bitbucket.example.test/projects/PROJ/repos/demo/pull-requests/12',
  declinedAt: '2026-03-09T10:00:00Z',
  reviewers: ['revisora'],
  newBranch: 'bug/TICKET-0001-2',
  selectable: true,
  reason: null,
};
const TWO: Candidate = { ...ONE, id: 13, title: 'Arregla la pantalla inventada', branch: 'bug/TICKET-0002-2', ticket: 'TICKET-0002', newBranch: 'bug/TICKET-0002-3' };
const FORK: Candidate = { ...ONE, id: 14, title: 'Desde un fork', branch: 'bug/TICKET-0003', ticket: 'TICKET-0003', newBranch: null, selectable: false, reason: 'El PR viene de otro repositorio' };

interface Backend {
  config: ConfigView;
  candidates: Candidate[];
  job: Job | null;
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
  if (path === '/config' && call.method === 'GET') return { body: backend.config };
  if (path === '/config' && call.method === 'PUT') {
    const body = call.body as Record<string, string | null>;
    const next: ConfigView = {
      ...backend.config,
      baseUrl: body.baseUrl,
      projectKey: body.projectKey,
      repoSlug: body.repoSlug,
      username: body.username,
      dir: body.dir,
      targetBranch: body.targetBranch,
      branchPrefix: body.branchPrefix,
      tokenSet: backend.config.tokenSet || typeof body.token === 'string',
    };
    next.missing = (['baseUrl', 'projectKey', 'repoSlug', 'username', 'dir'] as const).filter((k) => !next[k]);
    if (!next.tokenSet) next.missing.splice(1, 0, 'token');
    backend.config = next;
    return { body: next };
  }
  if (path === '/connection/test') return { body: { ok: true, repository: 'PROJ/demo' } };
  if (path === '/candidates') return { body: { candidates: backend.candidates } };
  if (path === '/job' && call.method === 'GET') {
    const current = backend.job;
    if (current?.state === 'running' && backend.outcome.state !== 'running') {
      backend.job = { ...current, state: 'succeeded', finishedAt: '2026-03-10T10:00:05Z', ...backend.outcome };
    }
    return { body: { job: current } };
  }
  if (path === '/jobs') {
    const { prIds } = call.body as { prIds: number[] };
    backend.job = {
      id: 1,
      state: 'running',
      startedAt: '2026-03-10T10:00:00Z',
      finishedAt: null,
      message: null,
      consoleId: 41,
      prs: prIds.map((id) => ({ id, title: null, branch: null, newBranch: null, result: 'pending', detail: null, link: null })),
    };
    return { status: 202, body: { job: backend.job } };
  }
  if (path === '/job/cancel') {
    backend.job = { ...backend.job!, state: 'cancelled', message: 'Trabajo cancelado' };
    return { body: { cancelling: true } };
  }
  return undefined;
}

const api = createAppApi('resubmit');

function Harness({ active = true, start = '' }: { active?: boolean; start?: string }) {
  const [path, setPath] = useState(start);
  const value = useMemo(
    () =>
      testContext({
        id: 'resubmit',
        api,
        active,
        path,
        navigate: (next) => setPath(next),
        notify: (text, kind) => notices.push({ text, kind }),
        showConsole: (id) => shownConsoles.push(id),
      }),
    [active, path],
  );
  return (
    <InApp value={value}>
      <ResubmitApp />
    </InApp>
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const jobs = () => server.callsTo('POST', `${BASE}/jobs`).map((c) => c.body);
const listCalls = () => server.callsTo('GET', `${BASE}/candidates`);
const rows = (table: string) => within(screen.getByRole('table', { name: table })).getAllByRole('row').slice(1);

async function openList() {
  const view = render(<Harness />);
  await screen.findByRole('table', { name: 'PR rechazados' });
  return view;
}

beforeEach(() => {
  resetShell();
  notices = [];
  shownConsoles = [];
  backend = { config: CONFIG, candidates: [ONE, TWO, FORK], job: null, outcome: {}, fail: null };
  server = installFakeServer({ appRoutes: route });
});

describe('RP-40 RP-41 conexión', () => {
  it('RP-40: sin conexión completa abre en «Conexión», lo dice y no pide PR', async () => {
    backend.config = EMPTY;
    render(<Harness />);
    expect(await screen.findByRole('form', { name: 'Conexión' })).toBeTruthy();
    expect(screen.getByText(/Falta configurar: URL de Bitbucket, Token, Proyecto, Repositorio, Usuario, Carpeta/)).toBeTruthy();
    expect(button('Probar conexión').disabled).toBe(true);
    expect(listCalls()).toHaveLength(0);
  });

  it('RP-41: guarda los campos y solo envía el token si se escribe; el token no se muestra', async () => {
    backend.config = EMPTY;
    render(<Harness />);
    await screen.findByRole('form', { name: 'Conexión' });
    expect(screen.getByText(/Un token de acceso HTTP/)).toBeTruthy();
    fireEvent.change(field('URL de Bitbucket'), { target: { value: ' https://bitbucket.example.test ' } });
    fireEvent.change(field('Token'), { target: { value: 'token-inventado' } });
    fireEvent.change(field('Proyecto'), { target: { value: 'PROJ' } });
    fireEvent.change(field('Repositorio'), { target: { value: 'demo' } });
    fireEvent.change(field('Usuario'), { target: { value: 'persona' } });
    fireEvent.change(field('Carpeta'), { target: { value: '/srv/git/demo' } });
    expect(field('Rama destino').placeholder).toBe('hotfix');
    expect(field('Prefijo de rama').placeholder).toBe('bug/');
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    const [put] = server.callsTo('PUT', `${BASE}/config`);
    expect(put.body).toEqual({
      baseUrl: 'https://bitbucket.example.test',
      projectKey: 'PROJ',
      repoSlug: 'demo',
      username: 'persona',
      dir: '/srv/git/demo',
      targetBranch: null,
      branchPrefix: null,
      token: 'token-inventado',
    });
    expect(notices).toEqual([{ text: 'Conexión guardada.', kind: undefined }]);
    expect(field('Token').value).toBe('');
    expect(screen.getByText('Hay un token guardado. Escribe otro para cambiarlo.')).toBeTruthy();

    // Sin escribir el token, no se envía.
    fireEvent.change(field('Rama destino'), { target: { value: 'release' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('PUT', `${BASE}/config`)[1].body).not.toHaveProperty('token');

    await act(async () => {
      fireEvent.click(button('Probar conexión'));
    });
    expect(await screen.findByText('Conexión correcta con PROJ/demo.')).toBeTruthy();
  });

  it('RP-41: un error de formato se muestra junto a su campo', async () => {
    render(<Harness start="/connection" />);
    await screen.findByRole('form', { name: 'Conexión' });
    backend.fail = { status: 400, code: 'invalid_config', message: '«Proyecto» solo admite letras', details: { field: 'projectKey' } };
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(field('Proyecto').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('«Proyecto» solo admite letras');
  });
});

describe('RP-42 RP-43 PR rechazados', () => {
  it('RP-42: lista los pendientes marcados y los que no se pueden reenviar atenuados, con su motivo', async () => {
    await openList();
    expect(rows('PR rechazados')).toHaveLength(3);
    const first = rows('PR rechazados')[0];
    expect((within(first).getByRole('checkbox', { name: 'Reenviar TICKET-0001' }) as HTMLInputElement).checked).toBe(true);
    expect(within(first).getByRole('link', { name: ONE.title }).getAttribute('href')).toBe(ONE.link);
    expect(within(first).getByText('→ bug/TICKET-0001-2')).toBeTruthy();
    expect(within(first).getByText('09/03/2026')).toBeTruthy();
    const fork = rows('PR rechazados')[2];
    expect(fork.getAttribute('data-selectable')).toBe('false');
    expect(within(fork).queryByRole('checkbox')).toBeNull();
    expect(within(fork).getByText('El PR viene de otro repositorio')).toBeTruthy();
    expect(button('Reenviar seleccionados (2)').disabled).toBe(false);
  });

  it('RP-42: sin ninguno lo dice; «Buscar de nuevo» vuelve a pedirlos', async () => {
    backend.candidates = [];
    render(<Harness />);
    expect(await screen.findByText('No hay PR rechazados pendientes de reenviar.')).toBeTruthy();
    expect(button('Reenviar seleccionados (0)').disabled).toBe(true);
    backend.candidates = [ONE];
    await act(async () => {
      fireEvent.click(button('Buscar de nuevo'));
    });
    await screen.findByRole('table', { name: 'PR rechazados' });
    expect(listCalls()).toHaveLength(2);
  });

  it('RP-42: un error de Bitbucket se muestra', async () => {
    server.appRoutes = (call) =>
      call.url.endsWith('/candidates')
        ? { status: 502, body: { code: 'bitbucket_error', message: 'El token no es válido o ha caducado', details: null } }
        : route(call);
    render(<Harness />);
    expect((await screen.findByRole('alert')).textContent).toBe('El token no es válido o ha caducado');
  });

  it('RP-43: pide confirmación y solo envía los marcados; «Cancelar» no envía nada', async () => {
    await openList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reenviar TICKET-0002' }));
    fireEvent.click(button('Reenviar seleccionados (1)'));
    const dialog = screen.getByRole('alertdialog', { name: 'Reenviar PR' });
    expect(dialog.textContent).toContain('Se subirá 1 rama al remoto y se creará 1 PR en Bitbucket contra «hotfix»');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(jobs()).toEqual([]);

    // Con uno sin marcar, «Seleccionar todos» los marca; marcados todos, los desmarca.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todos' }));
    expect(button('Reenviar seleccionados (2)').disabled).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todos' }));
    expect(button('Reenviar seleccionados (0)').disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todos' }));
    fireEvent.click(button('Reenviar seleccionados (2)'));
    expect(screen.getByRole('alertdialog').textContent).toContain('Se subirán 2 ramas al remoto y se crearán 2 PR');
    await act(async () => {
      fireEvent.click(button('Reenviar'));
    });
    expect(jobs()).toEqual([{ prIds: [12, 13] }]);
  });
});

describe('RP-44 RP-45 trabajo', () => {
  it('RP-44: muestra el avance, el resultado de cada PR con su enlace, avisa y vuelve a pedir la lista', async () => {
    backend.outcome = {
      state: 'failed',
      message: '1 recreado, 1 con conflictos',
      prs: [
        { id: 12, title: ONE.title, branch: ONE.branch, newBranch: 'bug/TICKET-0001-2', result: 'created', detail: '2 commits', link: 'https://bitbucket.example.test/pr/501' },
        { id: 13, title: TWO.title, branch: TWO.branch, newBranch: 'bug/TICKET-0002-3', result: 'conflict', detail: 'Conflicto al aplicar abcdef01: base.txt', link: null },
      ],
    };
    await openList();
    fireEvent.click(button('Reenviar seleccionados (2)'));
    await act(async () => {
      fireEvent.click(button('Reenviar'));
    });
    expect(screen.getByRole('status', { name: 'Trabajo' }).textContent).toBe('Reenviar PR: 0 de 2');
    expect(screen.getByRole('checkbox', { name: 'Reenviar TICKET-0001' })).toHaveProperty('disabled', true);
    expect(button('Cancelar')).toBeTruthy();

    await waitFor(() => expect(screen.getByRole('status', { name: 'Trabajo' }).textContent).toBe('Reenviar PR: 1 recreado, 1 con conflictos'), {
      timeout: 3000,
    });
    expect(notices).toEqual([{ text: 'Reenviar PR: 1 recreado, 1 con conflictos', kind: 'error' }]);
    const result = rows('Resultado del reenvío');
    expect(within(result[0]).getByText('Recreado')).toBeTruthy();
    expect(within(result[0]).getByRole('link', { name: 'Abrir PR nuevo' }).getAttribute('href')).toBe('https://bitbucket.example.test/pr/501');
    expect(within(result[1]).getByText('Con conflictos')).toBeTruthy();
    expect(within(result[1]).getByText('Conflicto al aplicar abcdef01: base.txt')).toBeTruthy();
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    fireEvent.click(button('Ver consola'));
    expect(shownConsoles).toEqual([41]);
  });

  it('RP-44: «Cancelar» cancela el trabajo en marcha', async () => {
    backend.outcome = { state: 'running' };
    await openList();
    fireEvent.click(button('Reenviar seleccionados (2)'));
    await act(async () => {
      fireEvent.click(button('Reenviar'));
    });
    await act(async () => {
      fireEvent.click(button('Cancelar'));
    });
    expect(server.callsTo('POST', `${BASE}/job/cancel`)).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Trabajo' }).textContent).toBe('Reenviar PR: Trabajo cancelado'), {
      timeout: 3000,
    });
  });

  it('RP-45: oculta no consulta el trabajo ni la lista', async () => {
    render(<Harness active={false} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(server.callsTo('GET', `${BASE}/job`)).toHaveLength(0);
    expect(listCalls()).toHaveLength(0);
  });

  it('RP-44: los textos de resultado y del resumen', () => {
    expect(['pending', 'running', 'created', 'conflict', 'skipped', 'failed'].map((r) => resultLabel(r as never))).toEqual([
      'Pendiente',
      'En marcha',
      'Recreado',
      'Con conflictos',
      'Omitido',
      'Error',
    ]);
    const job: Job = { id: 1, state: 'running', startedAt: '', finishedAt: null, message: null, consoleId: 1, prs: [] };
    expect(jobSummary({ ...job, prs: [{ id: 1, title: null, branch: null, newBranch: null, result: 'created', detail: null, link: null }] })).toBe('Reenviar PR: 1 de 1');
    expect(jobSummary({ ...job, state: 'succeeded', message: '3 recreados' })).toBe('Reenviar PR: 3 recreados');
  });
});
