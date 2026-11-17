import { ApiError } from '../../platform';

/** Los catálogos de Gestask. Son los de su backend: la mini app no añade valores (ADR-0020). */
export const TASK_STATUSES = ['To do', 'Doing', 'Draft', 'Undone', 'Unfinished', 'Need Fix', 'Waiting', 'Done', 'Warning'] as const;
export const PR_STATUSES = ['Not Finished', 'Need PR', 'Need to Impute', 'Imputed', 'Deployed'] as const;
/** GT-36: los estados PR de una tarea de tipo Task. */
export const TASK_PR_STATUSES = ['Not Finished', 'Need to Impute', 'Imputed'] as const;
export const TICKET_TYPES = ['Bug', 'Feature', 'Task'] as const;
export const DAILY_TICKET_TYPE = 'Diaria';
export const PRIORITIES = ['Trivial', 'Menor', 'Prioritaria', 'Crítica', 'Bloqueante'] as const;

export const STATUS_DESCRIPTIONS: Record<string, string> = {
  'To do': 'Pendiente de empezar.',
  Doing: 'Trabajo en curso.',
  Draft: 'Preparación inicial.',
  Undone: 'Descartada o no realizada.',
  Unfinished: 'No cerrada en el parte.',
  'Need Fix': 'Requiere corrección.',
  Waiting: 'Bloqueada o en espera.',
  Done: 'Finalizada.',
  Warning: 'Requiere atención.',
};

/** GT-33: los campos por los que ordena tasks-list. */
export const SORT_OPTIONS: readonly (readonly [string, string])[] = [
  ['order_points', 'Orden'],
  ['scoring', 'Scoring'],
  ['assigned_date', 'Fecha inicio'],
  ['limit_date', 'Fecha límite'],
  ['finished_date', 'Fecha finalización'],
  ['priority', 'Prioridad'],
  ['task_status', 'Estado'],
  ['pr_status', 'PR'],
  ['ticket_type', 'Tipo'],
  ['created_at', 'Creación'],
  ['updated_at', 'Actualización'],
];

export interface TaskComment {
  text?: string;
  created_at?: string | null;
}

/** Una tarea tal como la devuelven las funciones de Gestask. */
export interface Task {
  id: string;
  ticket?: string | null;
  ticket_type?: string | null;
  title?: string | null;
  assigned_date?: string | null;
  limit_date?: string | null;
  finished_date?: string | null;
  effort_points?: number | null;
  order_points?: number | null;
  priority?: string | null;
  task_status?: string | null;
  pr_status?: string | null;
  more_info?: string | null;
  comments?: (TaskComment | string)[] | null;
  pr_link?: string | null;
  test_cases?: string | null;
  imputed_date?: string | null;
  scoring?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Un parámetro de configuration-list. */
export interface Parameter {
  id: string;
  name: string;
  value?: unknown;
  readonly?: boolean;
}

/** GT-02, GT-03: lo que devuelve GET /config. */
export interface ConfigView {
  supabaseUrl: string | null;
  publishableKey: string | null;
  email: string | null;
  passwordSet: boolean;
  missing: string[];
}

/** GT-31, GT-32 */
export interface Filters {
  search: string;
  priority: string;
  date: string;
  statuses: string[];
  history: boolean;
}

export const NO_FILTERS: Filters = { search: '', priority: '', date: '', statuses: [], history: false };

/** GT-33 */
export interface Sort {
  by: string;
  dir: 'asc' | 'desc';
}

export const DEFAULT_SORT: Sort = { by: 'created_at', dir: 'desc' };

/** GT-63: un cambio de puntos de orden. */
export interface OrderUpdate {
  id: string;
  order_points: number;
}

/** GT-81: la ordenación del parte por defecto. */
export const DEFAULT_DAILY_SORT: Sort = { by: 'order_points', dir: 'desc' };

/** GT-114: los tipos de día que se pueden elegir. */
export const DAY_STATUSES = ['Laboral', 'Vacaciones', 'Festivos', 'Ausencia'] as const;

/** Una diaria del parte, con su marca de realizada (GT-96). */
export interface DailyTask extends Task {
  completed_at?: string | null;
}

/** GT-80: el parte de un día, con el día que se pidió. */
export interface Report {
  /** El día pedido: si no es el elegido, el parte de ese día todavía no ha llegado. */
  date: string;
  /** Si existe el parte de ese día. */
  exists: boolean;
  tasks: Task[];
  daily: DailyTask[];
  editable: boolean;
}

/** GT-103: una diaria sin realizar en un parte. */
export interface PendingItem {
  task_id: string;
  ticket?: string | null;
  title?: string | null;
  more_info?: string | null;
  report_date: string;
}

/** GT-103: lo que devuelve daily-tasks-pending; today es la fecha de Supabase. */
export interface Pending {
  today: string;
  items: PendingItem[];
}

/** GT-111: una tarea cerrada un día del calendario. */
export interface CalendarTask {
  id: string;
  ticket?: string | null;
  title?: string | null;
  ticket_type?: string | null;
  effort_points?: number | null;
  finished_date?: string | null;
}

/** GT-111: un día de calendar-month-get. */
export interface CalendarDay {
  date: string;
  day: number;
  status: string;
  note?: string | null;
  is_today?: boolean;
  completed_points?: number | null;
  completed_tasks?: CalendarTask[] | null;
}

/** GT-110: un mes del calendario, con el mes que se pidió. */
export interface Month {
  year: number;
  month: number;
  days: CalendarDay[];
}

/** Los datos cargados de Supabase (GT-22). El parte y el mes son null hasta que llegan. */
export interface Data {
  tasks: Task[];
  completion: Task[];
  order: Task[];
  parameters: Parameter[];
  report: Report | null;
  routine: Task[];
  pending: Pending;
  calendar: Month | null;
}

export const NO_DATA: Data = {
  tasks: [],
  completion: [],
  order: [],
  parameters: [],
  report: null,
  routine: [],
  pending: { today: '', items: [] },
  calendar: null,
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : 'Ha fallado la operación';
}
