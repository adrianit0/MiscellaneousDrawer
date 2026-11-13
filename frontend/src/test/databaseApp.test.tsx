import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { DatabaseApp } from '../apps/database/DatabaseApp';
import { formatBytes, formatDateTime, type BranchDumps, type ConfigView, type Job, type ScriptListing } from '../apps/database/types';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** BD-60 a BD-65: la interfaz de «Base de datos», con su API simulada. Datos inventados (S-31). */

const BASE = '/api/apps/database';
const NONE = { download: [], import: [], scripts: [], dumps: [] };

const CONFIG: ConfigView = {
  workDir: '/datos/trabajo',
  s3Path: 's3://bucket-de-prueba/volcados',
  s3Suffix: '_remoto.tar.gz',
  localSuffix: '_local.tar.gz',
  containerName: 'mysql-de-prueba',
  mysqlImage: 'mysql:8.4',
  timeZone: 'Europe/Madrid',
  initSqlFile: '/datos/sql/inicial.sql',
  secondInitSqlFile: '/datos/sql/segundo.sql',
  databaseName: 'demo',
  pendingSqlDir: '/datos/sql/pendientes',
  versionsSqlDir: '/datos/sql/versiones',
  hostPort: 3307,
  containerPort: 3306,
  rootPasswordSet: true,
  missing: NONE,
};

const EMPTY: ConfigView = {
  ...(Object.fromEntries(Object.keys(CONFIG).map((k) => [k, null])) as unknown as ConfigView),
  rootPasswordSet: false,
  missing: {
    download: ['workDir', 's3Path', 's3Suffix', 'localSuffix'],
    import: ['workDir', 'localSuffix', 'containerName', 'rootPassword'],
    scripts: ['containerName', 'rootPassword', 'databaseName', 'pendingSqlDir'],
    dumps: ['workDir', 'localSuffix'],
  },
};

const DUMPS: BranchDumps[] = [
  {
    branch: 'hotfix',
    current: { kind: 'current', file: 'BBDD_hotfix_local.tar.gz', name: null, size: 1610612736, modified: '2026-11-03T08:30:00Z' },
    previous: { kind: 'previous', file: 'auto-20261102-080000.tar.gz', name: null, size: 1073741824, modified: '2026-11-02T08:00:00Z' },
    kept: [{ kind: 'kept', file: 'kept-20261020-070000-base buena.tar.gz', name: 'base buena', size: 2048, modified: '2026-10-20T07:00:00Z' }],
    partial: null,
  },
  { branch: 'develop', current: null, previous: null, kept: [], partial: { done: 1024, total: 4096 } },
];

function job(partial: Partial<Job> = {}): Job {
  return {
    id: 1,
    state: 'running',
    branch: 'hotfix',
    startedAt: '2026-11-03T09:00:00Z',
    finishedAt: null,
    steps: [
      { kind: 'download', state: 'running', message: 'Volcado de hotfix: bloque 2 de 4', progress: { done: 1073741824, total: 4294967296 }, scripts: null },
      {
        kind: 'scripts',
        state: 'pending',
        message: null,
        progress: null,
        scripts: [
          { file: 'TAREA-1.sql', state: 'pending', error: null },
          { file: 'TAREA-2.sql', state: 'pending', error: null },
        ],
      },
    ],
    consoleId: 7,
    ...partial,
  };
}

interface Backend {
  config: ConfigView;
  dumps: BranchDumps[];
  scripts: Record<string, ScriptListing>;
  job: Job | null;
  /** Error con el que responde la siguiente escritura. */
  fail: { status: number; code: string; message: string; details?: unknown } | null;
}

let server: FakeServer;
let backend: Backend;
let navigations: string[];
let notices: string[];
let subtitles: (string | null)[];
/** BD-62: las consolas que la mini app pide mostrar al shell. */
let shownConsoles: number[];
/** N-02: cambia la subruta como «Atrás» y «Adelante», sin pasar por navigate. */
let moveHistory: (to: string) => void;

function route(call: Call): { status?: number; body?: unknown } | undefined {
  const path = call.url.slice(BASE.length);
  const fail = () => {
    const f = backend.fail!;
    backend.fail = null;
    return { status: f.status, body: { code: f.code, message: f.message, details: f.details ?? null } };
  };
  if (call.method !== 'GET' && backend.fail) return fail();
  if (path === '/config') {
    if (call.method === 'PUT') {
      const body = call.body as Record<string, unknown>;
      backend.config = { ...backend.config, ...body, rootPasswordSet: backend.config.rootPasswordSet || !!body.rootPassword, missing: NONE } as ConfigView;
      delete (backend.config as unknown as Record<string, unknown>).rootPassword;
    }
    return { body: backend.config };
  }
  if (path === '/dumps') return { body: { branches: backend.dumps } };
  if (path === '/dumps/keep') return { status: 201, body: {} };
  if (path.startsWith('/dumps/') && call.method === 'DELETE') return { body: { deleted: true } };
  if (path.startsWith('/scripts')) {
    const version = new URLSearchParams(path.split('?')[1] ?? '').get('version') ?? '';
    return { body: backend.scripts[version] };
  }
  if (path === '/job' && call.method === 'GET') return { body: { job: backend.job } };
  if (path === '/job') {
    const id = (backend.job?.id ?? 0) + 1;
    backend.job = job({ id, consoleId: 10 + id });
    return { status: 202, body: { job: backend.job } };
  }
  if (path === '/job/cancel') {
    backend.job = { ...backend.job!, state: 'cancelled' };
    return { body: { cancelling: true } };
  }
  return undefined;
}

function Harness({ initialPath = '', active = true }: { initialPath?: string; active?: boolean }) {
  const [path, setPath] = useState(initialPath);
  moveHistory = setPath;
  const value = useMemo(
    () =>
      testContext({
        id: 'database',
        path,
        active,
        navigate: (to) => {
          navigations.push(to);
          setPath(to);
        },
        notify: (text) => notices.push(text),
        setSubtitle: (text) => subtitles.push(text),
        showConsole: (id) => shownConsoles.push(id),
      }),
    [path, active],
  );
  return (
    <InApp value={value}>
      <DatabaseApp />
    </InApp>
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const checkbox = (name: string | RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const posts = (path: string) => server.callsTo('POST', BASE + path);

async function open(initialPath = '') {
  const view = render(<Harness initialPath={initialPath} />);
  await screen.findByRole('navigation', { name: 'Secciones' });
  await waitFor(() => expect(screen.queryByText('Cargando…')).toBeNull());
  return view;
}

/** «Preparar» ya con los volcados y los scripts cargados. */
async function openPrepare() {
  await open();
  await screen.findByRole('list', { name: 'Scripts' });
  await screen.findByRole('option', { name: /^Anterior/ });
}

beforeEach(() => {
  resetShell();
  navigations = [];
  notices = [];
  subtitles = [];
  shownConsoles = [];
  backend = {
    config: CONFIG,
    dumps: DUMPS,
    scripts: {
      '': { versions: ['1.10.0', '1.9.0'], version: null, folder: '/datos/sql/pendientes', exists: true, files: ['TAREA-1.sql', 'TAREA-2.sql'] },
      '1.10.0': { versions: ['1.10.0', '1.9.0'], version: '1.10.0', folder: '/datos/sql/versiones/1.10.0', exists: true, files: ['TAREA-7.sql'] },
    },
    job: null,
    fail: null,
  };
  server = installFakeServer({ appRoutes: route });
});

describe('BD-60 secciones', () => {
  it('BD-60: tiene «Preparar», «Copias» y «Configuración», con su subruta y su nombre en la miga de pan', async () => {
    await open();
    const tabs = within(screen.getByRole('navigation', { name: 'Secciones' })).getAllByRole('button');
    expect(tabs.map((t) => t.textContent)).toEqual(['Preparar', 'Copias', 'Configuración']);
    expect(tabs[0].getAttribute('aria-current')).toBe('page');
    expect(subtitles.at(-1)).toBe('Preparar');

    fireEvent.click(button('Copias'));
    expect(navigations).toEqual(['/dumps']);
    expect(await screen.findByRole('region', { name: 'Hotfix' })).toBeTruthy();
    expect(subtitles.at(-1)).toBe('Copias');

    fireEvent.click(button('Configuración'));
    expect(navigations).toEqual(['/dumps', '/settings']);
    expect(screen.getByRole('form', { name: 'Configuración' })).toBeTruthy();
    expect(subtitles.at(-1)).toBe('Configuración');
  });

  it('BD-60: una subruta abre su sección', async () => {
    await open('/settings');
    expect(screen.getByRole('form', { name: 'Configuración' })).toBeTruthy();
    expect(button('Configuración').getAttribute('aria-current')).toBe('page');
  });
});

describe('BD-61 «Preparar»', () => {
  it('BD-03 BD-61: sin configuración, cada paso está desactivado, dice qué falta y lleva a «Configuración»', async () => {
    backend.config = EMPTY;
    await open();
    expect(checkbox('Descargar').disabled).toBe(true);
    expect(checkbox('Importar').disabled).toBe(true);
    expect(checkbox('Ejecutar scripts').disabled).toBe(true);
    expect(screen.getByText(/Falta configurar: Carpeta de trabajo, Ruta de S3, Sufijo del fichero en S3, Sufijo del fichero local\./)).toBeTruthy();
    expect(button('Iniciar').disabled).toBe(true);
    // Sin configuración no se pide nada más al servidor.
    expect(server.calls.filter((c) => c.url.includes('/dumps') || c.url.includes('/scripts'))).toEqual([]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Ir a Configuración' })[0]);
    expect(navigations).toEqual(['/settings']);
  });

  it('BD-61: muestra la rama, los tres pasos marcados, el volcado a importar y los scripts de la carpeta', async () => {
    await openPrepare();
    expect((screen.getByRole('radio', { name: 'Hotfix' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['Hotfix', 'Develop', 'Ambas']);
    expect(checkbox('Descargar').checked).toBe(true);
    expect(checkbox('Importar').checked).toBe(true);
    expect(checkbox('Ejecutar scripts').checked).toBe(true);
    const dump = screen.getByRole('combobox', { name: 'Volcado' });
    expect(within(dump).getAllByRole('option').map((o) => o.textContent)).toEqual([
      `Actual (${formatDateTime('2026-11-03T08:30:00Z')})`,
      `Anterior (${formatDateTime('2026-11-02T08:00:00Z')})`,
      `base buena (${formatDateTime('2026-10-20T07:00:00Z')})`,
    ]);
    const scripts = within(screen.getByRole('list', { name: 'Scripts' })).getAllByRole('checkbox') as HTMLInputElement[];
    expect(scripts.map((s) => s.checked)).toEqual([true, true]);
    expect(within(screen.getByRole('combobox', { name: 'Carpeta' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Pendientes',
      'Versión 1.10.0',
      'Versión 1.9.0',
    ]);
  });

  it('BD-61: sin ningún paso marcado no se puede iniciar', async () => {
    await openPrepare();
    for (const step of ['Descargar', 'Importar', 'Ejecutar scripts']) fireEvent.click(checkbox(step));
    expect(button('Iniciar').disabled).toBe(true);
  });

  it('BD-61: inicia solo los pasos marcados, con el modo, la opción de forzar y los scripts elegidos', async () => {
    await openPrepare();
    fireEvent.click(checkbox('Importar'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Modo' }), { target: { value: 'direct' } });
    fireEvent.click(checkbox('Descargar aunque no haya cambiado'));
    fireEvent.click(within(screen.getByRole('list', { name: 'Scripts' })).getAllByRole('checkbox')[0]);
    await act(async () => {
      fireEvent.click(button('Iniciar'));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(posts('/job').map((c) => c.body)).toEqual([
      { branch: 'hotfix', download: { mode: 'direct', force: true }, import: null, scripts: { version: null, files: ['TAREA-2.sql'] } },
    ]);
  });

  it('BD-61: con todos los scripts marcados no envía la lista, y se pueden elegir los de una versión', async () => {
    await openPrepare();
    fireEvent.click(checkbox('Descargar'));
    fireEvent.click(checkbox('Importar'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Carpeta' }), { target: { value: '1.10.0' } });
    await screen.findByText('TAREA-7.sql');
    await act(async () => {
      fireEvent.click(button('Iniciar'));
    });
    expect(posts('/job')[0].body).toEqual({ branch: 'hotfix', download: null, import: null, scripts: { version: '1.10.0', files: null } });
    // BD-62: al iniciar un trabajo se muestra su consola.
    expect(shownConsoles).toEqual([11]);
  });

  it('BD-11 BD-61: con «Ambas» solo se puede descargar', async () => {
    await openPrepare();
    fireEvent.click(screen.getByRole('radio', { name: 'Ambas' }));
    expect(checkbox('Importar').disabled).toBe(true);
    expect(checkbox('Importar').checked).toBe(false);
    expect(checkbox('Ejecutar scripts').disabled).toBe(true);
    expect(screen.getByText('Con «Ambas» solo se puede descargar.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(button('Iniciar'));
    });
    expect(posts('/job')[0].body).toEqual({ branch: 'both', download: { mode: 'chunked', force: false }, import: null, scripts: null });
  });

  it('P-14 BD-61: la rama, los pasos y el modo se recuerdan', async () => {
    server.appStates.database = { branch: 'develop', steps: { download: false, import: false, scripts: true }, mode: 'direct' };
    await open();
    await waitFor(() => expect((screen.getByRole('radio', { name: 'Develop' }) as HTMLInputElement).checked).toBe(true));
    expect(checkbox('Descargar').checked).toBe(false);
    expect(checkbox('Ejecutar scripts').checked).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Modo' }) as HTMLSelectElement).value).toBe('direct');

    fireEvent.click(screen.getByRole('radio', { name: 'Hotfix' }));
    await waitFor(() => expect(server.appStates.database?.branch).toBe('hotfix'), { timeout: 2000 });
  });

  it('BD-42: antes de importar pide confirmación con el resumen, y cancelar no inicia nada', async () => {
    await openPrepare();
    fireEvent.click(button('Iniciar'));
    const confirm = screen.getByRole('alertdialog', { name: 'Importar la base de datos' });
    expect(within(confirm).getByText(/Se borrarán el contenedor de MySQL y su volumen/)).toBeTruthy();
    expect(within(confirm).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Descargar el volcado de Hotfix',
      'Importar: volcado actual de Hotfix',
      'Ejecutar 2 scripts de Pendientes',
    ]);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(button('Iniciar'));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(posts('/job')).toEqual([]);

    fireEvent.click(button('Iniciar'));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Iniciar' }));
    });
    expect(posts('/job')[0].body).toEqual({
      branch: 'hotfix',
      download: { mode: 'chunked', force: false },
      import: { dump: 'current' },
      scripts: { version: null, files: null },
    });
  });

  it('BD-10: si el servidor rechaza el trabajo, dice por qué', async () => {
    await openPrepare();
    fireEvent.click(checkbox('Importar'));
    backend.fail = { status: 409, code: 'job_running', message: 'Hay un trabajo en marcha: espera a que termine o cancélalo' };
    await act(async () => {
      fireEvent.click(button('Iniciar'));
    });
    expect(screen.getByRole('alert').textContent).toBe('Hay un trabajo en marcha: espera a que termine o cancélalo');
  });
});

describe('BD-62 trabajo', () => {
  it('BD-62: muestra los pasos con su estado, el progreso de la descarga, los scripts y «Ver consola»', async () => {
    backend.job = job();
    await openPrepare();
    const region = await screen.findByRole('region', { name: 'Trabajo' });
    expect(within(region).getByRole('heading').textContent).toBe('Trabajo en marcha · Hotfix');
    const steps = within(region).getAllByRole('listitem').filter((li) => li.hasAttribute('data-state') && li.parentElement?.tagName === 'OL');
    expect(steps.map((s) => s.getAttribute('data-state'))).toEqual(['running', 'pending']);
    expect(steps[0].textContent).toContain('Descargar');
    expect(steps[0].textContent).toContain('En marcha');
    expect(steps[0].textContent).toContain('Volcado de hotfix: bloque 2 de 4');
    const progress = within(region).getByRole('progressbar', { name: 'Progreso de la descarga' }) as HTMLProgressElement;
    expect(progress.value).toBe(1073741824);
    expect(progress.max).toBe(4294967296);
    expect(within(region).getByText('1,0 GiB de 4,0 GiB (25 %)')).toBeTruthy();
    expect(within(within(region).getByRole('list', { name: 'Resultado de los scripts' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'TAREA-1.sql: pendiente',
      'TAREA-2.sql: pendiente',
    ]);
    // BD-14: el registro ya no está en la mini app; «Ver consola» lo muestra en el panel del shell.
    expect(within(region).queryByLabelText('Registro')).toBeNull();
    expect(shownConsoles).toEqual([]);
    fireEvent.click(within(region).getByRole('button', { name: 'Ver consola' }));
    expect(shownConsoles).toEqual([7]);
    // Con un trabajo en marcha se cancela, no se inicia otro.
    expect(screen.queryByRole('button', { name: 'Iniciar' })).toBeNull();
    expect(checkbox('Descargar').disabled).toBe(true);
  });

  it('BD-63: mientras está en marcha consulta su estado, y al terminar avisa y deja de consultar', async () => {
    backend.job = job();
    await openPrepare();
    await screen.findByRole('region', { name: 'Trabajo' });
    backend.job = job({
      state: 'failed',
      finishedAt: '2026-11-03T09:10:00Z',
      steps: [
        { kind: 'download', state: 'done', message: 'Descarga terminada', progress: null, scripts: null },
        {
          kind: 'scripts',
          state: 'failed',
          message: 'Falló 1 script de 2',
          progress: null,
          scripts: [
            { file: 'TAREA-1.sql', state: 'error', error: 'ERROR 1064 (42000) at line 1' },
            { file: 'TAREA-2.sql', state: 'ok', error: null },
          ],
        },
      ],
    });
    await waitFor(() => expect(notices).toEqual(['Base de datos: trabajo terminado con errores']), { timeout: 4000 });
    expect(screen.getByRole('heading', { name: 'Trabajo terminado con errores · Hotfix' })).toBeTruthy();
    expect(screen.getByText('ERROR 1064 (42000) at line 1')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Resultado de los scripts' })).getAllByRole('listitem')[0].textContent).toContain(
      'TAREA-1.sql: con error',
    );
    expect(button('Iniciar')).toBeTruthy();
    const polls = server.callsTo('GET', BASE + '/job');
    // BD-14: ya no pide líneas: el registro está en la consola.
    expect(new Set(polls.map((p) => p.url))).toEqual(new Set([BASE + '/job']));
    const count = polls.length;
    await new Promise((r) => setTimeout(r, 1300));
    expect(server.callsTo('GET', BASE + '/job')).toHaveLength(count);
  }, 10000);

  it('BD-15 BD-62: «Cancelar» cancela el trabajo en marcha', async () => {
    backend.job = job();
    await openPrepare();
    await screen.findByRole('region', { name: 'Trabajo' });
    await act(async () => {
      fireEvent.click(button('Cancelar'));
    });
    expect(posts('/job/cancel')).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Trabajo cancelado · Hotfix' })).toBeTruthy(), { timeout: 4000 });
  }, 10000);

  it('BD-63 N-05: oculta no consulta, y al volver a verse consulta de inmediato', async () => {
    backend.job = job();
    const view = render(<Harness active={false} />);
    await screen.findByRole('navigation', { name: 'Secciones' });
    await new Promise((r) => setTimeout(r, 1200));
    expect(server.callsTo('GET', BASE + '/job')).toEqual([]);
    view.rerender(<Harness active />);
    expect(await screen.findByRole('region', { name: 'Trabajo' })).toBeTruthy();
    expect(server.callsTo('GET', BASE + '/job').length).toBeGreaterThan(0);
  }, 10000);

  it('BD-63: un trabajo que ya había terminado al abrir no avisa', async () => {
    backend.job = job({ state: 'succeeded', finishedAt: '2026-11-03T09:10:00Z' });
    await openPrepare();
    await screen.findByRole('heading', { name: 'Trabajo terminado · Hotfix' });
    expect(notices).toEqual([]);
  });
});

describe('BD-64 «Copias»', () => {
  it('BD-64 U-02: muestra por rama el volcado actual, la anterior y las conservadas, con fecha y tamaño', async () => {
    await open('/dumps');
    const hotfix = await screen.findByRole('region', { name: 'Hotfix' });
    const rows = within(hotfix).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell').slice(0, 4).map((c) => c.textContent))).toEqual([
      ['Actual', '—', formatDateTime('2026-11-03T08:30:00Z'), '1,5 GiB'],
      ['Anterior', '—', formatDateTime('2026-11-02T08:00:00Z'), '1,0 GiB'],
      ['Conservada', 'base buena', formatDateTime('2026-10-20T07:00:00Z'), '2,0 KiB'],
    ]);
    // El actual no se elimina y una conservada no se vuelve a conservar (BD-34).
    expect(within(rows[0]).getAllByRole('button').map((b) => b.textContent)).toEqual(['Importar', 'Conservar']);
    expect(within(rows[1]).getAllByRole('button').map((b) => b.textContent)).toEqual(['Importar', 'Conservar', 'Eliminar']);
    expect(within(rows[2]).getAllByRole('button').map((b) => b.textContent)).toEqual(['Importar', 'Eliminar']);

    const develop = screen.getByRole('region', { name: 'Develop' });
    expect(within(develop).getByText('Todavía no hay ningún volcado de esta rama.')).toBeTruthy();
    expect(within(develop).getByText(/Hay una descarga a medias: 1,0 KiB de 4,0 KiB\./)).toBeTruthy();
  });

  it('BD-32 BD-64: «Conservar» pide el nombre y crea la copia', async () => {
    await open('/dumps');
    const hotfix = await screen.findByRole('region', { name: 'Hotfix' });
    fireEvent.click(within(within(hotfix).getAllByRole('row')[2]).getByRole('button', { name: 'Conservar' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Conservar copia' });
    expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Conservar' }).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Nombre de la copia/), { target: { value: ' lunes bueno ' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Conservar' }));
    });
    expect(posts('/dumps/keep').map((c) => c.body)).toEqual([{ branch: 'hotfix', source: 'auto-20261102-080000.tar.gz', name: 'lunes bueno' }]);
    expect(notices).toEqual(['Copia «lunes bueno» conservada.']);
    expect(server.callsTo('GET', BASE + '/dumps').length).toBeGreaterThan(1);
  });

  it('BD-33: si el servidor rechaza el nombre, lo dice', async () => {
    await open('/dumps');
    const hotfix = await screen.findByRole('region', { name: 'Hotfix' });
    fireEvent.click(within(within(hotfix).getAllByRole('row')[1]).getByRole('button', { name: 'Conservar' }));
    fireEvent.change(screen.getByLabelText(/Nombre de la copia/), { target: { value: 'base buena' } });
    backend.fail = { status: 409, code: 'name_taken', message: 'Ya hay una copia de hotfix con el nombre «base buena»' };
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Conservar' }));
    });
    expect(posts('/dumps/keep')[0].body).toEqual({ branch: 'hotfix', source: 'current', name: 'base buena' });
    expect(screen.getByRole('alert').textContent).toBe('Ya hay una copia de hotfix con el nombre «base buena»');
    expect(notices).toEqual([]);
  });

  it('BD-34 BD-64 U-05: «Eliminar» pide confirmación antes de borrar', async () => {
    await open('/dumps');
    const hotfix = await screen.findByRole('region', { name: 'Hotfix' });
    fireEvent.click(within(within(hotfix).getAllByRole('row')[3]).getByRole('button', { name: 'Eliminar' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar copia' });
    expect(within(dialog).getByText(/Se borrará la copia «base buena» de Hotfix/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(server.callsTo('DELETE', BASE)).toEqual([]);

    fireEvent.click(within(within(hotfix).getAllByRole('row')[3]).getByRole('button', { name: 'Eliminar' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));
    });
    expect(server.callsTo('DELETE', BASE).map((c) => c.url)).toEqual([BASE + '/dumps/hotfix/kept-20261020-070000-base%20buena.tar.gz']);
    expect(notices).toEqual(['Copia eliminada.']);
  });

  it('BD-64 BD-40: «Importar» lleva a «Preparar» con esa rama y ese volcado elegidos', async () => {
    server.appStates.database = { branch: 'develop', steps: { download: true, import: false, scripts: false }, mode: 'chunked' };
    await open('/dumps');
    const hotfix = await screen.findByRole('region', { name: 'Hotfix' });
    fireEvent.click(within(within(hotfix).getAllByRole('row')[3]).getByRole('button', { name: 'Importar' }));
    expect(navigations).toEqual(['']);
    await waitFor(() => expect((screen.getByRole('radio', { name: 'Hotfix' }) as HTMLInputElement).checked).toBe(true));
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Volcado' }) as HTMLSelectElement).value).toBe('kept-20261020-070000-base buena.tar.gz'));
    expect(checkbox('Importar').checked).toBe(true);

    fireEvent.click(checkbox('Descargar'));
    fireEvent.click(button('Iniciar'));
    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText(`Importar: base buena (${formatDateTime('2026-10-20T07:00:00Z')})`)).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Iniciar' }));
    });
    expect(posts('/job')[0].body).toEqual({
      branch: 'hotfix',
      download: null,
      import: { dump: 'kept-20261020-070000-base buena.tar.gz' },
      scripts: null,
    });
  });

  it('BD-03: sin carpeta de trabajo, «Copias» dice qué falta', async () => {
    backend.config = EMPTY;
    await open('/dumps');
    expect(screen.getByText(/Falta configurar: Carpeta de trabajo, Sufijo del fichero local\./)).toBeTruthy();
    expect(server.callsTo('GET', BASE + '/dumps')).toEqual([]);
  });
});

describe('BD-65 «Configuración»', () => {
  const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement;

  it('BD-65: agrupa los campos y muestra lo guardado, con la contraseña siempre vacía', async () => {
    await open('/settings');
    expect(screen.getAllByRole('group').map((g) => within(g).getByText(/.+/, { selector: 'legend' }).textContent)).toEqual([
      'Descarga',
      'Docker y MySQL',
      'Scripts',
    ]);
    expect(field('Carpeta de trabajo').value).toBe('/datos/trabajo');
    expect(field('Puerto en la máquina').value).toBe('3307');
    expect(field('Contraseña de root').value).toBe('');
    expect(field('Contraseña de root').type).toBe('password');
    expect(screen.getByText('Hay una contraseña guardada. Escribe otra para cambiarla.')).toBeTruthy();
    // BD-17, ADR-0013: el aviso al terminar ya no se configura aquí.
    expect(screen.queryByText(/Aviso al terminar/)).toBeNull();
  });

  it('BD-02 BD-65: «Guardar» envía todos los campos, y la contraseña solo si se escribe', async () => {
    await open('/settings');
    fireEvent.change(field('Base de datos'), { target: { value: ' otra ' } });
    fireEvent.change(field('Carpeta de versiones'), { target: { value: '  ' } });
    fireEvent.change(field('Puerto del contenedor'), { target: { value: '3310' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    const sent = server.callsTo('PUT', BASE + '/config')[0].body as Record<string, unknown>;
    expect('rootPassword' in sent).toBe(false);
    expect(sent).toMatchObject({
      workDir: '/datos/trabajo',
      databaseName: 'otra',
      versionsSqlDir: null,
      hostPort: 3307,
      containerPort: 3310,
    });
    expect('notifyOnFinish' in sent).toBe(false);
    expect(notices).toEqual(['Configuración guardada.']);

    fireEvent.change(field('Contraseña de root'), { target: { value: 'clave-secreta-de-prueba' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect((server.callsTo('PUT', BASE + '/config')[1].body as Record<string, unknown>).rootPassword).toBe('clave-secreta-de-prueba');
    expect(field('Contraseña de root').value).toBe('');
  });

  it('BD-02: la contraseña guardada se puede borrar', async () => {
    await open('/settings');
    fireEvent.click(checkbox('Borrar la contraseña guardada'));
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect((server.callsTo('PUT', BASE + '/config')[0].body as Record<string, unknown>).rootPassword).toBe('');
  });

  it('BD-01 BD-65: un error de formato se muestra junto a su campo', async () => {
    await open('/settings');
    fireEvent.change(field('Puerto en la máquina'), { target: { value: 'abc' } });
    backend.fail = {
      status: 400,
      code: 'invalid_config',
      message: '«Puerto en la máquina» debe ser un número entre 1 y 65535',
      details: { field: 'hostPort' },
    };
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect((server.callsTo('PUT', BASE + '/config')[0].body as Record<string, unknown>).hostPort).toBe('abc');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('«Puerto en la máquina» debe ser un número entre 1 y 65535');
    expect(field('Puerto en la máquina').getAttribute('aria-invalid')).toBe('true');
    expect(alert.closest('div')?.contains(field('Puerto en la máquina'))).toBe(true);
    expect(notices).toEqual([]);
  });

  it('BD-03 BD-65: tras guardar, «Preparar» ya tiene sus pasos disponibles', async () => {
    backend.config = EMPTY;
    await open('/settings');
    expect(screen.getByText('No hay ninguna contraseña guardada.')).toBeTruthy();
    fireEvent.change(field('Carpeta de trabajo'), { target: { value: '/datos/trabajo' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    fireEvent.click(button('Preparar'));
    await waitFor(() => expect(checkbox('Descargar').disabled).toBe(false));
  });
});

const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement;

/** BD-66: elige un fichero en «Importar de un .sh…». */
async function importSh(content: string, name = 'config.sh') {
  const input = screen.getByLabelText('Fichero .sh') as HTMLInputElement;
  expect(input.accept).toBe('.sh');
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File([content], name, { type: 'text/x-sh' })] } });
  });
}

describe('BD-66 importar de un .sh', () => {
  const SH = [
    '#!/bin/sh',
    '# --- Valores inventados ---',
    'BASE_DIR="/datos/importado"',
    'S3_PATH="s3://bucket-inventado/prefijo/"',
    'MYSQL_ROOT_PASSWORD="clave-inventada"',
    'LOCAL_PORT="3308"',
    'INITDB_FILE="inicial.sql"',
    'SQL_FOLDER_EXECUTED="/datos/sql/ejecutados/"',
    'OTRO_PASS="no-debe-enviarse"',
  ].join('\n');

  it('BD-66: rellena el formulario sin guardar y dice qué ha omitido', async () => {
    await open('/settings');
    expect(button('Importar de un .sh…')).toBeTruthy();
    await importSh(SH);
    await screen.findByText('Se han rellenado 5 campos con config.sh. Revísalos y pulsa «Guardar».');
    expect(field('Carpeta de trabajo').value).toBe('/datos/importado');
    expect(field('Ruta de S3').value).toBe('s3://bucket-inventado/prefijo');
    expect(field('Contraseña de root').value).toBe('clave-inventada');
    expect(field('Puerto en la máquina').value).toBe('3308');
    expect(field('Carpeta de versiones').value).toBe('/datos/sql/ejecutados');
    // Lo omitido sigue como estaba, y lo que no viene en el fichero también.
    expect(field('Script inicial').value).toBe('/datos/sql/inicial.sql');
    expect(field('Contenedor').value).toBe('mysql-de-prueba');
    expect(screen.getByText('No se han importado:')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Script inicial (INITDB_FILE): no es una ruta absoluta']);
    expect(server.callsTo('PUT', BASE + '/config')).toEqual([]);

    // BD-67: lo importado son cambios sin guardar.
    fireEvent.click(button('Copias'));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Cambios sin guardar' })).getByRole('button', { name: 'Cancelar' }));

    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    const sent = server.callsTo('PUT', BASE + '/config')[0].body as Record<string, unknown>;
    expect(sent).toMatchObject({
      workDir: '/datos/importado',
      s3Path: 's3://bucket-inventado/prefijo',
      rootPassword: 'clave-inventada',
      hostPort: 3308,
      initSqlFile: '/datos/sql/inicial.sql',
      versionsSqlDir: '/datos/sql/ejecutados',
    });
    expect(JSON.stringify(sent)).not.toContain('no-debe-enviarse');
    expect(screen.queryByText(/Se han rellenado/)).toBeNull();
  });

  it('BD-66: sin ninguna variable de la tabla lo dice y no cambia nada; si todo se omite, también lo dice', async () => {
    await open('/settings');
    await importSh('OTRA="valor"\n', 'otro.sh');
    await screen.findByText('otro.sh no tiene ninguna de las variables que se pueden importar.');
    expect(field('Carpeta de trabajo').value).toBe('/datos/trabajo');

    await importSh('INITDB_FILE="inicial.sql"\n', 'solo.sh');
    await screen.findByText('No se ha rellenado ningún campo con solo.sh.');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Script inicial (INITDB_FILE): no es una ruta absoluta']);

    // BD-67: nada ha cambiado, así que no pregunta.
    fireEvent.click(button('Preparar'));
    expect(navigations).toEqual(['']);
  });

  it('BD-66: con un solo campo lo dice en singular', async () => {
    await open('/settings');
    await importSh('TZ="Europe/Lisbon"\n');
    await screen.findByText('Se ha rellenado 1 campo con config.sh. Revísalo y pulsa «Guardar».');
    expect(field('Zona horaria').value).toBe('Europe/Lisbon');
  });

  it('BD-66: un fichero de más de 1 MiB no se lee', async () => {
    await open('/settings');
    await importSh(`TZ="Europe/Lisbon"\n${'#'.repeat(1024 * 1024)}`, 'grande.sh');
    await screen.findByText('grande.sh ocupa más de 1 MiB: no se importa.');
    expect(field('Zona horaria').value).toBe('Europe/Madrid');
  });
});

describe('BD-67 cambios sin guardar', () => {
  const dialog = () => screen.getByRole('alertdialog', { name: 'Cambios sin guardar' });
  const inDialog = (name: string) => within(dialog()).getByRole('button', { name });

  it('BD-67: sin cambios no pregunta, aunque se hayan escrito espacios en los extremos', async () => {
    await open('/settings');
    fireEvent.change(field('Base de datos'), { target: { value: ' demo ' } });
    fireEvent.click(button('Copias'));
    expect(navigations).toEqual(['/dumps']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('BD-67: con cambios avisa con «Cancelar», «Salir sin guardar» y «Guardar»; «Cancelar» y Esc se quedan con lo escrito', async () => {
    await open('/settings');
    fireEvent.change(field('Base de datos'), { target: { value: 'otra' } });
    fireEvent.click(button('Copias'));
    expect(navigations).toEqual([]);
    expect(within(dialog()).getByText(/Si sales sin guardar, perderás los cambios\./)).toBeTruthy();
    expect(within(dialog()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancelar', 'Salir sin guardar', 'Guardar']);
    expect(document.activeElement).toBe(inDialog('Guardar'));

    fireEvent.click(inDialog('Cancelar'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(field('Base de datos').value).toBe('otra');

    fireEvent.click(button('Preparar'));
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(navigations).toEqual([]);
    expect(button('Configuración').getAttribute('aria-current')).toBe('page');
  });

  it('BD-67: una contraseña escrita cuenta como cambio', async () => {
    await open('/settings');
    fireEvent.change(field('Contraseña de root'), { target: { value: 'clave-de-prueba' } });
    fireEvent.click(button('Preparar'));
    expect(dialog()).toBeTruthy();
  });

  it('BD-67: «Salir sin guardar» descarta los cambios y cambia de sección', async () => {
    await open('/settings');
    fireEvent.change(field('Base de datos'), { target: { value: 'otra' } });
    fireEvent.click(checkbox('Borrar la contraseña guardada'));
    fireEvent.click(button('Preparar'));
    fireEvent.click(inDialog('Salir sin guardar'));
    expect(navigations).toEqual(['']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(server.callsTo('PUT', BASE + '/config')).toEqual([]);

    fireEvent.click(button('Configuración'));
    expect(field('Base de datos').value).toBe('demo');
    expect(checkbox('Borrar la contraseña guardada').checked).toBe(false);
  });

  it('BD-67: «Guardar» guarda y cambia de sección', async () => {
    await open('/settings');
    fireEvent.change(field('Contraseña de root'), { target: { value: 'clave-de-prueba' } });
    fireEvent.click(button('Copias'));
    await act(async () => {
      fireEvent.click(inDialog('Guardar'));
    });
    expect((server.callsTo('PUT', BASE + '/config')[0].body as Record<string, unknown>).rootPassword).toBe('clave-de-prueba');
    expect(navigations).toEqual(['/dumps']);
    expect(notices).toEqual(['Configuración guardada.']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('BD-67: si «Guardar» falla, se queda en «Configuración» con el error junto a su campo', async () => {
    await open('/settings');
    fireEvent.change(field('Puerto en la máquina'), { target: { value: 'abc' } });
    backend.fail = {
      status: 400,
      code: 'invalid_config',
      message: '«Puerto en la máquina» debe ser un número entre 1 y 65535',
      details: { field: 'hostPort' },
    };
    fireEvent.click(button('Preparar'));
    await act(async () => {
      fireEvent.click(inDialog('Guardar'));
    });
    expect(navigations).toEqual([]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(field('Puerto en la máquina').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('«Puerto en la máquina» debe ser un número entre 1 y 65535');
  });

  it('BD-67: con «Atrás» y «Adelante» no avisa y lo escrito se conserva', async () => {
    await open('/settings');
    fireEvent.change(field('Base de datos'), { target: { value: 'otra' } });
    act(() => moveHistory(''));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Configuración' })).toBeNull();
    act(() => moveHistory('/settings'));
    expect(field('Base de datos').value).toBe('otra');
  });
});

describe('U-02 formatos', () => {
  it('U-02: los tamaños llevan coma decimal y las fechas van como dd/MM/yyyy HH:mm', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1536)).toBe('1,5 KiB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5,0 GiB');
    expect(formatDateTime(new Date(2026, 10, 2, 9, 5).toISOString())).toBe('02/11/2026 09:05');
    expect(formatDateTime('no es una fecha')).toBe('no es una fecha');
  });
});
