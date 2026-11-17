import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { GestaskApp } from '../apps/gestask/GestaskApp';
import {
  buildSchedule,
  dailyDraftOf,
  dailyPayload,
  dayTone,
  formatClock,
  isIntensive,
  pendingSummary,
  pendingText,
  shiftDay,
  todayIso,
  workday,
  workWeek,
} from '../apps/gestask/logic';
import type { CalendarDay, ConfigView, Parameter, Task } from '../apps/gestask/types';
import { createAppApi } from '../platform/appApi';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** GT-80 a GT-114: «Tareas diarias», «Horario diario», «Diarias» y «Calendario», con la API simulada. Datos inventados (S-31). */

const BASE = '/api/apps/gestask';
const TODAY = todayIso();
const YESTERDAY = shiftDay(TODAY, -1);

const CONFIG: ConfigView = {
  supabaseUrl: 'https://proyecto-de-prueba.supabase.example',
  publishableKey: 'clave-publicable-de-prueba',
  email: 'persona@example.test',
  passwordSet: true,
  missing: [],
};

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    ticket: null,
    ticket_type: 'Bug',
    title: `Tarea ${partial.id}`,
    assigned_date: '2026-10-01',
    limit_date: null,
    finished_date: null,
    effort_points: 1,
    order_points: null,
    priority: 'Menor',
    task_status: 'To do',
    pr_status: 'Not Finished',
    more_info: null,
    comments: [],
    scoring: 1,
    created_at: '2026-10-01T08:00:00Z',
    ...partial,
  };
}

const daily = (id: string, title: string, partial: Partial<Task> = {}) =>
  task({ id, title, ticket_type: 'Diaria', effort_points: 0, order_points: null, ...partial });

/** Una jornada que nunca es intensiva, para que la fecha real de las pruebas no cambie el horario. */
function parameters(): Parameter[] {
  return [
    { id: 'p1', name: 'Minute_PE', value: 60 },
    { id: 'p2', name: 'dias_semana_intensivo', value: '9' },
    { id: 'p3', name: 'meses_intensivo', value: '13' },
  ];
}

interface Backend {
  tasks: Task[];
  routine: Task[];
  /** Los partes por fecha: sus tareas y la marca de cada diaria. */
  reports: Record<string, { tasks: string[]; daily: Record<string, string | null> }>;
  days: Record<string, { status: string; note: string | null }>;
  parameters: Parameter[];
  /** La escritura número failAt de esta función falla con failure. */
  failOn: { fn: string; at: number; message: string } | null;
}

let server: FakeServer;
let backend: Backend;
let navigations: string[];
let notices: { text: string; kind: string }[];
let subtitles: (string | null)[];

const fnError = (status: number, message: string) => ({ status, body: { code: 'function_error', message, details: null } });

function pendingItems() {
  const items: { task_id: string; ticket: string | null; title: string; more_info: string | null; report_date: string }[] = [];
  for (const [date, report] of Object.entries(backend.reports)) {
    for (const [id, completed] of Object.entries(report.daily)) {
      const t = backend.routine.find((r) => r.id === id);
      if (!t || completed || (t.finished_date && date >= t.finished_date)) continue;
      items.push({ task_id: id, ticket: t.ticket ?? null, title: t.title ?? '', more_info: t.more_info ?? null, report_date: date });
    }
  }
  return items.sort((a, b) => a.report_date.localeCompare(b.report_date) || a.title.localeCompare(b.title));
}

function month(year: number, m: number): CalendarDay[] {
  const count = new Date(year, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const date = `${year}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    const weekend = [0, 6].includes(new Date(`${date}T00:00:00`).getDay());
    const done = backend.tasks.filter((t) => t.task_status === 'Done' && t.finished_date === date);
    return {
      date,
      day: i + 1,
      status: weekend ? 'Finde' : (backend.days[date]?.status ?? 'Laboral'),
      note: backend.days[date]?.note ?? null,
      is_today: date === TODAY,
      completed_points: done.reduce((sum, t) => sum + Number(t.effort_points || 0), 0),
      completed_tasks: done.map(({ id, ticket, title, ticket_type, effort_points, finished_date }) => ({ id, ticket, title, ticket_type, effort_points, finished_date })),
    };
  });
}

const writes: Record<string, number> = {};

/** Lo justo de las funciones de Gestask para que la interfaz vea el efecto de lo que envía. */
function route(call: Call): { status?: number; body?: unknown } | undefined {
  const [path, search = ''] = call.url.slice(BASE.length).split('?');
  const query = new URLSearchParams(search);
  if (path === '/config') return { body: CONFIG };
  if (!path.startsWith('/fn/')) return undefined;
  const fn = path.slice(4);
  if (call.method !== 'GET') {
    writes[fn] = (writes[fn] ?? 0) + 1;
    if (backend.failOn && backend.failOn.fn === fn && backend.failOn.at === writes[fn]) return fnError(400, backend.failOn.message);
  }
  const body = (call.body ?? {}) as Record<string, unknown>;
  const all = () => [...backend.tasks, ...backend.routine];
  const find = (id: unknown) => all().find((t) => t.id === id)!;
  switch (fn) {
    case 'tasks-list':
      return { body: { tasks: query.get('ticket_type') === 'Diaria' ? backend.routine : backend.tasks } };
    case 'tasks-completion-list':
    case 'tasks-order-list':
      return { body: { tasks: [] } };
    case 'configuration-list':
      return { body: { configurations: backend.parameters } };
    case 'daily-report-get': {
      const date = query.get('date') ?? TODAY;
      const report = backend.reports[date];
      return {
        body: {
          report: report ? { id: `r-${date}`, report_date: date } : null,
          tasks: report ? report.tasks.map(find) : [],
          daily_tasks: report ? Object.entries(report.daily).map(([id, completed_at]) => ({ ...find(id), completed_at })) : [],
          editable: date === TODAY,
        },
      };
    }
    case 'daily-report-create': {
      if (backend.reports[TODAY]) return fnError(409, 'El parte diario está ya creado');
      const open = backend.tasks.filter((t) => !['Done', 'Undone', 'Unfinished'].includes(t.task_status ?? ''));
      const required = backend.routine.filter((t) => !t.finished_date);
      backend.reports[TODAY] = { tasks: open.map((t) => t.id), daily: Object.fromEntries(required.map((t) => [t.id, null])) };
      return { body: { report: { report_date: TODAY }, added_tasks: open.length, added_daily_tasks: required.length } };
    }
    case 'daily-tasks-pending':
      return { body: { today: TODAY, items: pendingItems() } };
    case 'daily-tasks-complete':
      backend.reports[String(body.report_date)].daily[String(body.task_id)] = body.completed ? '2026-11-17T10:00:00Z' : null;
      return { body: { task_id: body.task_id } };
    case 'tasks-create': {
      const created = task({ ...(body as Partial<Task>), id: `n${all().length}` });
      if (created.ticket_type === 'Diaria') {
        backend.routine.push(created);
        // Como el disparador de Supabase: entra en el parte de hoy si existe.
        if (backend.reports[TODAY]) backend.reports[TODAY].daily[created.id] = null;
      } else backend.tasks.push(created);
      return { body: { task: created } };
    }
    case 'tasks-update': {
      const current = find(body.id);
      Object.assign(current, body);
      if (current.ticket_type === 'Diaria') current.finished_date = current.task_status === 'Done' ? (current.finished_date ?? TODAY) : null;
      return { body: { task: current } };
    }
    case 'tasks-delete':
      backend.routine = backend.routine.filter((t) => t.id !== body.id);
      backend.tasks = backend.tasks.filter((t) => t.id !== body.id);
      return { body: { deleted: body.id } };
    case 'calendar-month-get': {
      const year = Number(query.get('year'));
      const m = Number(query.get('month'));
      return { body: { year, month: m, days: month(year, m) } };
    }
    case 'calendar-day-status-update':
      backend.days[String(body.day)] = { status: String(body.status), note: (body.note as string | null) ?? null };
      return { body: { day_status: body } };
    default:
      return undefined;
  }
}

function Harness({ initialPath = '' }: { initialPath?: string }) {
  const [path, setPath] = useState(initialPath);
  const api = useMemo(() => createAppApi('gestask'), []);
  const value = useMemo(
    () =>
      testContext({
        id: 'gestask',
        api,
        path,
        active: true,
        navigate: (to) => {
          navigations.push(to);
          setPath(to);
        },
        notify: (text, kind = 'info') => notices.push({ text, kind }),
        setSubtitle: (text) => subtitles.push(text),
      }),
    [api, path],
  );
  return (
    <InApp value={value}>
      <GestaskApp />
    </InApp>
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const checkbox = (name: string | RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const reads = (name: string) => server.callsTo('GET', `${BASE}/fn/${name}`);
const posts = (name: string) => server.callsTo('POST', `${BASE}/fn/${name}`);
const lastNotice = () => notices[notices.length - 1];

async function open(initialPath = '') {
  render(<Harness initialPath={initialPath} />);
  await screen.findByRole('navigation', { name: 'Secciones' });
  await waitFor(() => expect(screen.queryByText('Cargando…')).toBeNull());
}

async function settled() {
  await waitFor(() => expect(screen.queryByText('Guardando…')).toBeNull());
  await waitFor(() => expect(screen.queryByText('Cargando…')).toBeNull());
}

beforeEach(() => {
  resetShell();
  navigations = [];
  notices = [];
  subtitles = [];
  for (const key of Object.keys(writes)) delete writes[key];
  backend = {
    tasks: [
      task({ id: 'a', ticket: 'DEMO-0101', title: 'Revisar informe', order_points: 3, effort_points: 3, task_status: 'Doing' }),
      task({ id: 'b', ticket: 'DEMO-0102', title: 'Corregir cálculo', order_points: 2, effort_points: 3, priority: 'Crítica' }),
      task({ id: 'c', title: 'Documentar API', ticket_type: 'Task', order_points: 1, effort_points: 4 }),
      task({ id: 'z', ticket: 'DEMO-0099', title: 'Cerrada en octubre', task_status: 'Done', pr_status: 'Deployed', finished_date: '2026-10-07', effort_points: 12 }),
      task({ id: 'y', title: 'Media jornada', ticket_type: 'Feature', task_status: 'Done', pr_status: 'Imputed', finished_date: '2026-10-08', effort_points: 3 }),
    ],
    routine: [
      daily('d1', 'Revisar el correo', { ticket: 'RUT-1', more_info: 'Bandeja de entrada' }),
      daily('d2', 'Actualizar el tablero', { created_at: '2026-10-02T08:00:00Z' }),
      daily('d3', 'Copia semanal', { task_status: 'Done', finished_date: '2026-10-20' }),
    ],
    reports: {
      [TODAY]: { tasks: ['a', 'b', 'c'], daily: { d1: null, d2: '2026-11-17T09:00:00Z' } },
      [YESTERDAY]: { tasks: ['a'], daily: { d1: null, d2: null } },
    },
    days: { '2026-10-09': { status: 'Vacaciones', note: null }, '2026-10-08': { status: 'Laboral', note: 'Médico por la tarde y después reunión larga con el equipo para revisar el plan del trimestre' } },
    parameters: parameters(),
    failOn: null,
  };
  server = installFakeServer({ appRoutes: route });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gestask: reglas del día a día portadas de la web', () => {
  const monday = '2026-11-16';

  it('GT-90 GT-91 la agenda empieza con Daily, parte la tarea que cruza el descanso y marca como parcial la que no cabe', () => {
    const tasks = [
      task({ id: 'c', order_points: 1, effort_points: 4 }),
      task({ id: 'a', order_points: 3, effort_points: 3 }),
      task({ id: 'b', order_points: 2, effort_points: 3 }),
      task({ id: 'cero', order_points: 9, effort_points: 0 }),
      task({ id: 'sin-orden', order_points: null, effort_points: 1 }),
    ];
    const schedule = buildSchedule(tasks, [], monday);
    expect(schedule.items.map((i) => `${i.kind === 'task' ? i.task.id : i.kind} ${formatClock(i.start)}-${formatClock(i.end)}${i.kind === 'task' && i.partial ? ' parcial' : ''}`)).toEqual([
      'daily 8:00-9:00',
      'a 9:00-12:00',
      'b 12:00-14:00',
      'break 14:00-15:00',
      'b 15:00-16:00',
      'c 16:00-17:30 parcial',
    ]);
    expect(schedule.plannedPoints).toBe(7.5);
    expect(schedule.workday.dailyPoints).toBe(12);
    // Si el fin no es posterior al inicio, no hay agenda.
    expect(buildSchedule(tasks, [{ id: 'f', name: 'hora_fin', value: '7:00' }], monday).items).toEqual([]);
  });

  it('GT-92 la jornada intensiva va por día de la semana o por mes, sin descanso, y lo que no vale toma su valor por defecto', () => {
    expect(isIntensive(monday, [])).toBe(false);
    expect(isIntensive('2026-11-20', [])).toBe(true); // viernes
    expect(isIntensive('2026-07-14', [])).toBe(true); // julio
    expect(isIntensive(monday, [{ id: 'w', name: 'dias_semana_intensivo', value: '1, 3' }])).toBe(true);
    const friday = workday([], '2026-11-20');
    expect([friday.intensive, formatClock(friday.start), formatClock(friday.end), friday.dailyPoints]).toEqual([true, '8:00', '15:00', 9]);
    expect(buildSchedule([task({ id: 'x', effort_points: 7, order_points: 1 })], [], '2026-11-20').items.map((i) => i.kind)).toEqual(['daily', 'task']);

    const wrong: Parameter[] = [
      { id: '1', name: 'PE_diario', value: 'muchos' },
      { id: '2', name: 'hora_inicio', value: '25:00' },
      { id: '3', name: 'duracion_descanso', value: -5 },
      { id: '4', name: 'Minute_PE', value: 0 },
    ];
    const day = workday(wrong, monday);
    expect([day.dailyPoints, formatClock(day.start), day.breakMinutes, day.minutesPerPoint]).toEqual([12, '8:00', 60, 60]);
    expect(workday([{ id: '5', name: 'PE_diario', value: 0 }], monday).dailyPoints).toBe(12);
  });

  it('GT-93 GT-94 las horas llevan el desplazamiento y dan la vuelta a medianoche, e «Incluir horas» alarga el fin', () => {
    expect(formatClock(8 * 60)).toBe('8:00');
    expect(formatClock(23 * 60 + 30, 120)).toBe('1:30');
    const params: Parameter[] = [
      { id: '1', name: 'Minute_PE', value: 40 },
      { id: '2', name: 'PE_diario_extra', value: 3 },
    ];
    expect(formatClock(workday(params, monday).end)).toBe('17:30');
    expect(formatClock(workday(params, monday, true).end)).toBe('19:30');
    expect(formatClock(workday([{ id: '3', name: 'PE_diario_extra', value: -1 }], monday, true).end)).toBe('20:30');
  });

  it('GT-103 GT-106 las pendientes se separan entre días anteriores y hoy y se agrupan por fecha', () => {
    const item = (id: string, date: string) => ({ task_id: id, title: id, report_date: date });
    const summary = pendingSummary({ today: '2026-11-17', items: [item('t2', '2026-11-17'), item('t1', '2026-11-16'), item('t3', '2026-11-16')] });
    expect(summary.groups.map((g) => [g.date, g.late, g.items.length])).toEqual([
      ['2026-11-16', true, 2],
      ['2026-11-17', false, 1],
    ]);
    expect([summary.status, summary.count, pendingText(summary)]).toEqual(['error', 3, '2 tareas diarias de días anteriores sin realizar']);
    const today = pendingSummary({ today: '2026-11-17', items: [item('t2', '2026-11-17')] });
    expect([today.status, pendingText(today)]).toEqual(['warning', '1 tarea diaria de hoy por realizar']);
    expect(pendingSummary({ today: '2026-11-17', items: [] }).status).toBe('ok');
  });

  it('GT-101 el cuerpo de una diaria lleva los mismos campos que el formulario de la web', () => {
    const create = dailyDraftOf({ ticket_type: 'Diaria' });
    expect(create.assigned_date).toBe(todayIso());
    expect(dailyPayload({ ...create, title: ' Revisar el correo ', assigned_date: '2026-11-02' })).toEqual({
      title: 'Revisar el correo',
      ticket: null,
      ticket_type: 'Diaria',
      assigned_date: '2026-11-02',
      limit_date: null,
      effort_points: 0,
      order_points: null,
      more_info: null,
    });
    const edit = dailyDraftOf(daily('d1', 'Revisar el correo', { ticket: 'RUT-1', task_status: 'Done', more_info: 'Bandeja' }));
    expect(dailyPayload(edit)).toMatchObject({ id: 'd1', task_status: 'Done', ticket: 'RUT-1', more_info: 'Bandeja' });
  });

  it('GT-111 GT-113 la cuadrícula solo lleva días laborables y un día cumple si llega a su objetivo', () => {
    const d = (date: string, status = 'Laboral', points = 0, today = false): CalendarDay => ({
      date,
      day: Number(date.slice(8)),
      status,
      completed_points: points,
      is_today: today,
    });
    const week = workWeek([d('2026-10-01'), d('2026-10-02'), d('2026-10-03', 'Finde'), d('2026-10-04', 'Finde'), d('2026-10-05')]);
    expect([week.leading, week.days.map((x) => x.day)]).toEqual([3, [1, 2, 5]]);
    expect(dayTone(d('2026-10-05', 'Vacaciones'), 12, '2026-11-17')).toBe('special');
    expect(dayTone(d('2026-11-17', 'Laboral', 0, true), 12, '2026-11-17')).toBe('today');
    expect(dayTone(d('2026-11-18'), 12, '2026-11-17')).toBe('future');
    // ADR-0022: cumple con el objetivo del día, no con 4 puntos fijos.
    expect(dayTone(d('2026-10-05', 'Laboral', 12), 12, '2026-11-17')).toBe('good');
    expect(dayTone(d('2026-10-05', 'Laboral', 4), 12, '2026-11-17')).toBe('low');
    expect(workday([], '2026-10-02').dailyPoints).toBe(9); // viernes intensivo
  });
});

describe('Gestask: Tareas diarias', () => {
  it('GT-20 GT-80 GT-82 muestra el parte de hoy sin las diarias, y cambiar de día pide solo ese parte', async () => {
    await open('/daily');
    expect(subtitles).toContain('Tareas diarias');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row').slice(1).map((r) => r.querySelector('p')?.textContent)).toEqual([
      'Revisar informe',
      'Corregir cálculo',
      'Documentar API',
    ]);
    expect(screen.queryByText('Revisar el correo')).toBeNull();
    expect(button('Hoy').disabled).toBe(true);

    const before = server.calls.length;
    fireEvent.click(button('Día anterior'));
    await waitFor(() => expect(screen.getByText(/Modo histórico/)).toBeTruthy());
    expect(server.calls.slice(before).map((c) => c.url.slice(BASE.length))).toEqual([
      `/fn/daily-report-get?date=${YESTERDAY}&sort_by=order_points&sort_direction=desc`,
    ]);
    expect(field('Fecha del parte').value).toBe(YESTERDAY);
    fireEvent.change(field('Fecha del parte'), { target: { value: '2026-01-05' } });
    expect(await screen.findByText('No existe parte diario para esta fecha.')).toBeTruthy();
    fireEvent.click(button('Hoy'));
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4));
  });

  it('GT-81 cambiar la ordenación vuelve a pedir solo el parte, con sort_by y sort_direction', async () => {
    await open('/daily');
    const before = server.calls.length;
    fireEvent.change(field('Ordenar por'), { target: { value: 'scoring' } });
    fireEvent.change(field('Dirección'), { target: { value: 'asc' } });
    await waitFor(() => expect(server.calls.length).toBe(before + 2));
    expect(server.calls[before + 1].url).toBe(`${BASE}/fn/daily-report-get?date=${TODAY}&sort_by=scoring&sort_direction=asc`);
  });

  it('GT-83 en el parte de hoy el estado se cambia en la tabla; en uno anterior todo es de solo lectura salvo los comentarios', async () => {
    await open('/daily');
    await screen.findByRole('table');
    expect((screen.getByRole('combobox', { name: 'Estado del PR de Revisar informe' }) as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado de Corregir cálculo' }), { target: { value: 'Doing' } });
    await settled();
    expect(posts('tasks-update')[0].body).toEqual({ id: 'b', task_status: 'Doing' });
    expect(lastNotice()).toEqual({ text: 'Tarea actualizada.', kind: 'info' });

    fireEvent.click(button('Día anterior'));
    await screen.findByText('Modo histórico: el parte de un día anterior es de solo lectura.');
    expect(screen.queryByRole('combobox', { name: /^Estado de/ })).toBeNull();
    fireEvent.click(screen.getByText('Revisar informe'));
    const detail = screen.getByRole('dialog', { name: 'Revisar informe' });
    expect(within(detail).queryByRole('button', { name: 'Editar' })).toBeNull();
    expect((within(detail).getByRole('combobox', { name: 'Estado de la tarea' }) as HTMLSelectElement).disabled).toBe(true);
    expect(within(detail).getByLabelText('Nuevo comentario')).toBeTruthy();
  });

  it('GT-84 «Nuevo día» crea el parte de hoy sin cuerpo, dice cuántas diarias añadió y lo elige; si ya existe, dice el error', async () => {
    delete backend.reports[TODAY];
    await open('/daily');
    fireEvent.click(button('Día anterior'));
    await screen.findByText(/Modo histórico/);
    fireEvent.click(button('Nuevo día'));
    await settled();
    expect(posts('daily-report-create')).toHaveLength(1);
    expect(posts('daily-report-create')[0].body).toBeUndefined();
    expect(lastNotice()).toEqual({ text: 'Parte diario creado con 2 tareas diarias obligatorias.', kind: 'info' });
    expect(field('Fecha del parte').value).toBe(TODAY);
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4));
    // GT-24: tras el cambio se recarga todo menos los parámetros, también las pendientes.
    expect(reads('daily-tasks-pending')).toHaveLength(2);
    expect(within(button(/^Diarias/)).getByTitle(/tareas diarias/).textContent).toBe('4');

    fireEvent.click(button('Nuevo día'));
    await settled();
    expect(lastNotice()).toEqual({ text: 'El parte diario está ya creado', kind: 'error' });
  });
});

describe('Gestask: Horario diario', () => {
  it('GT-90 GT-93 GT-95 muestra Daily, descanso y las tareas del parte con sus horas y el resumen de puntos', async () => {
    await open('/schedule');
    expect(subtitles).toContain('Horario diario');
    const agenda = await screen.findByRole('list', { name: 'Horario' });
    const blocks = within(agenda).getAllByRole('listitem').map((li) => li.textContent);
    expect(blocks).toHaveLength(6);
    expect(blocks[0]).toBe('8:009:00Daily');
    expect(blocks[1]).toContain('9:0012:00');
    expect(blocks[1]).toContain('Revisar informe');
    expect(blocks[3]).toBe('14:0015:00Descanso');
    expect(blocks[5]).toContain('Tarea parcial');
    expect(screen.getByText('7.5 / 12 PE')).toBeTruthy();
    expect(screen.getByText('8:00 – 17:30')).toBeTruthy();
    expect(screen.queryByText('Horario intensivo')).toBeNull();

    // Partida por el descanso, la tarea aparece en dos bloques.
    expect(within(agenda).getAllByText('Corregir cálculo')).toHaveLength(2);
    fireEvent.click(within(agenda).getAllByText('Corregir cálculo')[0]);
    expect(screen.getByRole('dialog', { name: 'Corregir cálculo' })).toBeTruthy();
  });

  it('GT-94 «Incluir horas» alarga la jornada y vuelve a su estado al cambiar de sección', async () => {
    await open('/schedule');
    await screen.findByRole('list', { name: 'Horario' });
    fireEvent.click(button('+ Incluir horas'));
    expect(screen.getByText('8:00 – 20:30')).toBeTruthy();
    expect(screen.getByText('10 / 12 PE')).toBeTruthy();
    expect(screen.queryByText('Tarea parcial')).toBeNull();
    fireEvent.click(button('− Mostrar menos horas'));
    expect(screen.getByText('8:00 – 17:30')).toBeTruthy();
    fireEvent.click(button('+ Incluir horas'));
    fireEvent.click(button(/^Calendario/));
    fireEvent.click(button(/^Horario diario/));
    expect(await screen.findByText('8:00 – 17:30')).toBeTruthy();
  });

  it('GT-96 GT-104 marca una diaria del parte, recarga solo pendientes y parte, y si falla vuelve a su valor', async () => {
    await open('/schedule');
    expect(await screen.findByText('1 / 2 realizadas')).toBeTruthy();
    expect(checkbox(/Actualizar el tablero/).checked).toBe(true);
    const before = server.calls.length;
    fireEvent.click(checkbox(/Revisar el correo/));
    expect(checkbox(/Revisar el correo/).checked).toBe(true);
    expect(checkbox(/Revisar el correo/).disabled).toBe(true);
    await waitFor(() => expect(screen.getByText('2 / 2 realizadas')).toBeTruthy());
    await waitFor(() => expect(checkbox(/Revisar el correo/).disabled).toBe(false));
    expect(posts('daily-tasks-complete')[0].body).toEqual({ task_id: 'd1', report_date: TODAY, completed: true });
    expect(
      server.calls
        .slice(before)
        .filter((c) => c.method === 'GET')
        .map((c) => c.url.slice(BASE.length + 4).split('?')[0])
        .sort(),
    ).toEqual(['daily-report-get', 'daily-tasks-pending']);
    expect(lastNotice()).toEqual({ text: 'Tarea diaria marcada como realizada.', kind: 'info' });

    backend.failOn = { fn: 'daily-tasks-complete', at: 2, message: 'Daily report not found.' };
    fireEvent.click(checkbox(/Actualizar el tablero/));
    await waitFor(() => expect(lastNotice()).toEqual({ text: 'Daily report not found.', kind: 'error' }));
    await waitFor(() => expect(checkbox(/Actualizar el tablero/).checked).toBe(true));
  });

  it('GT-95 sin parte del día lo dice', async () => {
    delete backend.reports[TODAY];
    await open('/schedule');
    expect(await screen.findByText('No existe parte diario para mostrar el horario.')).toBeTruthy();
  });
});

describe('Gestask: Diarias', () => {
  it('GT-100 GT-103 GT-106 lista activas, finalizadas y pendientes por fecha, y la pestaña cuenta las pendientes', async () => {
    await open('/routine');
    expect(reads('tasks-list').map((c) => c.url)).toContain(`${BASE}/fn/tasks-list?ticket_type=Diaria&sort_by=created_at&sort_direction=asc`);
    const badge = within(button(/^Diarias/)).getByTitle('2 tareas diarias de días anteriores sin realizar');
    expect([badge.textContent, badge.getAttribute('data-level')]).toEqual(['3', 'error']);

    const groups = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatch(/Atrasada$/);
    expect(groups[1]).toMatch(/Hoy$/);
    expect(groups[0]?.charAt(0)).toBe(groups[0]?.charAt(0).toUpperCase());

    const active = screen.getByRole('heading', { name: /^Activas/ }).parentElement!;
    expect(within(active).getAllByRole('row').slice(1).map((r) => r.querySelector('p')?.textContent)).toEqual(['Revisar el correo', 'Actualizar el tablero']);
    expect(within(active).getAllByText('2026-10-01')).toHaveLength(2);
    const finished = screen.getByText(/^Finalizadas/).closest('details')!;
    expect(within(finished).getByText('Copia semanal')).toBeTruthy();
    expect(within(finished).getByText('2026-10-20')).toBeTruthy();
  });

  it('GT-104 marcar una pendiente la saca de la lista y baja el número de la pestaña', async () => {
    await open('/routine');
    const late = screen.getAllByRole('heading', { level: 3 })[0].parentElement!;
    fireEvent.click(within(late).getByRole('checkbox', { name: /Revisar el correo/ }));
    await waitFor(() => expect(within(button(/^Diarias/)).getByTitle(/tareas? diarias?/).textContent).toBe('2'));
    expect(posts('daily-tasks-complete')[0].body).toEqual({ task_id: 'd1', report_date: YESTERDAY, completed: true });
  });

  it('GT-105 «Marcar todas» pide confirmación, envía una llamada por pendiente en orden y se detiene en la que falla', async () => {
    await open('/routine');
    fireEvent.click(button('Marcar todas como realizadas (3)'));
    const confirm = screen.getByRole('dialog', { name: 'Marcar todas como realizadas' });
    expect(confirm.textContent).toContain('3 tareas diarias pendientes? De ellas, 2 de días anteriores.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(posts('daily-tasks-complete')).toHaveLength(0);

    backend.failOn = { fn: 'daily-tasks-complete', at: 2, message: 'Daily task not found in report.' };
    fireEvent.click(button('Marcar todas como realizadas (3)'));
    fireEvent.click(button('Marcar todas'));
    await waitFor(() => expect(lastNotice()).toEqual({ text: 'Marcadas 1 de 3 tareas diarias. Daily task not found in report.', kind: 'error' }));
    expect(posts('daily-tasks-complete').map((c) => c.body)).toEqual([
      { task_id: 'd2', report_date: YESTERDAY, completed: true },
      { task_id: 'd1', report_date: YESTERDAY, completed: true },
    ]);
    await waitFor(() => expect(button('Marcar todas como realizadas (2)')).toBeTruthy());

    fireEvent.click(button('Marcar todas como realizadas (2)'));
    fireEvent.click(button('Marcar todas'));
    await waitFor(() => expect(lastNotice()).toEqual({ text: '2 tareas diarias marcadas como realizadas.', kind: 'info' }));
    expect(await screen.findByText('Todas las tareas diarias están realizadas.')).toBeTruthy();
    expect(within(button(/^Diarias/)).queryByTitle(/diaria/)).toBeNull();
  });

  it('GT-101 crea una diaria con el formulario reducido y la edita', async () => {
    await open('/routine');
    fireEvent.click(button('Nueva tarea diaria'));
    const form = screen.getByRole('dialog', { name: 'Crear tarea diaria' });
    expect(within(form).queryByLabelText('Tipo')).toBeNull();
    expect(within(form).queryByLabelText('Puntos de esfuerzo')).toBeNull();
    expect(within(form).queryByLabelText('Estado')).toBeNull();
    expect(document.activeElement).toBe(within(form).getByLabelText('Título'));
    fireEvent.change(within(form).getByLabelText('Título'), { target: { value: 'Revisar alertas' } });
    fireEvent.change(within(form).getByLabelText('Ticket'), { target: { value: 'RUT-9' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
    await settled();
    expect(posts('tasks-create')[0].body).toEqual({
      title: 'Revisar alertas',
      ticket: 'RUT-9',
      ticket_type: 'Diaria',
      assigned_date: TODAY,
      limit_date: null,
      effort_points: 0,
      order_points: null,
      more_info: null,
    });
    expect(lastNotice()).toEqual({ text: 'Tarea diaria creada.', kind: 'info' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Activa y, como el parte de hoy existe, también pendiente de hoy.
    await waitFor(() => expect(screen.getAllByText('Revisar alertas')).toHaveLength(2));

    fireEvent.click(button('Editar Revisar el correo'));
    const edit = screen.getByRole('dialog', { name: 'Editar tarea diaria' });
    fireEvent.change(within(edit).getByLabelText('Más info'), { target: { value: 'Y el chat' } });
    fireEvent.click(within(edit).getByRole('button', { name: 'Guardar' }));
    await settled();
    expect(posts('tasks-update')[0].body).toMatchObject({ id: 'd1', task_status: 'To do', ticket_type: 'Diaria', more_info: 'Y el chat', effort_points: 0 });
  });

  it('GT-102 «Finalizar» pide confirmación y «Reactivar» no', async () => {
    await open('/routine');
    fireEvent.click(button('Finalizar Actualizar el tablero'));
    const confirm = screen.getByRole('dialog', { name: 'Finalizar tarea diaria' });
    expect(confirm.textContent).toContain('Dejará de añadirse a los partes diarios nuevos.');
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(posts('tasks-update')).toHaveLength(0);
    fireEvent.click(button('Finalizar Actualizar el tablero'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finalizar' }));
    await settled();
    expect(posts('tasks-update')[0].body).toEqual({ id: 'd2', task_status: 'Done' });

    fireEvent.click(button('Reactivar Copia semanal'));
    await settled();
    expect(posts('tasks-update')[1].body).toEqual({ id: 'd3', task_status: 'To do' });
  });

  it('GT-101 eliminar una diaria pide confirmación diciendo que borra su historial', async () => {
    await open('/routine');
    fireEvent.click(button('Editar Revisar el correo'));
    fireEvent.click(button('Eliminar tarea'));
    const confirm = screen.getByRole('dialog', { name: 'Eliminar tarea diaria' });
    expect(confirm.textContent).toContain('También se borra su historial de partes diarios');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Eliminar' }));
    await settled();
    expect(posts('tasks-delete')[0].body).toEqual({ id: 'd1' });
    expect(lastNotice()).toEqual({ text: 'Tarea eliminada.', kind: 'info' });
  });
});

describe('Gestask: Calendario', () => {
  async function october() {
    await open('/calendar');
    fireEvent.change(field('Año'), { target: { value: '2026' } });
    fireEvent.change(field('Mes'), { target: { value: '10' } });
    return screen.findByRole('article', { name: /^Jueves 1:/ });
  }

  it('GT-110 GT-111 GT-112 GT-113 muestra los días laborables del mes con sus puntos frente al objetivo', async () => {
    await october();
    expect(subtitles).toContain('Calendario');
    expect(reads('calendar-month-get').map((c) => c.url)).toContain(`${BASE}/fn/calendar-month-get?year=2026&month=10`);
    const days = screen.getAllByRole('article');
    expect(days).toHaveLength(22);
    expect(screen.queryByRole('article', { name: /^Sábado/ })).toBeNull();

    const full = screen.getByRole('article', { name: 'Miércoles 7: Laboral, 12 de 12 puntos' });
    expect(full.getAttribute('data-tone')).toBe('good');
    expect(within(full).getByText('12h')).toBeTruthy();
    const half = screen.getByRole('article', { name: 'Jueves 8: Laboral, 3 de 12 puntos' });
    expect(half.getAttribute('data-tone')).toBe('low');
    const note = within(half).getByTitle(/^Médico por la tarde/);
    expect(note.textContent).toHaveLength(70);
    const holiday = screen.getByRole('article', { name: /^Viernes 9: Vacaciones/ });
    expect(holiday.getAttribute('data-tone')).toBe('special');
    expect(within(holiday).getByText('Vacaciones')).toBeTruthy();
    expect(within(holiday).queryByText(/PE$/)).toBeNull();

    fireEvent.click(within(full).getByRole('button', { name: /DEMO-0099/ }));
    expect(screen.getByRole('dialog', { name: 'Cerrada en octubre' })).toBeTruthy();
  });

  it('GT-110 cambiar de mes pide solo ese mes y un año fuera de rango no pide nada', async () => {
    await october();
    const before = server.calls.length;
    fireEvent.click(button('Mes siguiente'));
    await screen.findByRole('article', { name: /^Lunes 2:/ });
    fireEvent.click(button('Mes anterior'));
    await screen.findByRole('article', { name: /^Jueves 1:/ });
    expect(server.calls.slice(before).map((c) => c.url.slice(BASE.length))).toEqual([
      '/fn/calendar-month-get?year=2026&month=11',
      '/fn/calendar-month-get?year=2026&month=10',
    ]);
    fireEvent.change(field('Año'), { target: { value: '1999' } });
    fireEvent.change(field('Año'), { target: { value: '20' } });
    expect(server.calls).toHaveLength(before + 2);
    fireEvent.click(button('Mes actual'));
    const now = new Date();
    await waitFor(() => expect(server.calls[server.calls.length - 1].url).toBe(`${BASE}/fn/calendar-month-get?year=${now.getFullYear()}&month=${now.getMonth() + 1}`));
    await waitFor(() => expect(button('Mes actual').disabled).toBe(true));
  });

  it('GT-114 pulsar un día abre su diálogo, guarda el tipo y la observación y recarga solo el mes', async () => {
    const day = await october();
    fireEvent.click(day);
    const dialog = screen.getByRole('dialog', { name: 'Jueves 1' });
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Tipo de día'));
    fireEvent.change(within(dialog).getByLabelText('Tipo de día'), { target: { value: 'Festivos' } });
    fireEvent.change(within(dialog).getByLabelText('Observaciones'), { target: { value: '  Fiesta local  ' } });
    const before = server.calls.length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts('calendar-day-status-update')[0].body).toEqual({ day: '2026-10-01', status: 'Festivos', note: 'Fiesta local' });
    expect(server.calls.slice(before + 1).map((c) => c.url.slice(BASE.length))).toEqual(['/fn/calendar-month-get?year=2026&month=10']);
    expect(lastNotice()).toEqual({ text: 'Día actualizado.', kind: 'info' });
    const saved = await screen.findByRole('article', { name: /^Jueves 1: Festivos/ });
    expect(within(saved).getByText('Fiesta local')).toBeTruthy();

    // Una observación vacía se envía como null; Enter con el foco en el día también lo abre.
    saved.focus();
    fireEvent.keyDown(saved, { key: 'Enter' });
    const again = screen.getByRole('dialog', { name: 'Jueves 1' });
    fireEvent.change(within(again).getByLabelText('Observaciones'), { target: { value: '   ' } });
    fireEvent.click(within(again).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posts('calendar-day-status-update')).toHaveLength(2));
    expect(posts('calendar-day-status-update')[1].body).toEqual({ day: '2026-10-01', status: 'Festivos', note: null });
  });
});
