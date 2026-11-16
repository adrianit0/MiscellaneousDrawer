import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { GestaskApp, STALE_MS } from '../apps/gestask/GestaskApp';
import {
  applyTicketOrder,
  effortHours,
  filterTasks,
  formatHours,
  isClosed,
  jiraLine,
  jiraTime,
  kanbanColumn,
  minutesPerPoint,
  moveUpdates,
  nextOrderPoints,
  nextTicketOrderValue,
  normalizeUpdates,
  sortCompletion,
  taskPayload,
  draftOf,
  ticketUrl,
  todayIso,
} from '../apps/gestask/logic';
import { NO_FILTERS, type ConfigView, type Parameter, type Task } from '../apps/gestask/types';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { createAppApi } from '../platform/appApi';
import { InApp, testContext } from './miniApp';

/** GT-20 a GT-79: la interfaz de «Gestask», con su API simulada. Datos inventados (S-31). */

const BASE = '/api/apps/gestask';

const CONFIG: ConfigView = {
  supabaseUrl: 'https://proyecto-de-prueba.supabase.example',
  publishableKey: 'clave-publicable-de-prueba',
  email: 'persona@example.test',
  passwordSet: true,
  missing: [],
};

const EMPTY: ConfigView = {
  supabaseUrl: null,
  publishableKey: null,
  email: null,
  passwordSet: false,
  missing: ['supabaseUrl', 'publishableKey', 'email', 'password'],
};

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    ticket: null,
    ticket_type: 'Bug',
    title: `Tarea ${partial.id}`,
    assigned_date: '2026-11-02',
    limit_date: null,
    finished_date: null,
    effort_points: 3,
    order_points: null,
    priority: 'Menor',
    task_status: 'To do',
    pr_status: 'Not Finished',
    more_info: null,
    comments: [],
    scoring: 1,
    created_at: '2026-11-02T08:00:00Z',
    ...partial,
  };
}

function tasks(): Task[] {
  return [
    task({ id: 'a', ticket: 'DEMO-0001', title: 'Arreglar el listado', order_points: 3, priority: 'Crítica', more_info: 'Falla con filtros' }),
    task({ id: 'b', ticket: 'DEMO-0002', title: 'Exportar a CSV', ticket_type: 'Feature', order_points: 2, task_status: 'Doing', comments: [{ text: 'Primer comentario', created_at: '2026-11-03T09:00:00Z' }] }),
    task({ id: 'c', title: 'Revisar documentación', ticket_type: 'Task', order_points: 1, task_status: 'Waiting' }),
    task({ id: 'd', ticket: 'DEMO-0004', title: 'Botón de guardar', ticket_type: 'Feature', task_status: 'Done', pr_status: 'Need PR', finished_date: '2026-11-05', effort_points: 2 }),
    task({ id: 'e', ticket: 'DEMO-0005', title: 'Corregir totales', task_status: 'Done', pr_status: 'Need to Impute', finished_date: '2026-11-04', effort_points: 7 }),
    task({ id: 'f', title: 'Limpiar ficheros', ticket_type: 'Task', task_status: 'Done', pr_status: 'Need to Impute', finished_date: '2026-11-03', effort_points: 1 }),
    task({ id: 'g', ticket: 'DEMO-0007', title: 'Migrar tabla', task_status: 'Done', pr_status: 'Imputed', finished_date: '2026-11-01', effort_points: 4 }),
    task({ id: 'h', ticket: 'DEMO-0008', title: 'Tarea ya desplegada', task_status: 'Done', pr_status: 'Deployed', finished_date: '2026-10-20' }),
    task({ id: 'i', title: 'Idea descartada', task_status: 'Undone' }),
  ];
}

function parameters(): Parameter[] {
  return [
    { id: 'p1', name: 'Minute_PE', value: 30 },
    { id: 'p2', name: 'project-external-page', value: 'https://tickets.example.test/browse/{ticket}' },
    { id: 'p3', name: 'project-ticket-model', value: 'DEMO-XXXX' },
    { id: 'p4', name: 'project-ticket-order', value: '0009' },
  ];
}

interface Backend {
  config: ConfigView;
  tasks: Task[];
  parameters: Parameter[];
  /** La siguiente escritura falla con esto. */
  fail: { status: number; code: string; message: string } | null;
  /** Las lecturas de esta función fallan. */
  failRead: string | null;
}

let server: FakeServer;
let backend: Backend;
let navigations: string[];
let notices: { text: string; kind: string }[];
let subtitles: (string | null)[];
let copied: string[];

const FINAL = ['Done', 'Undone', 'Unfinished'];

/** Lo justo de las funciones de Gestask para que la interfaz vea el efecto de lo que envía. */
function route(call: Call): { status?: number; body?: unknown } | undefined {
  const [path] = call.url.slice(BASE.length).split('?');
  if (path === '/config') {
    if (call.method === 'PUT') {
      const body = call.body as Record<string, unknown>;
      backend.config = { ...CONFIG, ...body, passwordSet: backend.config.passwordSet || !!body.password, missing: [] } as ConfigView;
      delete (backend.config as unknown as Record<string, unknown>).password;
    }
    return { body: backend.config };
  }
  if (path === '/connection/test') return { body: { ok: true } };
  if (!path.startsWith('/fn/')) return undefined;
  const fn = path.slice(4);
  if (call.method === 'GET' && backend.failRead === fn) {
    return { status: 502, body: { code: 'supabase_unreachable', message: 'No hay contacto con Supabase', details: null } };
  }
  if (call.method !== 'GET' && backend.fail) {
    const f = backend.fail;
    backend.fail = null;
    return { status: f.status, body: { code: f.code, message: f.message, details: null } };
  }
  const body = (call.body ?? {}) as Record<string, unknown>;
  const find = (id: unknown) => backend.tasks.find((t) => t.id === id)!;
  switch (fn) {
    case 'tasks-list':
      return { body: { tasks: backend.tasks } };
    case 'tasks-completion-list':
      return {
        body: {
          tasks: backend.tasks.filter(
            (t) => t.task_status === 'Done' && (t.ticket_type === 'Task' ? t.pr_status !== 'Imputed' : t.pr_status !== 'Deployed'),
          ),
        },
      };
    case 'tasks-order-list':
      return {
        body: {
          tasks: backend.tasks
            .filter((t) => !FINAL.includes(t.task_status ?? '') && t.order_points !== null)
            .sort((x, y) => Number(y.order_points) - Number(x.order_points)),
        },
      };
    case 'configuration-list':
      return { body: { configurations: backend.parameters } };
    case 'tasks-create':
      backend.tasks = [task({ ...(body as Partial<Task>), id: `n${backend.tasks.length}` }), ...backend.tasks];
      return { body: { task: backend.tasks[0] } };
    case 'tasks-update': {
      const { comment, ...rest } = body;
      const current = find(body.id);
      Object.assign(current, rest);
      if (comment) current.comments = [...(current.comments ?? []), { text: String(comment), created_at: '2026-11-16T10:00:00Z' }];
      return { body: { task: current } };
    }
    case 'tasks-delete':
      backend.tasks = backend.tasks.filter((t) => t.id !== body.id);
      return { body: { deleted: body.id } };
    case 'tasks-order-update':
      for (const u of body.updates as { id: string; order_points: number }[]) find(u.id).order_points = u.order_points;
      return { body: { tasks: [] } };
    case 'tasks-completion-resolve': {
      const current = find(body.id);
      current.pr_status = { 'Need PR': 'Need to Impute', 'Need to Impute': 'Imputed', Imputed: 'Deployed' }[current.pr_status ?? ''];
      Object.assign(current, body);
      return { body: { task: current } };
    }
    case 'configuration-profile-update':
      backend.parameters.find((p) => p.id === body.configuration_id)!.value = body.value;
      return { body: { configuration: {} } };
    default:
      return undefined;
  }
}

function Harness({ initialPath = '', active = true }: { initialPath?: string; active?: boolean }) {
  const [path, setPath] = useState(initialPath);
  // Como en el shell: el cliente no cambia al ocultar o mostrar la mini app.
  const api = useMemo(() => createAppApi('gestask'), []);
  const value = useMemo(
    () =>
      testContext({
        id: 'gestask',
        api,
        path,
        active,
        navigate: (to) => {
          navigations.push(to);
          setPath(to);
        },
        notify: (text, kind = 'info') => notices.push({ text, kind }),
        setSubtitle: (text) => subtitles.push(text),
      }),
    [api, path, active],
  );
  return (
    <InApp value={value}>
      <GestaskApp />
    </InApp>
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const dialog = (name: string | RegExp) => screen.getByRole('dialog', { name });
const fn = (name: string, method = 'POST') => server.callsTo(method, `${BASE}/fn/${name}`);
const reads = () => server.calls.filter((c) => c.method === 'GET' && c.url.startsWith(`${BASE}/fn/`));
const titles = (container: HTMLElement = document.body) =>
  within(container)
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('p, [class*="title"]')?.textContent);
const lastNotice = () => notices[notices.length - 1];

async function open(initialPath = '') {
  const view = render(<Harness initialPath={initialPath} />);
  await screen.findByRole('navigation', { name: 'Secciones' });
  await waitFor(() => expect(screen.queryByText('Cargando…')).toBeNull());
  return view;
}

/** Espera a que termine la acción en curso y su recarga. */
async function settled() {
  await waitFor(() => expect(screen.queryByText('Guardando…')).toBeNull());
  await waitFor(() => expect(screen.queryByText('Cargando…')).toBeNull());
}

beforeEach(() => {
  resetShell();
  navigations = [];
  notices = [];
  subtitles = [];
  copied = [];
  backend = { config: CONFIG, tasks: tasks(), parameters: parameters(), fail: null, failRead: null };
  server = installFakeServer({ appRoutes: route });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gestask: reglas portadas de la web', () => {
  it('GT-32 una tarea está cerrada si es Undone, Unfinished, Done desplegada o Task imputada', () => {
    expect(isClosed(task({ id: '1', task_status: 'Undone' }))).toBe(true);
    expect(isClosed(task({ id: '2', task_status: 'Unfinished' }))).toBe(true);
    expect(isClosed(task({ id: '3', task_status: 'Done', pr_status: 'Deployed' }))).toBe(true);
    expect(isClosed(task({ id: '4', task_status: 'Done', pr_status: 'Imputed' }))).toBe(false);
    expect(isClosed(task({ id: '5', ticket_type: 'Task', task_status: 'Done', pr_status: 'Imputed' }))).toBe(true);
    expect(isClosed(task({ id: '6', task_status: 'Doing' }))).toBe(false);
  });

  it('GT-30 GT-31 los filtros buscan en título, ticket e info, por fecha de asignación o de finalización, y nunca muestran diarias', () => {
    const list = [...tasks(), task({ id: 'z', ticket_type: 'Diaria', title: 'Revisar correo' })];
    const ids = (f: Partial<typeof NO_FILTERS>) => filterTasks(list, { ...NO_FILTERS, ...f }).map((t) => t.id);
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(ids({ history: true })).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    expect(ids({ search: '  demo-0002 ' })).toEqual(['b']);
    expect(ids({ search: 'FILTROS' })).toEqual(['a']);
    expect(ids({ statuses: ['Doing', 'Waiting'] })).toEqual(['b', 'c']);
    expect(ids({ priority: 'Crítica' })).toEqual(['a']);
    expect(ids({ date: '2026-11-04' })).toEqual(['e']);
    expect(ids({ date: '2026-11-02' })).toHaveLength(7);
  });

  it('GT-26 el enlace del ticket sustituye {ticket} o lo añade tras una barra, y sin página no hay enlace', () => {
    expect(ticketUrl(parameters(), 'DEMO 1')).toBe('https://tickets.example.test/browse/DEMO%201');
    expect(ticketUrl([{ id: 'x', name: 'project-external-page', value: 'https://tickets.example.test/t/' }], 'A-1')).toBe(
      'https://tickets.example.test/t/A-1',
    );
    expect(ticketUrl([], 'A-1')).toBe('');
    expect(ticketUrl([{ id: 'x', name: 'project-external-page', value: 'javascript:alert(1)' }], 'A-1')).toBe('');
  });

  it('GT-35 GT-37 el ticket siguiente rellena las X del modelo y el contador conserva sus cifras', () => {
    expect(applyTicketOrder('DEMO-XXXX', '0009')).toBe('DEMO-0009');
    expect(applyTicketOrder('DEMO-XX', '12345')).toBe('DEMO-12345');
    expect(applyTicketOrder('DEMO-', '7')).toBe('DEMO-7');
    expect(applyTicketOrder('DEMO-XXXX', '')).toBe('');
    expect(applyTicketOrder('', '7')).toBe('');
    expect(nextTicketOrderValue('0009')).toBe('0010');
    expect(nextTicketOrderValue('99')).toBe('100');
    expect(nextTicketOrderValue('abc')).toBe('');
    expect(nextOrderPoints(tasks())).toBe(4);
    expect(nextOrderPoints([])).toBe(1);
  });

  it('GT-36 el cuerpo de la tarea lleva los mismos campos que el formulario de la web', () => {
    const created = taskPayload(draftOf({ title: ' Nueva ', order_points: 4, ticket: '' }), false);
    expect(created).toEqual({
      title: 'Nueva',
      ticket: null,
      ticket_type: 'Bug',
      priority: 'Menor',
      assigned_date: todayIso(),
      limit_date: null,
      effort_points: 3,
      order_points: 4,
      more_info: null,
    });
    const done = taskPayload({ ...draftOf(tasks()[3]), finished_date: '2026-11-06' }, true);
    expect(done).toMatchObject({ id: 'd', task_status: 'Done', pr_status: 'Need PR', finished_date: '2026-11-06' });
    // Sin Done guardado, el estado PR no se envía, y sin Done en el formulario, tampoco la fecha.
    const open = taskPayload({ ...draftOf(tasks()[0]), finished_date: '2026-11-06' }, false);
    expect(open).not.toHaveProperty('pr_status');
    expect(open).not.toHaveProperty('finished_date');
    expect(taskPayload({ ...draftOf(tasks()[0]), order_points: ' ' }, false).order_points).toBeNull();
  });

  it('GT-50 GT-51 cada columna del tablero va por orden descendente y sin las Done imputadas o desplegadas', () => {
    const list = [...tasks(), task({ id: 'j', order_points: 9 }), task({ id: 'k' })];
    expect(kanbanColumn(list, 'To do').map((t) => t.id)).toEqual(['j', 'a', 'k']);
    expect(kanbanColumn(list, 'Done').map((t) => t.id)).toEqual(['d', 'e', 'f']);
    expect(kanbanColumn(list, 'Undone')).toHaveLength(1);
  });

  it('GT-61 mover hacia abajo suma 1 a las intermedias y hacia arriba les resta 1', () => {
    const list = [task({ id: 'a', order_points: 5 }), task({ id: 'b', order_points: 4 }), task({ id: 'c', order_points: 3 }), task({ id: 'd', order_points: 2 })];
    expect(moveUpdates(list, 0, 2)).toEqual([
      { id: 'a', order_points: 3 },
      { id: 'b', order_points: 5 },
      { id: 'c', order_points: 4 },
    ]);
    expect(moveUpdates(list, 3, 1)).toEqual([
      { id: 'd', order_points: 4 },
      { id: 'b', order_points: 3 },
      { id: 'c', order_points: 2 },
    ]);
    expect(moveUpdates(list, 1, 1)).toEqual([]);
    expect(moveUpdates(list, 0, 9)).toEqual([]);
    expect(moveUpdates(list, -1, 0)).toEqual([]);
  });

  it('GT-62 GT-63 renumerar da 1 a N por orden ascendente y solo lleva las que cambian', () => {
    const list = [
      task({ id: 'a', order_points: 10 }),
      task({ id: 'b', order_points: 4, created_at: '2026-11-01T00:00:00Z' }),
      task({ id: 'c', order_points: 4, created_at: '2026-11-05T00:00:00Z' }),
      task({ id: 'd', order_points: 1 }),
    ];
    expect(normalizeUpdates(list)).toEqual([
      { id: 'c', order_points: 2 },
      { id: 'b', order_points: 3 },
      { id: 'a', order_points: 4 },
    ]);
    expect(normalizeUpdates([task({ id: 'a', order_points: 2 }), task({ id: 'b', order_points: 1 })])).toEqual([]);
  });

  it('GT-72 GT-75 GT-77 las horas salen de Minute_PE y la hora Jira lleva el mes en español', () => {
    expect(minutesPerPoint(parameters())).toBe(30);
    expect(minutesPerPoint([])).toBe(60);
    expect(minutesPerPoint([{ id: 'x', name: 'Minute_PE', value: '0' }])).toBe(60);
    expect(effortHours(7, 30)).toBe(3.5);
    expect(formatHours(3.5)).toBe('3h 30m');
    expect(formatHours(4)).toBe('4h');
    expect(formatHours(0.75)).toBe('45m');
    expect(formatHours(0)).toBe('0h');
    expect(jiraTime(3.5, '2026-10-08')).toBe('3h 30m 08/oct/26 08:00 AM');
    expect(jiraTime(4, '2026-09-09')).toBe('4h 09/sep/26 08:00 AM');
    expect(jiraTime(4, null)).toBe('');
    expect(jiraLine(task({ id: 'x', ticket: 'DEMO-2500', effort_points: 7, finished_date: '2026-10-08' }), 30)).toBe(
      'DEMO-2500 3h 30m 08/oct/26 08:00 AM',
    );
    expect(jiraLine(task({ id: 'x', effort_points: 7, finished_date: '2026-10-08' }), 30)).toBe('');
    expect(jiraLine(task({ id: 'x', ticket: 'A', effort_points: 0, finished_date: '2026-10-08' }), 30)).toBe('');
  });

  it('GT-70 las tareas a completar van por estado PR y, dentro, por fecha de finalización', () => {
    expect(sortCompletion(tasks().filter((t) => t.task_status === 'Done')).map((t) => t.id)).toEqual(['d', 'f', 'e', 'g', 'h']);
  });
});

describe('Gestask: conexión', () => {
  it('GT-21 sin conexión completa las secciones de tareas llevan a «Conexión» y no piden datos', async () => {
    backend.config = EMPTY;
    await open();
    expect(screen.getByText('Falta configurar la conexión con Supabase.')).toBeTruthy();
    expect(reads()).toHaveLength(0);
    fireEvent.click(button('Ir a Conexión'));
    expect(navigations).toEqual(['/connection']);
    expect(await screen.findByRole('form', { name: 'Conexión' })).toBeTruthy();
  });

  it('GT-01 GT-02 GT-05 guarda la conexión, envía la contraseña solo si se escribe y vuelve a cargar los datos', async () => {
    backend.config = EMPTY;
    await open('/connection');
    expect(screen.getByText('No hay ninguna contraseña guardada.')).toBeTruthy();
    expect(button('Probar conexión').disabled).toBe(true);
    fireEvent.change(field('URL de Supabase'), { target: { value: ' https://proyecto-de-prueba.supabase.example ' } });
    fireEvent.change(field('Clave publicable'), { target: { value: 'clave-publicable-de-prueba' } });
    fireEvent.change(field('Email'), { target: { value: 'persona@example.test' } });
    fireEvent.change(field('Contraseña'), { target: { value: 'clave-secreta-de-prueba' } });
    fireEvent.click(button('Guardar'));
    await waitFor(() => expect(lastNotice()?.text).toBe('Conexión guardada.'));
    expect(server.callsTo('PUT', `${BASE}/config`)[0].body).toEqual({
      supabaseUrl: 'https://proyecto-de-prueba.supabase.example',
      publishableKey: 'clave-publicable-de-prueba',
      email: 'persona@example.test',
      password: 'clave-secreta-de-prueba',
    });
    // La contraseña no vuelve al formulario.
    expect(field('Contraseña').value).toBe('');
    expect(screen.getByText('Hay una contraseña guardada. Escribe otra para cambiarla.')).toBeTruthy();
    await waitFor(() => expect(reads().map((c) => c.url.slice(BASE.length + 4).split('?')[0]).sort()).toEqual([
      'configuration-list',
      'tasks-completion-list',
      'tasks-list',
      'tasks-order-list',
    ]));

    // Sin escribirla no se envía; marcada para borrar, va vacía.
    fireEvent.change(field('Email'), { target: { value: 'otra@example.test' } });
    fireEvent.click(button('Guardar'));
    await waitFor(() => expect(server.callsTo('PUT', `${BASE}/config`)).toHaveLength(2));
    expect(server.callsTo('PUT', `${BASE}/config`)[1].body).not.toHaveProperty('password');
    await waitFor(() => expect(button('Guardar').disabled).toBe(false));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Borrar la contraseña guardada' }));
    fireEvent.click(button('Guardar'));
    await waitFor(() => expect(server.callsTo('PUT', `${BASE}/config`)).toHaveLength(3));
    expect((server.callsTo('PUT', `${BASE}/config`)[2].body as { password: string }).password).toBe('');
  });

  it('GT-04 GT-06 un formato incorrecto se dice junto a su campo, y «Probar conexión» inicia sesión con lo guardado', async () => {
    await open('/connection');
    fireEvent.click(button('Probar conexión'));
    expect(await screen.findByText('Conexión correcta: se ha iniciado sesión en Supabase.')).toBeTruthy();
    expect(server.callsTo('POST', `${BASE}/connection/test`)).toHaveLength(1);

    server.appRoutes = (call) =>
      call.method === 'PUT'
        ? { status: 400, body: { code: 'invalid_config', message: '«URL de Supabase» debe ser https://<servidor>', details: { field: 'supabaseUrl' } } }
        : route(call);
    fireEvent.change(field('URL de Supabase'), { target: { value: 'ftp://x' } });
    // Con cambios sin guardar no se prueba.
    expect(button('Probar conexión').disabled).toBe(true);
    fireEvent.click(button('Guardar'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('«URL de Supabase» debe ser https://<servidor>');
    expect(field('URL de Supabase').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('Gestask: Backlog', () => {
  it('GT-20 GT-22 al abrir carga las cuatro listas, nombra la sección y cuenta las tareas a completar', async () => {
    await open();
    expect(reads().map((c) => c.url.slice(BASE.length))).toEqual([
      '/fn/tasks-list?sort_by=created_at&sort_direction=desc',
      '/fn/tasks-completion-list',
      '/fn/tasks-order-list',
      '/fn/configuration-list',
    ]);
    expect(subtitles).toContain('Backlog');
    expect(within(button(/^Completar/)).getByTitle('Tareas que esperan un paso de cierre').textContent).toBe('4');
    fireEvent.click(button(/^Kanban/));
    expect(navigations).toEqual(['/kanban']);
    expect(subtitles).toContain('Kanban');
  });

  it('GT-30 GT-31 GT-32 lista las tareas abiertas y filtra sin volver a pedir datos', async () => {
    await open();
    expect(titles()).toEqual(['Arreglar el listado', 'Exportar a CSV', 'Revisar documentación', 'Botón de guardar', 'Corregir totales', 'Limpiar ficheros', 'Migrar tabla']);
    const first = screen.getAllByRole('row')[1];
    expect(within(first).getByRole('link', { name: 'DEMO-0001' }).getAttribute('href')).toBe('https://tickets.example.test/browse/DEMO-0001');
    expect(within(first).getByText('Falla con filtros')).toBeTruthy();
    expect(within(screen.getAllByRole('row')[2]).getByTitle('1 comentario')).toBeTruthy();
    const before = reads().length;

    fireEvent.change(screen.getByRole('searchbox', { name: 'Texto a buscar' }), { target: { value: 'csv' } });
    expect(titles()).toEqual(['Exportar a CSV']);
    fireEvent.click(button('Limpiar filtros (1)'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Waiting' }));
    expect(titles()).toEqual(['Revisar documentación']);
    fireEvent.click(button('Limpiar filtros (1)'));
    expect(button('Limpiar filtros').disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Histórico completo' }));
    expect(titles()).toContain('Tarea ya desplegada');
    expect(titles()).toContain('Idea descartada');
    expect(reads()).toHaveLength(before);
  });

  it('GT-33 GT-34 cambiar la ordenación vuelve a pedir solo tasks-list y se recuerda con los filtros', async () => {
    await open();
    const before = reads().length;
    fireEvent.change(field('Ordenar por'), { target: { value: 'scoring' } });
    fireEvent.change(field('Dirección'), { target: { value: 'asc' } });
    await waitFor(() => expect(reads()).toHaveLength(before + 2));
    expect(reads()[before + 1].url).toBe(`${BASE}/fn/tasks-list?sort_by=scoring&sort_direction=asc`);
    fireEvent.change(field('Prioridad'), { target: { value: 'Crítica' } });
    await waitFor(() =>
      expect(server.appStates.gestask).toEqual({
        sort: { by: 'scoring', dir: 'asc' },
        filters: { ...NO_FILTERS, priority: 'Crítica' },
      }),
    );
  });

  it('GT-34 abre con la ordenación y los filtros guardados', async () => {
    server.appStates.gestask = { sort: { by: 'order_points', dir: 'desc' }, filters: { ...NO_FILTERS, statuses: ['Doing'] } };
    await open();
    await waitFor(() => expect(titles()).toEqual(['Exportar a CSV']));
    await waitFor(() => expect(reads().some((c) => c.url.endsWith('tasks-list?sort_by=order_points&sort_direction=desc'))).toBe(true));
  });

  it('GT-22 un fallo al cargar se muestra con «Reintentar» sin descartar lo demás', async () => {
    backend.failRead = 'tasks-order-list';
    await open();
    expect(screen.getByRole('alert').textContent).toContain('No hay contacto con Supabase');
    expect(titles()).toHaveLength(7);
    backend.failRead = null;
    fireEvent.click(button('Reintentar'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('GT-35 GT-36 GT-37 crea una tarea con el orden y el ticket siguientes y avanza el contador', async () => {
    await open();
    fireEvent.click(button('Crear tarea'));
    const form = dialog('Crear tarea');
    expect(field('Ticket').value).toBe('DEMO-0009');
    expect(field('Puntos de orden').value).toBe('4');
    expect(field('Puntos de esfuerzo').value).toBe('3');
    expect(field('Fecha asignación').value).toBe(todayIso());
    expect(field('Fecha finalización').disabled).toBe(true);
    expect(within(form).queryByLabelText('Estado tarea')).toBeNull();
    expect(document.activeElement).toBe(field('Título'));

    fireEvent.change(field('Título'), { target: { value: 'Nueva pantalla' } });
    fireEvent.change(field('Tipo'), { target: { value: 'Feature' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
    await settled();

    expect(fn('tasks-create')[0].body).toEqual({
      title: 'Nueva pantalla',
      ticket: 'DEMO-0009',
      ticket_type: 'Feature',
      priority: 'Menor',
      assigned_date: todayIso(),
      limit_date: null,
      effort_points: 3,
      order_points: 4,
      more_info: null,
    });
    expect(fn('configuration-profile-update')[0].body).toEqual({ configuration_id: 'p4', value: '0010' });
    expect(lastNotice()).toEqual({ text: 'Tarea creada.', kind: 'info' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(titles()[0]).toBe('Nueva pantalla');
    // GT-24: tras el cambio se recargan las tres listas de tareas, no los parámetros.
    expect(server.callsTo('GET', `${BASE}/fn/configuration-list`)).toHaveLength(1);
    expect(server.callsTo('GET', `${BASE}/fn/tasks-order-list`)).toHaveLength(2);
    // Y la siguiente propone el ticket siguiente.
    fireEvent.click(button('Crear tarea'));
    expect(field('Ticket').value).toBe('DEMO-0010');
  });

  it('GT-37 con otro ticket el contador no avanza, y Alt+N abre el formulario', async () => {
    await open();
    fireEvent.keyDown(window, { key: 'n', code: 'KeyN', altKey: true });
    fireEvent.change(field('Título'), { target: { value: 'Con ticket propio' } });
    fireEvent.change(field('Ticket'), { target: { value: 'OTRO-1' } });
    fireEvent.click(button('Guardar'));
    await settled();
    expect(fn('tasks-create')).toHaveLength(1);
    expect(fn('configuration-profile-update')).toHaveLength(0);
  });

  it('GT-24 si el guardado falla se dice el error, el formulario sigue abierto y se recargan las listas', async () => {
    await open();
    fireEvent.click(button('Crear tarea'));
    fireEvent.change(field('Título'), { target: { value: 'No se guarda' } });
    backend.fail = { status: 400, code: 'function_error', message: 'Invalid ticket type.' };
    fireEvent.click(button('Guardar'));
    await settled();
    expect(lastNotice()).toEqual({ text: 'Invalid ticket type.', kind: 'error' });
    expect(field('Título').value).toBe('No se guarda');
    expect(server.callsTo('GET', `${BASE}/fn/tasks-list`)).toHaveLength(2);
  });

  it('GT-36 GT-39 edita una tarea y la elimina solo tras confirmar', async () => {
    await open();
    fireEvent.click(button('Editar Arreglar el listado'));
    expect(field('Estado PR').disabled).toBe(true);
    fireEvent.change(field('Estado tarea'), { target: { value: 'Done' } });
    expect(field('Fecha finalización').disabled).toBe(false);
    expect(field('Fecha finalización').value).toBe(todayIso());
    fireEvent.change(field('Más info'), { target: { value: 'Resuelto' } });
    fireEvent.click(button('Guardar'));
    await settled();
    expect(fn('tasks-update')[0].body).toMatchObject({ id: 'a', task_status: 'Done', finished_date: todayIso(), more_info: 'Resuelto', title: 'Arreglar el listado' });
    expect(fn('tasks-update')[0].body).not.toHaveProperty('pr_status');

    fireEvent.click(button('Editar Exportar a CSV'));
    fireEvent.click(button('Eliminar tarea'));
    expect(within(dialog('Eliminar tarea')).getByText(/no se puede deshacer/)).toBeTruthy();
    fireEvent.click(button('Cancelar'));
    expect(fn('tasks-delete')).toHaveLength(0);
    fireEvent.click(button('Eliminar tarea'));
    fireEvent.click(button('Eliminar'));
    await settled();
    expect(fn('tasks-delete')[0].body).toEqual({ id: 'b' });
    expect(titles()).not.toContain('Exportar a CSV');
    expect(lastNotice().text).toBe('Tarea eliminada.');
  });

  it('GT-38 clonar abre una tarea nueva con sus datos, sin finalización, y con orden y ticket nuevos', async () => {
    await open();
    fireEvent.click(button('Clonar Botón de guardar'));
    expect(dialog('Crear tarea')).toBeTruthy();
    expect(field('Título').value).toBe('Botón de guardar');
    expect(field('Tipo').value).toBe('Feature');
    expect(field('Ticket').value).toBe('DEMO-0009');
    expect(field('Puntos de orden').value).toBe('4');
    expect(field('Fecha finalización').value).toBe('');
    fireEvent.click(button('Guardar'));
    await settled();
    expect(fn('tasks-create')[0].body).not.toHaveProperty('id');
    expect(fn('configuration-profile-update')).toHaveLength(1);
  });

  it('GT-40 GT-41 GT-42 GT-27 el detalle cambia el estado y añade comentarios, y Esc lo cierra', async () => {
    await open();
    fireEvent.click(screen.getByText('Exportar a CSV'));
    const detail = dialog('Exportar a CSV');
    expect(within(detail).getByText('Detalle de tarea · DEMO-0002')).toBeTruthy();
    expect(within(detail).getByText('Primer comentario')).toBeTruthy();
    expect(field('Estado del PR').disabled).toBe(true);
    // Un comentario vacío no se envía.
    expect(button('Añadir comentario').disabled).toBe(true);

    fireEvent.change(field('Nuevo comentario'), { target: { value: ' Segundo comentario ' } });
    fireEvent.click(button('Añadir comentario'));
    await settled();
    expect(fn('tasks-update')[0].body).toEqual({ id: 'b', comment: 'Segundo comentario' });
    await waitFor(() => expect(field('Nuevo comentario').value).toBe(''));
    const comments = within(screen.getByRole('region', { name: 'Comentarios' })).getAllByRole('listitem');
    // El más reciente primero.
    expect(comments.map((li) => li.querySelector('p')!.textContent)).toEqual(['Segundo comentario', 'Primer comentario']);

    fireEvent.change(field('Estado de la tarea'), { target: { value: 'Done' } });
    await settled();
    expect(fn('tasks-update')[1].body).toEqual({ id: 'b', task_status: 'Done' });
    expect(field('Estado del PR').disabled).toBe(false);

    // Si falla, lo escrito se conserva.
    fireEvent.change(field('Nuevo comentario'), { target: { value: 'No llega' } });
    backend.fail = { status: 502, code: 'supabase_unreachable', message: 'No hay contacto con Supabase' };
    fireEvent.click(button('Añadir comentario'));
    await settled();
    expect(field('Nuevo comentario').value).toBe('No llega');

    fireEvent.keyDown(dialog('Exportar a CSV'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('GT-23 al volver tras más de cinco minutos oculta recarga una vez, y antes no', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const view = await open();
    const before = reads().length;
    view.rerender(<Harness active={false} />);
    now += STALE_MS - 1000;
    view.rerender(<Harness active />);
    expect(reads()).toHaveLength(before);
    view.rerender(<Harness active={false} />);
    now += STALE_MS + 1000;
    view.rerender(<Harness active />);
    await waitFor(() => expect(reads()).toHaveLength(before + 4));
  });
});

describe('Gestask: Kanban', () => {
  const column = (name: string) => screen.getByRole('region', { name });
  const transfer = () => ({ dataTransfer: { setData: () => {}, effectAllowed: '', dropEffect: '' } });

  it('GT-50 GT-51 una columna por estado, sin Undone ni Unfinished, con sus tarjetas', async () => {
    await open('/kanban');
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['To do', 'Doing', 'Draft', 'Need Fix', 'Waiting', 'Done', 'Warning']);
    expect(within(column('Done')).getAllByRole('article').map((a) => a.querySelector('p')!.textContent)).toEqual(['Botón de guardar', 'Corregir totales', 'Limpiar ficheros']);
    expect(within(column('Draft')).getByText('Sin tareas')).toBeTruthy();
    const card = within(column('To do')).getByRole('article');
    expect(card.textContent).toContain('#3');
    expect(card.textContent).toContain('3 PE');
    fireEvent.click(within(card).getByText('Arreglar el listado'));
    expect(dialog('Arreglar el listado')).toBeTruthy();
  });

  it('GT-52 arrastrar una tarjeta a otra columna cambia su estado', async () => {
    await open('/kanban');
    const card = within(column('To do')).getByRole('article');
    fireEvent.dragStart(card, transfer());
    fireEvent.dragOver(column('Doing'), transfer());
    fireEvent.drop(column('Doing'), transfer());
    await settled();
    expect(fn('tasks-update')[0].body).toEqual({ id: 'a', task_status: 'Doing' });
    expect(within(column('Doing')).getAllByRole('article')).toHaveLength(2);

    // Soltarla en su misma columna no hace nada.
    const again = within(column('Waiting')).getByRole('article');
    fireEvent.dragStart(again, transfer());
    fireEvent.drop(column('Waiting'), transfer());
    expect(fn('tasks-update')).toHaveLength(1);
  });
});

describe('Gestask: Ordenar', () => {
  it('GT-60 GT-61 GT-63 mover una tarea envía una sola llamada con las que cambian', async () => {
    await open('/order');
    expect(titles()).toEqual(['Arreglar el listado', 'Exportar a CSV', 'Revisar documentación']);
    expect(button('Mover arriba Arreglar el listado').disabled).toBe(true);
    expect(button('Mover abajo Revisar documentación').disabled).toBe(true);

    fireEvent.click(button('Mover abajo Arreglar el listado'));
    await settled();
    expect(fn('tasks-order-update')).toHaveLength(1);
    expect(fn('tasks-order-update')[0].body).toEqual({
      updates: [
        { id: 'a', order_points: 2 },
        { id: 'b', order_points: 3 },
      ],
    });
    expect(titles()).toEqual(['Exportar a CSV', 'Arreglar el listado', 'Revisar documentación']);
    expect(lastNotice().text).toBe('Orden actualizado.');
  });

  it('GT-61 arrastrar una fila la mueve varias posiciones', async () => {
    await open('/order');
    const rows = screen.getAllByRole('row').slice(1);
    const transfer = { dataTransfer: { setData: () => {}, effectAllowed: '' } };
    fireEvent.dragStart(rows[2], transfer);
    fireEvent.dragOver(rows[0], transfer);
    fireEvent.drop(rows[0], transfer);
    await settled();
    expect(fn('tasks-order-update')[0].body).toEqual({
      updates: [
        { id: 'c', order_points: 3 },
        { id: 'a', order_points: 2 },
        { id: 'b', order_points: 1 },
      ],
    });
  });

  it('GT-62 GT-63 «Ordenar automáticamente» renumera, y si nada cambia no llama', async () => {
    await open('/order');
    fireEvent.click(button('Ordenar automáticamente'));
    expect(fn('tasks-order-update')).toHaveLength(0);
    expect(lastNotice().text).toBe('El orden ya está actualizado.');

    backend.tasks.find((t) => t.id === 'a')!.order_points = 40;
    fireEvent.click(button('Actualizar'));
    await settled();
    fireEvent.click(button('Ordenar automáticamente'));
    await settled();
    expect(fn('tasks-order-update')[0].body).toEqual({ updates: [{ id: 'a', order_points: 3 }] });
  });

  it('GT-63 si el guardado falla la lista queda como estaba', async () => {
    await open('/order');
    backend.fail = { status: 400, code: 'function_error', message: 'Task is not orderable.' };
    fireEvent.click(button('Mover abajo Arreglar el listado'));
    await settled();
    expect(lastNotice()).toEqual({ text: 'Task is not orderable.', kind: 'error' });
    expect(titles()).toEqual(['Arreglar el listado', 'Exportar a CSV', 'Revisar documentación']);
  });
});

describe('Gestask: Completar', () => {
  const table = () => screen.getAllByRole('table').at(-1)!;

  it('GT-70 GT-71 GT-72 lista las tareas por paso, con sus horas, su resumen y la acción que les toca', async () => {
    await open('/completion');
    expect(titles(table())).toEqual(['Botón de guardar', 'Limpiar ficheros', 'Corregir totales', 'Migrar tabla']);
    const steps = within(screen.getByRole('group', { name: 'Resumen por paso' }));
    expect(steps.getByText('Informar PR').parentElement!.querySelector('strong')!.textContent).toBe('1');
    expect(steps.getByText('Imputar horas').parentElement!.querySelector('strong')!.textContent).toBe('2');
    expect(steps.getByText('Cerrar').parentElement!.querySelector('strong')!.textContent).toBe('1');
    // Minute_PE = 30: 7 puntos son 3h 30m.
    expect(within(within(table()).getAllByRole('row')[3]).getByText('3h 30m')).toBeTruthy();
    expect(button('Informar PR: Botón de guardar').disabled).toBe(false);
    expect(button('Imputar: Limpiar ficheros').disabled).toBe(false);
    expect(button('Cerrar: Migrar tabla').disabled).toBe(false);
  });

  it('GT-70 una Task no tiene «Informar PR» ni «Cerrar»', async () => {
    backend.tasks = [task({ id: 't', title: 'Tarea suelta', ticket_type: 'Task', task_status: 'Done', pr_status: 'Need PR', finished_date: '2026-11-01' })];
    await open('/completion');
    expect(button('Informar PR: Tarea suelta').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Informar PR de todas/ })).toBeNull();
  });

  it('GT-73 «Informar PR» envía el enlace y, en una Feature, los test cases', async () => {
    await open('/completion');
    fireEvent.click(button('Informar PR: Botón de guardar'));
    expect(within(dialog('Informar PR')).getByText('Completar tareas · DEMO-0004')).toBeTruthy();
    fireEvent.change(field('Link al PR'), { target: { value: 'https://codigo.example.test/pr/1' } });
    fireEvent.change(field('Test cases'), { target: { value: 'Caso 1' } });
    fireEvent.click(button('Confirmar'));
    await settled();
    expect(fn('tasks-completion-resolve')[0].body).toEqual({ id: 'd', pr_link: 'https://codigo.example.test/pr/1', test_cases: 'Caso 1' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastNotice().text).toBe('Tarea resuelta correctamente.');
    expect(button('Imputar: Botón de guardar')).toBeTruthy();
  });

  it('GT-74 GT-75 «Imputar» muestra la hora Jira, la copia y envía la fecha de imputación', async () => {
    await open('/completion');
    fireEvent.click(button('Imputar: Corregir totales'));
    const d = dialog('Imputar horas');
    expect(within(d).getByText('3h 30m 04/nov/26 08:00 AM')).toBeTruthy();
    expect(field('Fecha de imputación').value).toBe('2026-11-04');
    fireEvent.click(within(d).getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(copied).toEqual(['3h 30m 04/nov/26 08:00 AM']));
    // Copiar no cierra el diálogo.
    expect(dialog('Imputar horas')).toBeTruthy();
    fireEvent.change(field('Fecha de imputación'), { target: { value: '2026-11-06' } });
    fireEvent.click(button('Confirmar'));
    await settled();
    expect(fn('tasks-completion-resolve')[0].body).toEqual({ id: 'e', imputed_date: '2026-11-06' });
  });

  it('GT-76 «Cerrar» avisa de cerrar la tarea fuera y envía solo su identificador', async () => {
    await open('/completion');
    fireEvent.click(button('Cerrar: Migrar tabla'));
    expect(within(dialog('Cerrar tarea')).getByText('Cierra la tarea en el sistema externo antes de confirmar este paso.')).toBeTruthy();
    fireEvent.click(button('Confirmar cierre'));
    await settled();
    expect(fn('tasks-completion-resolve')[0].body).toEqual({ id: 'g' });
    expect(titles(table())).not.toContain('Migrar tabla');
  });

  it('GT-77 «Copiar para Jira» copia una línea por tarea con ticket, y dice cuántas se quedan fuera', async () => {
    await open('/completion');
    fireEvent.click(button('Copiar para Jira (1)'));
    await waitFor(() => expect(copied).toEqual(['DEMO-0005 3h 30m 04/nov/26 08:00 AM']));
    expect(screen.getByText('1 tarea(s) sin ticket, fecha de resolución u horas no se copian para Jira.')).toBeTruthy();
    expect(lastNotice().text).toBe('Copiado al portapapeles.');
    expect(fn('tasks-completion-resolve')).toHaveLength(0);
  });

  it('GT-78 la imputación masiva suma las horas y envía una llamada por tarea marcada con la fecha común', async () => {
    await open('/completion');
    fireEvent.click(button('Ver tabla'));
    const panel = within(screen.getByRole('region', { name: 'Imputación masiva' }));
    expect(panel.getByText('Total').parentElement!.textContent).toContain('4h');
    expect(button('Imputar seleccionadas (0)').disabled).toBe(true);
    expect(field('Fecha de imputación').value).toBe(todayIso());

    fireEvent.click(panel.getByRole('checkbox', { name: 'Seleccionar todas' }));
    expect(panel.getByText('Total seleccionado (2)')).toBeTruthy();
    fireEvent.change(field('Fecha de imputación'), { target: { value: '2026-11-10' } });
    fireEvent.click(button('Imputar seleccionadas (2)'));
    expect(within(dialog('Imputar seleccionadas')).getByText('¿Imputar 2 tarea(s) seleccionada(s) y pasarlas a Imputed?')).toBeTruthy();
    fireEvent.click(button('Imputar'));
    await settled();
    expect(fn('tasks-completion-resolve').map((c) => c.body)).toEqual([
      { id: 'f', imputed_date: '2026-11-10' },
      { id: 'e', imputed_date: '2026-11-10' },
    ]);
    expect(lastNotice().text).toBe('2 tarea(s) imputadas correctamente.');
  });

  it('GT-79 las acciones masivas piden confirmación y se detienen en la primera que falla', async () => {
    backend.tasks.push(task({ id: 'x', title: 'Otra imputada', task_status: 'Done', pr_status: 'Imputed', finished_date: '2026-11-02' }));
    await open('/completion');
    fireEvent.click(button('Cerrar imputadas (2)'));
    fireEvent.click(button('Cancelar'));
    expect(fn('tasks-completion-resolve')).toHaveLength(0);

    fireEvent.click(button('Informar PR de todas (1)'));
    fireEvent.click(within(dialog('Informar PR de todas')).getByRole('button', { name: 'Informar PR' }));
    await settled();
    expect(fn('tasks-completion-resolve').map((c) => c.body)).toEqual([{ id: 'd' }]);

    backend.fail = { status: 400, code: 'function_error', message: 'Invalid completion transition.' };
    fireEvent.click(button('Cerrar imputadas (2)'));
    fireEvent.click(within(dialog('Cerrar imputadas')).getByRole('button', { name: 'Cerrar tareas' }));
    await settled();
    // La primera falla: la segunda no se envía.
    expect(fn('tasks-completion-resolve')).toHaveLength(2);
    expect(lastNotice()).toEqual({ text: 'Invalid completion transition.', kind: 'error' });
  });

  it('GT-43 desde «Completar» el detalle es de solo lectura, salvo los comentarios', async () => {
    await open('/completion');
    fireEvent.click(screen.getAllByText('Migrar tabla').at(-1)!);
    const d = dialog('Migrar tabla');
    expect(field('Estado de la tarea').disabled).toBe(true);
    expect(field('Estado del PR').disabled).toBe(true);
    expect(within(d).queryByRole('button', { name: 'Editar' })).toBeNull();
    fireEvent.change(field('Nuevo comentario'), { target: { value: 'Imputada en Jira' } });
    fireEvent.click(button('Añadir comentario'));
    await settled();
    expect(fn('tasks-update')[0].body).toEqual({ id: 'g', comment: 'Imputada en Jira' });
    await act(async () => {});
  });
});
