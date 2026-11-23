import {
  DAILY_TICKET_TYPE,
  PRIORITIES,
  TASK_STATUSES,
  type CalendarDay,
  type Filters,
  type OrderUpdate,
  type Parameter,
  type Pending,
  type PendingItem,
  type Task,
  type TaskComment,
} from './types';

/** Las reglas de Gestask que viven en su interfaz, portadas de la versión web sin cambiar su resultado (ADR-0020). */

/** La fecha local de hoy como AAAA-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// --- Backlog ---

/** GT-32: una tarea cerrada, que solo se ve con «Histórico completo». */
export function isClosed(task: Task): boolean {
  if (task.task_status === 'Undone' || task.task_status === 'Unfinished') return true;
  if (task.task_status !== 'Done') return false;
  return task.ticket_type === 'Task' ? task.pr_status === 'Imputed' : task.pr_status === 'Deployed';
}

/** GT-30 a GT-32: los filtros del Backlog, aplicados sin pedir datos. */
export function filterTasks(tasks: Task[], filters: Filters): Task[] {
  const search = filters.search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (task.ticket_type === DAILY_TICKET_TYPE) return false;
    if (search && ![task.title, task.ticket, task.more_info].some((v) => v && String(v).toLowerCase().includes(search))) return false;
    if (filters.statuses.length && !filters.statuses.includes(task.task_status ?? '')) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.date && task.assigned_date !== filters.date && task.finished_date !== filters.date) return false;
    return filters.history || !isClosed(task);
  });
}

export function activeFilterCount(filters: Filters): number {
  return [filters.search.trim(), filters.priority, filters.date, filters.statuses.length, filters.history].filter(Boolean).length;
}

export function commentsOf(task: Task): TaskComment[] {
  if (!Array.isArray(task.comments)) return [];
  return task.comments.map((c) => (typeof c === 'string' ? { text: c } : (c ?? {})));
}

/** GT-35: el orden siguiente al mayor de las tareas no cerradas. */
export function nextOrderPoints(...lists: Task[][]): number {
  const values = lists
    .flat()
    .filter((t) => !['Done', 'Undone', 'Unfinished'].includes(t.task_status ?? ''))
    .map((t) => (t.order_points === null || t.order_points === undefined ? NaN : Number(t.order_points)))
    .filter((v) => Number.isFinite(v));
  return values.length ? Math.max(...values) + 1 : 1;
}

// --- Parámetros del proyecto ---

export const EXTERNAL_PAGE = 'project-external-page';
export const TICKET_MODEL = 'project-ticket-model';
export const TICKET_ORDER = 'project-ticket-order';
export const MINUTE_PE = 'Minute_PE';

export function parameterValue(parameters: Parameter[], name: string): string {
  return String(parameters.find((p) => p.name === name)?.value ?? '').trim();
}

/** GT-26: la URL del ticket en el sistema externo; '' si no hay página configurada. */
export function ticketUrl(parameters: Parameter[], ticket: string | null | undefined): string {
  const base = parameterValue(parameters, EXTERNAL_PAGE);
  const value = String(ticket ?? '').trim();
  if (!base || !value || !/^https?:\/\//i.test(base)) return '';
  const encoded = encodeURIComponent(value);
  if (base.includes('{ticket}')) return base.split('{ticket}').join(encoded);
  return `${base.replace(/\/+$/, '')}/${encoded}`;
}

const isOrderValue = (value: string) => /^\d+$/.test(value);

/** GT-35: el modelo con su primera serie de X sustituida por el número. */
export function applyTicketOrder(model: string, order: string): string {
  const template = model.trim();
  const value = order.trim();
  if (!template || !isOrderValue(value)) return '';
  const placeholder = template.match(/X+/);
  if (!placeholder) return `${template}${value}`;
  const padded = String(Number(value)).padStart(Math.max(placeholder[0].length, value.length), '0');
  return template.replace(placeholder[0], padded);
}

/** GT-35: el ticket que se propone al crear; '' si no hay numeración. */
export function nextTicket(parameters: Parameter[]): string {
  return applyTicketOrder(parameterValue(parameters, TICKET_MODEL), parameterValue(parameters, TICKET_ORDER));
}

/** GT-37: el contador siguiente, con el mismo número de cifras. */
export function nextTicketOrderValue(order: string): string {
  const value = order.trim();
  if (!isOrderValue(value)) return '';
  return String(Number(value) + 1).padStart(value.length, '0');
}

// --- Kanban ---

/** GT-50 */
export const KANBAN_STATUSES = TASK_STATUSES.filter((s) => s !== 'Undone' && s !== 'Unfinished');

/** GT-50, GT-51: las tareas de una columna, por orden descendente. */
export function kanbanColumn(tasks: Task[], status: string): Task[] {
  const orderValue = (t: Task) => {
    const v = t.order_points === null || t.order_points === undefined ? NaN : Number(t.order_points);
    return Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY;
  };
  return tasks
    .filter((t) => t.ticket_type !== DAILY_TICKET_TYPE && t.task_status === status)
    .filter((t) => !(t.task_status === 'Done' && (t.pr_status === 'Imputed' || t.pr_status === 'Deployed')))
    .sort((a, b) => {
      const byOrder = orderValue(b) - orderValue(a);
      // Infinity - Infinity es NaN: dos tareas sin orden empatan.
      return (Number.isNaN(byOrder) ? 0 : byOrder) || String(a.id).localeCompare(String(b.id));
    });
}

// --- Ordenar ---

function changed(updates: OrderUpdate[], tasks: Task[]): OrderUpdate[] {
  const current = new Map(tasks.map((t) => [t.id, Number(t.order_points)]));
  return updates.filter((u) => Number.isInteger(u.order_points) && current.get(u.id) !== u.order_points);
}

/** GT-61: los cambios de mover la tarea de from a to en la lista (por orden descendente). */
export function moveUpdates(tasks: Task[], from: number, to: number): OrderUpdate[] {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return [];
  if (from < 0 || from >= tasks.length || to < 0 || to >= tasks.length || from === to) return [];
  const moved = { id: tasks[from].id, order_points: Number(tasks[to].order_points) };
  const shifted =
    from < to
      ? tasks.slice(from + 1, to + 1).map((t) => ({ id: t.id, order_points: Number(t.order_points) + 1 }))
      : tasks.slice(to, from).map((t) => ({ id: t.id, order_points: Number(t.order_points) - 1 }));
  return changed([moved, ...shifted], tasks);
}

/** GT-62: renumera de 1 a N por orden ascendente; con empates, primero la más reciente. */
export function normalizeUpdates(tasks: Task[]): OrderUpdate[] {
  const ascending = [...tasks].sort(
    (a, b) =>
      Number(a.order_points) - Number(b.order_points) ||
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime() ||
      String(a.id).localeCompare(String(b.id)),
  );
  return changed(
    ascending.map((t, i) => ({ id: t.id, order_points: i + 1 })),
    tasks,
  );
}

// --- Completar ---

const PR_ORDER: Record<string, number> = { 'Need PR': 0, 'Need to Impute': 1, Imputed: 2, Deployed: 3 };

/** GT-70: por estado PR y, dentro, por fecha de finalización ascendente; sin fecha, al final. */
export function sortCompletion(tasks: Task[]): Task[] {
  const time = (d: string | null | undefined) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
  return [...tasks].sort((a, b) => {
    const byStatus = (PR_ORDER[a.pr_status ?? ''] ?? 99) - (PR_ORDER[b.pr_status ?? ''] ?? 99);
    if (byStatus) return byStatus;
    const ta = time(a.finished_date);
    const tb = time(b.finished_date);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** GT-70: el nombre del paso que le toca a la tarea. */
export function stepLabel(task: Task): string {
  return { 'Need PR': 'Informar PR', 'Need to Impute': 'Imputar', Imputed: 'Cerrar' }[task.pr_status ?? ''] ?? 'Resolver';
}

/** GT-70: Task no tiene «Informar PR» ni «Cerrar». */
export function canResolve(task: Task): boolean {
  if (task.pr_status === 'Need to Impute') return true;
  if (task.pr_status === 'Need PR' || task.pr_status === 'Imputed') return task.ticket_type !== 'Task';
  return false;
}

/** GT-72: minutos por punto de esfuerzo; 60 si el parámetro falta o no vale. */
export function minutesPerPoint(parameters: Parameter[]): number {
  const minutes = Number(parameters.find((p) => p.name === MINUTE_PE)?.value);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}

/** GT-72 */
export function effortHours(points: number | null | undefined, minutes: number): number {
  const value = Number(points || 0);
  return Number.isFinite(value) ? (value * minutes) / 60 : 0;
}

/** GT-75: «3h 30m», «4h», «45m»; «0h» si no hay horas. */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0h';
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

const JIRA_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** GT-75: «3h 30m 08/oct/26 08:00 AM»; '' sin fecha de finalización. */
export function jiraTime(hours: number, finished: string | null | undefined): string {
  const match = String(finished ?? '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const month = JIRA_MONTHS[Number(match[2]) - 1];
  if (!month) return '';
  return `${formatHours(hours)} ${match[3]}/${month}/${match[1]} 08:00 AM`;
}

/** GT-77: «TICKET HORA_JIRA»; '' si la tarea no tiene ticket, fecha u horas. */
export function jiraLine(task: Task, minutes: number): string {
  const ticket = String(task.ticket ?? '').trim();
  const hours = effortHours(task.effort_points, minutes);
  const time = hours > 0 ? jiraTime(hours, task.finished_date) : '';
  return ticket && time ? `${ticket} ${time}` : '';
}

/** GT-74: la fecha con la que nace la imputación. */
export function defaultImputedDate(task: Task): string {
  const iso = (v: string | null | undefined) => String(v ?? '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
  return iso(task.imputed_date) || iso(task.finished_date) || todayIso();
}

// --- Formulario ---

/** Lo que se escribe en el formulario de tarea (GT-36): todo texto, como en los campos. */
export interface TaskDraft {
  id: string;
  title: string;
  ticket: string;
  ticket_type: string;
  priority: string;
  assigned_date: string;
  limit_date: string;
  finished_date: string;
  effort_points: string;
  order_points: string;
  task_status: string;
  pr_status: string;
  more_info: string;
}

export function draftOf(task: Partial<Task>): TaskDraft {
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    id: text(task.id),
    title: text(task.title),
    ticket: text(task.ticket),
    ticket_type: text(task.ticket_type) || 'Bug',
    priority: text(task.priority) || 'Menor',
    assigned_date: text(task.assigned_date) || todayIso(),
    limit_date: text(task.limit_date),
    finished_date: text(task.finished_date),
    effort_points: task.effort_points === null || task.effort_points === undefined ? '3' : String(task.effort_points),
    order_points: text(task.order_points),
    task_status: text(task.task_status) || 'To do',
    pr_status: text(task.pr_status) || 'Not Finished',
    more_info: text(task.more_info),
  };
}

/**
 * GT-36: el cuerpo de tasks-create o tasks-update, con los mismos campos que envía la web. prEditable: la tarea
 * guardada está en Done, que es cuando la web deja cambiar el estado PR.
 */
export function taskPayload(draft: TaskDraft, prEditable: boolean): Record<string, unknown> {
  const edit = draft.id !== '';
  const payload: Record<string, unknown> = {
    title: draft.title.trim(),
    ticket: draft.ticket.trim() || null,
    ticket_type: draft.ticket_type || 'Bug',
    priority: draft.priority,
    assigned_date: draft.assigned_date,
    limit_date: draft.limit_date || null,
    effort_points: Number(draft.effort_points || 0),
    order_points: draft.order_points.trim() === '' ? null : Number(draft.order_points),
    more_info: draft.more_info.trim() || null,
  };
  if (edit) {
    payload.id = draft.id;
    payload.task_status = draft.task_status;
    if (prEditable) payload.pr_status = draft.pr_status;
    if (draft.task_status === 'Done' && draft.finished_date) payload.finished_date = draft.finished_date;
  }
  return payload;
}

/** GT-38: el borrador de clonar una tarea. */
export function cloneOf(task: Task, order: number, ticket: string): Partial<Task> {
  return {
    title: task.title,
    ticket: ticket || task.ticket,
    ticket_type: task.ticket_type,
    priority: task.priority,
    assigned_date: task.assigned_date,
    limit_date: task.limit_date,
    effort_points: task.effort_points,
    order_points: order,
    more_info: task.more_info,
  };
}

// --- Fechas ---

/** El día AAAA-MM-DD desplazado days días, en UTC para que los cambios de hora no salten ni repitan un día (GT-80). */
export function shiftDay(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return todayIso();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDate(value: string | null | undefined): Date | null {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** «lunes, 16 de noviembre de 2026»; el texto tal cual si no es una fecha (GT-103). */
export function longDate(value: string): string {
  const date = localDate(value);
  if (!date) return value;
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// --- Jornada y horario (GT-90 a GT-94) ---

export const START_TIME = 'hora_inicio';
export const END_TIME = 'hora_fin';
export const BREAK_TIME = 'hora_descanso';
export const BREAK_DURATION = 'duracion_descanso';
export const DAILY_POINTS = 'PE_diario';
export const INTENSIVE_START_TIME = 'hora_inicio_intensivo';
export const INTENSIVE_END_TIME = 'hora_fin_intensivo';
export const INTENSIVE_DAILY_POINTS = 'PE_diario_intensivo';
export const INTENSIVE_WEEK_DAYS = 'dias_semana_intensivo';
export const INTENSIVE_MONTHS = 'meses_intensivo';
export const EXTRA_POINTS = 'PE_diario_extra';
export const TIME_OFFSET = 'hora_horario_offset';

/** El bloque «Daily» con el que empieza la jornada. */
const DAILY_BLOCK_MINUTES = 60;
const MINUTES_PER_DAY = 24 * 60;

function rawValue(parameters: Parameter[], name: string): unknown {
  return parameters.find((p) => p.name === name)?.value;
}

/** Un número; el de por defecto si falta o no es un número (como Number() en la web: un valor vacío es 0). */
function numberParameter(parameters: Parameter[], name: string, fallback: number): number {
  const value = Number(rawValue(parameters, name));
  return Number.isFinite(value) ? value : fallback;
}

function parseTime(value: unknown): number | null {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Una hora H:MM en minutos; la de por defecto si falta o no es válida. */
function timeParameter(parameters: Parameter[], name: string, fallback: string): number {
  return parseTime(rawValue(parameters, name) ?? fallback) ?? parseTime(fallback) ?? 0;
}

function numberList(value: unknown): number[] {
  return String(value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part));
}

/** Una lista de enteros separados por comas; la de por defecto si no queda ninguno. */
function listParameter(parameters: Parameter[], name: string, fallback: string): number[] {
  const numbers = numberList(rawValue(parameters, name) ?? fallback);
  return numbers.length ? numbers : numberList(fallback);
}

/** GT-92: un día es intensivo por su día de la semana (1 lunes … 7 domingo) o por su mes. */
export function isIntensive(date: string | null | undefined, parameters: Parameter[]): boolean {
  const parsed = localDate(date);
  if (!parsed) return false;
  const weekDay = parsed.getDay() === 0 ? 7 : parsed.getDay();
  return (
    listParameter(parameters, INTENSIVE_WEEK_DAYS, '5').includes(weekDay) ||
    listParameter(parameters, INTENSIVE_MONTHS, '7,8').includes(parsed.getMonth() + 1)
  );
}

/** GT-92: la jornada de un día, en minutos desde las 0:00. */
export interface Workday {
  intensive: boolean;
  /** El objetivo de puntos de esfuerzo del día. */
  dailyPoints: number;
  start: number;
  /** El fin, con las horas extra si se incluyen (GT-94). */
  end: number;
  breakStart: number;
  breakMinutes: number;
  /** GT-93: lo que se suma a las horas que se muestran. */
  offsetMinutes: number;
  minutesPerPoint: number;
}

/** GT-92, GT-94: la jornada de un día según los parámetros, con sus valores por defecto. */
export function workday(parameters: Parameter[], date: string | null | undefined, includeExtra = false): Workday {
  const intensive = isIntensive(date, parameters);
  const start = intensive ? timeParameter(parameters, INTENSIVE_START_TIME, '8:00') : timeParameter(parameters, START_TIME, '8:00');
  const end = intensive ? timeParameter(parameters, INTENSIVE_END_TIME, '15:00') : timeParameter(parameters, END_TIME, '17:30');
  const baseEnd = end > start ? end : start;
  const minutes = minutesPerPoint(parameters);
  const points = intensive ? numberParameter(parameters, INTENSIVE_DAILY_POINTS, 9) : numberParameter(parameters, DAILY_POINTS, 12);
  const extraRaw = numberParameter(parameters, EXTRA_POINTS, 3);
  const extra = extraRaw > 0 ? extraRaw : 3;
  const effectiveEnd = baseEnd + (includeExtra ? extra * minutes : 0);
  const breakMinutes = numberParameter(parameters, BREAK_DURATION, 60);
  return {
    intensive,
    dailyPoints: points > 0 ? points : intensive ? 9 : 12,
    start,
    end: effectiveEnd,
    // Sin descanso en jornada intensiva: empieza donde acaba el día y nunca entra en la agenda.
    breakStart: intensive ? effectiveEnd : timeParameter(parameters, BREAK_TIME, '14:00'),
    breakMinutes: breakMinutes > 0 ? breakMinutes : 60,
    offsetMinutes: numberParameter(parameters, TIME_OFFSET, 0) * 60,
    minutesPerPoint: minutes,
  };
}

/** GT-93: «8:00»; con el desplazamiento y dando la vuelta a medianoche. */
export function formatClock(minutes: number, offsetMinutes = 0): string {
  const total = Math.max(0, Math.round((Number(minutes) || 0) + (Number(offsetMinutes) || 0)));
  const normalized = total % MINUTES_PER_DAY;
  return `${Math.floor(normalized / 60)}:${String(normalized % 60).padStart(2, '0')}`;
}

/** GT-90, GT-91: un bloque de la agenda. */
export type ScheduleItem =
  | { kind: 'daily' | 'break'; start: number; end: number }
  | { kind: 'task'; task: Task; start: number; end: number; partial: boolean };

export interface Schedule {
  items: ScheduleItem[];
  workday: Workday;
  /** GT-93: los puntos de esfuerzo que caben en la agenda. */
  plannedPoints: number;
}

function orderValue(task: Task): number {
  const value = Number(task.order_points);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/** GT-90: por orden descendente; con el mismo orden, la creada antes. */
function byOrderDesc(a: Task, b: Task): number {
  const byOrder = orderValue(b) - orderValue(a);
  // Como en la web: dos tareas sin orden numérico empatan.
  if (byOrder !== 0) return Number.isNaN(byOrder) ? 0 : byOrder;
  return String(a.created_at || a.id || '').localeCompare(String(b.created_at || b.id || ''));
}

/** GT-90 a GT-94: la agenda del parte, calculada como en la web. */
export function buildSchedule(tasks: Task[], parameters: Parameter[], date: string | null | undefined, includeExtra = false): Schedule {
  const day = workday(parameters, date, includeExtra);
  const items: ScheduleItem[] = [];
  let cursor = Math.min(day.start + DAILY_BLOCK_MINUTES, day.end);
  let breakDone = false;
  if (day.start < day.end) items.push({ kind: 'daily', start: day.start, end: cursor });

  for (const task of [...tasks].sort(byOrderDesc)) {
    const effort = Number(task.effort_points);
    let remaining = (Number.isFinite(effort) ? effort : 0) * day.minutesPerPoint;
    if (remaining <= 0) continue;
    while (remaining > 0 && cursor < day.end) {
      if (!breakDone && cursor >= day.breakStart) {
        items.push({ kind: 'break', start: day.breakStart, end: Math.min(day.breakStart + day.breakMinutes, day.end) });
        cursor = Math.min(day.breakStart + day.breakMinutes, day.end);
        breakDone = true;
        continue;
      }
      const stop = !breakDone && cursor < day.breakStart ? Math.min(day.breakStart, day.end) : day.end;
      const duration = Math.min(remaining, stop - cursor);
      if (duration <= 0) break;
      items.push({ kind: 'task', task, start: cursor, end: cursor + duration, partial: duration < remaining && cursor + duration >= day.end });
      cursor += duration;
      remaining -= duration;
    }
    if (cursor >= day.end) break;
  }

  items.sort((a, b) => a.start - b.start || a.end - b.end);
  const minutes = items.reduce((sum, item) => (item.kind === 'task' ? sum + Math.max(0, item.end - item.start) : sum), 0);
  const points = minutes / day.minutesPerPoint;
  return { items, workday: day, plannedPoints: Number.isInteger(points) ? points : Number(points.toFixed(2)) };
}

// --- Diarias (GT-100 a GT-106) ---

/** Un grupo de pendientes con la fecha de su parte. */
export interface PendingGroup {
  date: string;
  late: boolean;
  items: PendingItem[];
}

export interface PendingSummary {
  today: string;
  overdue: PendingItem[];
  todayItems: PendingItem[];
  /** error si hay alguna de un día anterior, warning si solo de hoy, ok si ninguna. */
  status: 'ok' | 'warning' | 'error';
  count: number;
  groups: PendingGroup[];
}

/** «1 tarea diaria», «3 tareas diarias». */
export const dailyTasksText = (count: number) => `${count} tarea${count === 1 ? '' : 's'} diaria${count === 1 ? '' : 's'}`;

/** GT-103, GT-106: las pendientes, separadas entre días anteriores y hoy, y agrupadas por fecha ascendente. */
export function pendingSummary(pending: Pending, fallbackToday = todayIso()): PendingSummary {
  const today = pending.today || fallbackToday;
  const items = Array.isArray(pending.items) ? [...pending.items].sort((a, b) => a.report_date.localeCompare(b.report_date)) : [];
  const overdue = items.filter((item) => item.report_date < today);
  const todayItems = items.filter((item) => item.report_date >= today);
  const groups: PendingGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.report_date) last.items.push(item);
    else groups.push({ date: item.report_date, late: item.report_date < today, items: [item] });
  }
  return {
    today,
    overdue,
    todayItems,
    status: overdue.length ? 'error' : todayItems.length ? 'warning' : 'ok',
    count: items.length,
    groups,
  };
}

/** GT-106: el texto del número de pendientes. */
export function pendingText(summary: PendingSummary): string {
  if (summary.overdue.length) return `${dailyTasksText(summary.overdue.length)} de días anteriores sin realizar`;
  if (summary.todayItems.length) return `${dailyTasksText(summary.todayItems.length)} de hoy por realizar`;
  return 'Tareas diarias al día';
}

/** GT-104: identifica la marca de una diaria en un parte. */
export function completionKey(taskId: string, reportDate: string): string {
  return `${taskId}|${reportDate}`;
}

/** Lo que se escribe en el formulario de una diaria (GT-101). */
export interface DailyDraft {
  id: string;
  title: string;
  ticket: string;
  assigned_date: string;
  task_status: string;
  more_info: string;
}

export function dailyDraftOf(task: Partial<Task>): DailyDraft {
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    id: text(task.id),
    title: text(task.title),
    ticket: text(task.ticket),
    assigned_date: text(task.assigned_date) || todayIso(),
    task_status: task.task_status === 'Done' ? 'Done' : 'To do',
    more_info: text(task.more_info),
  };
}

/** GT-101: el cuerpo de tasks-create o tasks-update de una diaria, con los mismos campos que envía la web. */
export function dailyPayload(draft: DailyDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: draft.title.trim(),
    ticket: draft.ticket.trim() || null,
    ticket_type: DAILY_TICKET_TYPE,
    assigned_date: draft.assigned_date,
    limit_date: null,
    effort_points: 0,
    order_points: null,
    more_info: draft.more_info.trim() || null,
  };
  if (draft.id !== '') {
    payload.id = draft.id;
    payload.task_status = draft.task_status;
  }
  return payload;
}

// --- Calendario (GT-110 a GT-114) ---

export const WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WORK_WEEK_DAYS = 5;

/** 0 lunes … 6 domingo, en UTC para que la zona horaria no cambie el día. */
export function weekdayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** GT-111: los días de lunes a viernes y cuántas columnas vacías van antes del primero. */
export function workWeek(days: CalendarDay[]): { days: CalendarDay[]; leading: number } {
  const work = days.filter((d) => weekdayIndex(d.date) < WORK_WEEK_DAYS);
  return { days: work, leading: work.length ? weekdayIndex(work[0].date) : 0 };
}

/** GT-110: un año que se puede pedir. */
export function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

/** GT-110: el mes desplazado delta meses. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export type DayTone = 'special' | 'today' | 'future' | 'good' | 'low';

const NOT_WORKING = ['Vacaciones', 'Festivos', 'Ausencia', 'Finde'];

/** GT-113: cómo se colorea un día; target es su objetivo de puntos (ADR-0022). */
export function dayTone(day: CalendarDay, target: number, today = todayIso()): DayTone {
  if (NOT_WORKING.includes(day.status)) return 'special';
  if (day.is_today) return 'today';
  if (day.date > today) return 'future';
  return Number(day.completed_points || 0) >= target ? 'good' : 'low';
}

/** GT-111: la observación recortada a max caracteres. */
export function truncate(text: string, max = 70): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** GT-122, GT-123: una subruta de entrada desde «Tableros Jira» (ADR-0030). */
export type Entry =
  | { kind: 'new'; ticket: string; title: string; priority: string }
  | { kind: 'ticket'; ticket: string };

/** GT-122, GT-123: la entrada de la subruta, o null si es una sección normal. */
export function parseEntry(path: string): Entry | null {
  const [base, query = ''] = path.split('?', 2);
  if (base === '/new') {
    const params = new URLSearchParams(query);
    return {
      kind: 'new',
      ticket: (params.get('ticket') ?? '').trim(),
      title: (params.get('title') ?? '').trim(),
      priority: (params.get('priority') ?? '').trim(),
    };
  }
  const match = /^\/ticket\/([^/?]+)$/.exec(path);
  if (!match) return null;
  try {
    return { kind: 'ticket', ticket: decodeURIComponent(match[1]).trim() };
  } catch {
    return { kind: 'ticket', ticket: match[1].trim() };
  }
}

/** Sin mayúsculas, acentos ni espacios de los extremos. */
function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** GT-122: la prioridad de Gestask con ese nombre, sin distinguir mayúsculas ni acentos; '' si no es ninguna. */
export function gestaskPriority(name: string): string {
  const wanted = folded(name);
  return wanted === '' ? '' : (PRIORITIES.find((p) => folded(p) === wanted) ?? '');
}

/** GT-122, GT-123: la tarea con ese ticket, sin distinguir mayúsculas ni espacios; la creada más recientemente. */
export function taskWithTicket(tasks: Task[], ticket: string): Task | undefined {
  const wanted = ticket.trim().toUpperCase();
  if (wanted === '') return undefined;
  return tasks
    .filter((t) => String(t.ticket ?? '').trim().toUpperCase() === wanted)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
}
