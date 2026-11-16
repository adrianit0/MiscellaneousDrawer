import {
  DAILY_TICKET_TYPE,
  TASK_STATUSES,
  type Filters,
  type OrderUpdate,
  type Parameter,
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
