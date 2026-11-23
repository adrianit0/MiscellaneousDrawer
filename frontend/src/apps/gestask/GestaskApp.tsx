import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppShortcut, useAppState, useMiniApp } from '../../platform';
import { Backlog } from './Backlog';
import { Calendar } from './Calendar';
import { Completion } from './Completion';
import { Connection } from './Connection';
import { Daily } from './Daily';
import { DailyTaskForm } from './DailyTaskForm';
import styles from './gestask.module.css';
import { Kanban } from './Kanban';
import {
  cloneOf,
  completionKey,
  dailyTasksText,
  nextOrderPoints,
  nextTicket,
  nextTicketOrderValue,
  parseEntry,
  gestaskPriority,
  taskWithTicket,
  pendingSummary,
  pendingText,
  TICKET_ORDER,
  todayIso,
} from './logic';
import { Order } from './Order';
import { Routine } from './Routine';
import { Schedule } from './Schedule';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';
import {
  DAILY_TICKET_TYPE,
  DEFAULT_DAILY_SORT,
  DEFAULT_SORT,
  errorMessage,
  NO_DATA,
  NO_FILTERS,
  type CalendarDay,
  type ConfigView,
  type DailyTask,
  type Data,
  type Filters,
  type OrderUpdate,
  type Parameter,
  type Pending,
  type PendingItem,
  type Sort,
  type Task,
} from './types';

/** GT-20: las secciones y su subruta. */
const SECTIONS = [
  { path: '', label: 'Backlog' },
  { path: '/kanban', label: 'Kanban' },
  { path: '/order', label: 'Ordenar' },
  { path: '/completion', label: 'Completar' },
  { path: '/daily', label: 'Tareas diarias' },
  { path: '/schedule', label: 'Horario diario' },
  { path: '/routine', label: 'Diarias' },
  { path: '/calendar', label: 'Calendario' },
  { path: '/connection', label: 'Conexión' },
] as const;

/** GT-23: tiempo oculta a partir del cual se recarga al volver. */
export const STALE_MS = 5 * 60 * 1000;

type Payload = Record<string, unknown>;

/** El formulario abierto: la tarea o los valores iniciales, y el ticket propuesto al crear (GT-37). */
interface FormState {
  task: Partial<Task>;
  proposedTicket: string;
  /** GT-122: cada entrada desde «Tableros Jira» abre un formulario nuevo, aunque ya hubiera otro abierto. */
  entry?: number;
}

interface ReportResponse {
  report?: unknown;
  tasks?: Task[];
  daily_tasks?: DailyTask[];
  editable?: boolean;
}

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** «Gestask» (GT-20 a GT-114): tareas, parte diario, horario, diarias y calendario sobre el Supabase de su versión web. */
export function GestaskApp() {
  const { api, path, navigate, setSubtitle, notify, active } = useMiniApp();
  const section = SECTIONS.find((s) => s.path === path) ?? SECTIONS[0];

  const [config, setConfig] = useState<ConfigView | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  /** Cambia al guardar la conexión: lo cargado ya no vale. */
  const [connection, setConnection] = useState(0);
  const [savedFilters, setFilters] = useAppState<Filters>('filters', NO_FILTERS);
  const [savedSort, setSort] = useAppState<Sort>('sort', DEFAULT_SORT);
  // GT-34: lo guardado puede venir de otra versión.
  const filters: Filters = { ...NO_FILTERS, ...savedFilters, statuses: Array.isArray(savedFilters?.statuses) ? savedFilters.statuses : [] };
  const sort: Sort = { by: savedSort?.by || DEFAULT_SORT.by, dir: savedSort?.dir === 'asc' ? 'asc' : 'desc' };

  /** GT-80, GT-81: el día del parte y su ordenación, que no se recuerdan entre sesiones. */
  const [day, setDay] = useState(todayIso);
  const [daySort, setDaySort] = useState<Sort>(DEFAULT_DAILY_SORT);
  /** GT-110 */
  const [period, setPeriod] = useState(currentMonth);
  /** GT-94 */
  const [includeExtra, setIncludeExtra] = useState(false);
  /** GT-104: las marcas de diarias que se están guardando, con su valor nuevo. */
  const [completing, setCompleting] = useState<ReadonlyMap<string, boolean>>(new Map());

  const [data, setData] = useState<Data>(NO_DATA);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [detail, setDetail] = useState<{ id: string; readonly: boolean } | null>(null);

  const configured = config !== null && config.missing.length === 0;

  useEffect(() => {
    api
      .get<ConfigView>('/config')
      .then((c) => {
        setConfig(c);
        setConfigError(null);
      })
      .catch((e: unknown) => setConfigError(errorMessage(e)));
  }, [api]);

  useEffect(() => {
    setSubtitle(section.label);
    return () => setSubtitle(null);
  }, [section.label, setSubtitle]);

  // GT-94: «Incluir horas» no se guarda; al cambiar de sección vuelve a su estado inicial.
  useEffect(() => setIncludeExtra(false), [section.path]);

  // --- Carga (GT-22 a GT-24) ---

  const sortRef = useRef(sort);
  sortRef.current = sort;
  const dayRef = useRef(day);
  dayRef.current = day;
  const daySortRef = useRef(daySort);
  daySortRef.current = daySort;
  const periodRef = useRef(period);
  periodRef.current = period;
  /** Solo vale la última respuesta de cada lista: una petición anterior que llega tarde se descarta. */
  const listSeq = useRef(0);
  const reportSeq = useRef(0);
  const calendarSeq = useRef(0);

  /** GT-33: la ordenación la hace Supabase. */
  const loadList = useCallback(async () => {
    const mine = ++listSeq.current;
    const query = new URLSearchParams({ sort_by: sortRef.current.by, sort_direction: sortRef.current.dir });
    const result = await api.get<{ tasks?: Task[] }>(`/fn/tasks-list?${query.toString()}`);
    if (mine === listSeq.current) setData((d) => ({ ...d, tasks: result.tasks ?? [] }));
  }, [api]);

  /** GT-80, GT-81: el parte del día elegido. */
  const loadReport = useCallback(async () => {
    const mine = ++reportSeq.current;
    const date = dayRef.current;
    const query = new URLSearchParams({ date, sort_by: daySortRef.current.by, sort_direction: daySortRef.current.dir });
    const r = await api.get<ReportResponse>(`/fn/daily-report-get?${query.toString()}`);
    if (mine !== reportSeq.current) return;
    setData((d) => ({
      ...d,
      report: { date, exists: Boolean(r.report), tasks: r.tasks ?? [], daily: r.daily_tasks ?? [], editable: Boolean(r.editable) },
    }));
  }, [api]);

  /** GT-100 */
  const loadRoutine = useCallback(async () => {
    const query = new URLSearchParams({ ticket_type: DAILY_TICKET_TYPE, sort_by: 'created_at', sort_direction: 'asc' });
    const r = await api.get<{ tasks?: Task[] }>(`/fn/tasks-list?${query.toString()}`);
    setData((d) => ({ ...d, routine: r.tasks ?? [] }));
  }, [api]);

  /** GT-103 */
  const loadPending = useCallback(async () => {
    const r = await api.get<Partial<Pending>>('/fn/daily-tasks-pending');
    setData((d) => ({ ...d, pending: { today: r.today ?? '', items: r.items ?? [] } }));
  }, [api]);

  /** GT-110 */
  const loadCalendar = useCallback(async () => {
    const mine = ++calendarSeq.current;
    const { year, month } = periodRef.current;
    const r = await api.get<{ days?: CalendarDay[] }>(`/fn/calendar-month-get?year=${year}&month=${month}`);
    if (mine === calendarSeq.current) setData((d) => ({ ...d, calendar: { year, month, days: r.days ?? [] } }));
  }, [api]);

  /** Varias cargas a la vez; los errores, sin repetir, en el aviso de la sección. Lo que falla no descarta lo demás. */
  const settle = useCallback(async (loads: Promise<unknown>[]) => {
    const results = await Promise.allSettled(loads);
    const errors = new Set<string>();
    for (const r of results) if (r.status === 'rejected') errors.add(errorMessage(r.reason));
    return errors;
  }, []);

  /** GT-22, GT-24: todo y, si se piden, los parámetros. */
  const load = useCallback(
    async (withParameters: boolean) => {
      setLoading(true);
      const errors = await settle([
        loadList(),
        api.get<{ tasks?: Task[] }>('/fn/tasks-completion-list').then((r) => setData((d) => ({ ...d, completion: r.tasks ?? [] }))),
        api.get<{ tasks?: Task[] }>('/fn/tasks-order-list').then((r) => setData((d) => ({ ...d, order: r.tasks ?? [] }))),
        loadReport(),
        loadRoutine(),
        loadPending(),
        loadCalendar(),
        withParameters
          ? api
              .get<{ configurations?: Parameter[] }>('/fn/configuration-list')
              .then((r) => setData((d) => ({ ...d, parameters: r.configurations ?? [] })))
          : Promise.resolve(),
      ]);
      setError(errors.size ? [...errors].join(' ') : null);
      setLoaded(true);
      setLoading(false);
    },
    [api, loadList, loadReport, loadRoutine, loadPending, loadCalendar, settle],
  );

  /** Una carga parcial: su fallo se suma al aviso con «Reintentar». */
  const reload = useCallback(
    (...loads: Promise<unknown>[]) =>
      settle(loads).then((errors) => {
        if (errors.size) setError([...errors].join(' '));
      }),
    [settle],
  );

  useEffect(() => {
    if (configured) void load(true);
  }, [configured, connection, load]);

  // GT-33: cambiar la ordenación solo vuelve a pedir tasks-list.
  const firstSort = useRef(true);
  useEffect(() => {
    if (firstSort.current) {
      firstSort.current = false;
      return;
    }
    if (!configured) return;
    void reload(loadList());
    // configured no es una dependencia: su carga es la del efecto anterior.
  }, [sort.by, sort.dir, loadList]);

  // GT-23: sin sondeos; al volver tras un rato oculta se recarga una vez.
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      hiddenAt.current = Date.now();
      return;
    }
    const since = hiddenAt.current;
    hiddenAt.current = null;
    if (configured && since !== null && Date.now() - since > STALE_MS) void load(true);
  }, [active, configured, load]);

  /** GT-80: cambiar de día pide solo el parte. */
  const chooseDay = (date: string) => {
    if (date === dayRef.current) return;
    dayRef.current = date;
    setDay(date);
    void reload(loadReport());
  };

  /** GT-81 */
  const chooseDaySort = (next: Sort) => {
    daySortRef.current = next;
    setDaySort(next);
    void reload(loadReport());
  };

  /** GT-110: cambiar de mes pide solo ese mes. */
  const chooseMonth = (year: number, month: number) => {
    if (year === periodRef.current.year && month === periodRef.current.month) return;
    periodRef.current = { year, month };
    setPeriod({ year, month });
    void reload(loadCalendar());
  };

  // --- Acciones (GT-24) ---

  /** Ejecuta un cambio, recarga todo menos los parámetros y dice el resultado. Devuelve si el cambio salió bien. */
  const run = useCallback(
    async (action: () => Promise<void>, done: string | (() => string)): Promise<boolean> => {
      setSaving(true);
      let ok = true;
      try {
        await action();
      } catch (e) {
        ok = false;
        notify(errorMessage(e), 'error');
      }
      await load(false);
      setSaving(false);
      if (ok) notify(typeof done === 'string' ? done : done());
      return ok;
    },
    [load, notify],
  );

  /** GT-37: avanza el contador de tickets. Su fallo no deshace la tarea creada. */
  const advanceTicketOrder = async () => {
    const parameter = data.parameters.find((p) => p.name === TICKET_ORDER);
    if (!parameter || parameter.readonly) return;
    const next = nextTicketOrderValue(String(parameter.value ?? ''));
    if (!next) return;
    try {
      await api.post('/fn/configuration-profile-update', { configuration_id: parameter.id, value: next });
      // Los parámetros no se recargan tras cada cambio (GT-24): el contador se actualiza aquí.
      setData((d) => ({ ...d, parameters: d.parameters.map((p) => (p.id === parameter.id ? { ...p, value: next } : p)) }));
    } catch (e) {
      notify(`La tarea se creó pero no se pudo actualizar el contador de tickets: ${errorMessage(e)}`, 'error');
    }
  };

  const saveTask = async (payload: Payload) => {
    const create = payload.id === undefined;
    const proposed = form?.proposedTicket ?? '';
    const label = payload.ticket_type === DAILY_TICKET_TYPE ? 'Tarea diaria' : 'Tarea';
    const ok = await run(
      async () => {
        await api.post(create ? '/fn/tasks-create' : '/fn/tasks-update', payload);
        if (create && proposed && payload.ticket === proposed) await advanceTicketOrder();
      },
      create ? `${label} creada.` : `${label} guardada.`,
    );
    if (ok) setForm(null);
  };

  const updateTask = (payload: Payload) => run(() => api.post('/fn/tasks-update', payload).then(() => undefined), 'Tarea actualizada.');

  const deleteTask = async (id: string) => {
    setForm(null);
    setDetail(null);
    await run(() => api.post('/fn/tasks-delete', { id }).then(() => undefined), 'Tarea eliminada.');
  };

  /** GT-79: una llamada por tarea, en orden; la primera que falla detiene el resto. */
  const resolve = (payloads: Payload[], done: string) =>
    run(async () => {
      for (const payload of payloads) await api.post('/fn/tasks-completion-resolve', payload);
    }, done);

  /** GT-63 */
  const saveOrder = (updates: OrderUpdate[]) => {
    if (updates.length === 0) {
      notify('El orden ya está actualizado.');
      return;
    }
    void run(() => api.post('/fn/tasks-order-update', { updates }).then(() => undefined), 'Orden actualizado.');
  };

  /** GT-84: crea el parte de hoy y lo elige. */
  const createDay = () => {
    let added = 0;
    void run(
      async () => {
        const r = await api.post<{ added_daily_tasks?: number } | null>('/fn/daily-report-create');
        added = Number(r?.added_daily_tasks) || 0;
        const today = todayIso();
        dayRef.current = today;
        setDay(today);
      },
      () => (added ? `Parte diario creado con ${dailyTasksText(added)} obligatoria${added === 1 ? '' : 's'}.` : 'Parte diario creado.'),
    );
  };

  const setMarks = (keys: string[], value: boolean | null) =>
    setCompleting((current) => {
      const next = new Map(current);
      for (const key of keys) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });

  /** GT-104: marca o desmarca una diaria en un parte y recarga solo las pendientes y el parte. */
  const completeDaily = async (taskId: string, reportDate: string, completed: boolean) => {
    const key = completionKey(taskId, reportDate);
    if (completing.has(key)) return;
    setMarks([key], completed);
    try {
      await api.post('/fn/daily-tasks-complete', { task_id: taskId, report_date: reportDate, completed });
      notify(completed ? 'Tarea diaria marcada como realizada.' : 'Tarea diaria marcada como pendiente.');
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
    await reload(loadPending(), loadReport());
    setMarks([key], null);
  };

  /** GT-105: una llamada por pendiente, en orden; la primera que falla detiene el resto. */
  const completeAllDaily = async () => {
    const items: PendingItem[] = data.pending.items;
    if (items.length === 0) return;
    const keys = items.map((i) => completionKey(i.task_id, i.report_date));
    setMarks(keys, true);
    let done = 0;
    try {
      for (const item of items) {
        await api.post('/fn/daily-tasks-complete', { task_id: item.task_id, report_date: item.report_date, completed: true });
        done += 1;
      }
      notify(`${dailyTasksText(done)} marcada${done === 1 ? '' : 's'} como realizada${done === 1 ? '' : 's'}.`);
    } catch (e) {
      notify(`Marcadas ${done} de ${dailyTasksText(items.length)}. ${errorMessage(e)}`, 'error');
    }
    await reload(loadPending(), loadReport());
    setMarks(keys, null);
  };

  /** GT-114: guarda el tipo de un día y recarga solo el mes. */
  const saveDay = async (payload: { day: string; status: string; note: string | null }): Promise<boolean> => {
    setSaving(true);
    let ok = true;
    try {
      await api.post('/fn/calendar-day-status-update', payload);
    } catch (e) {
      ok = false;
      notify(errorMessage(e), 'error');
    }
    if (ok) {
      await reload(loadCalendar());
      notify('Día actualizado.');
    }
    setSaving(false);
    return ok;
  };

  /** GT-35 */
  const openCreate = () => {
    if (!configured) return;
    const ticket = nextTicket(data.parameters);
    setDetail(null);
    setForm({ task: { order_points: nextOrderPoints(data.order, data.tasks), ticket }, proposedTicket: ticket });
  };

  /** GT-38 */
  const openClone = (task: Task) => {
    const ticket = nextTicket(data.parameters);
    setDetail(null);
    setForm({ task: cloneOf(task, nextOrderPoints(data.order, data.tasks), ticket), proposedTicket: ticket });
  };

  const openEdit = (task: Task) => {
    setDetail(null);
    setForm({ task, proposedTicket: '' });
  };

  const openDetail = (id: string, readonly = false) => setDetail({ id, readonly });

  // GT-122 a GT-124: las subrutas de entrada desde «Tableros Jira». Esperan a la conexión y a las tareas.
  const handledEntry = useRef<string | null>(null);
  useEffect(() => {
    const entry = parseEntry(path);
    if (!entry) {
      handledEntry.current = null;
      return;
    }
    if (config === null || handledEntry.current === path) return;
    if (configured && (!loaded || loading)) return;
    handledEntry.current = path;
    if (configured) {
      const existing = taskWithTicket(data.tasks, entry.ticket);
      if (existing) {
        setForm(null);
        openDetail(existing.id);
      } else if (entry.kind === 'ticket') {
        notify(`Gestask no tiene ninguna tarea con el ticket ${entry.ticket}`, 'error');
      } else if (entry.ticket === '') {
        openCreate();
      } else {
        setDetail(null);
        setForm({
          task: {
            order_points: nextOrderPoints(data.order, data.tasks),
            ticket: entry.ticket,
            title: entry.title,
            ...(gestaskPriority(entry.priority) ? { priority: gestaskPriority(entry.priority) } : {}),
          },
          proposedTicket: '',
          entry: Date.now(),
        });
      }
    }
    navigate('', { replace: true });
    // Las acciones de abrir no son dependencias: se leen cuando la entrada está lista.
  }, [path, config, configured, loaded, loading, data.tasks, data.order]);

  useAppShortcut('Alt+N', () => {
    if (!configured || form || detail) return;
    if (section.path !== '') navigate('');
    openCreate();
  });
  useAppShortcut('Alt+R', () => {
    if (configured && !loading && !saving) void load(true);
  });

  const known = [...data.tasks, ...data.completion, ...data.order, ...(data.report?.tasks ?? [])];
  const detailTask = detail ? known.find((t) => t.id === detail.id) : undefined;
  const tasksSection = section.path !== '/connection';
  const pending = pendingSummary(data.pending);

  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <nav className={styles.tabs} aria-label="Secciones">
          {SECTIONS.map((s) => (
            <button key={s.path} type="button" aria-current={s === section ? 'page' : undefined} onClick={() => navigate(s.path)}>
              {s.label}
              {s.path === '/completion' && data.completion.length > 0 && (
                <span className={styles.badge} title="Tareas que esperan un paso de cierre">
                  {data.completion.length}
                </span>
              )}
              {s.path === '/routine' && pending.count > 0 && (
                <span className={styles.badge} data-level={pending.status} title={pendingText(pending)}>
                  {pending.count}
                </span>
              )}
            </button>
          ))}
        </nav>
        <span className={styles.spacer} />
        <span className={styles.muted} role="status">
          {saving ? 'Guardando…' : loading ? 'Cargando…' : ''}
        </span>
        {configured && (
          <button type="button" title="Alt+R" disabled={loading || saving} onClick={() => void load(true)}>
            Actualizar
          </button>
        )}
      </div>

      {configError && (
        <p className={styles.error} role="alert">
          {configError}
        </p>
      )}
      {!config && !configError && <p className={styles.muted}>Cargando…</p>}

      {config && section.path === '/connection' && (
        <Connection
          config={config}
          onSaved={(next) => {
            // GT-05: con otra conexión, lo cargado ya no vale.
            setConfig(next);
            setData(NO_DATA);
            setLoaded(false);
            setError(null);
            setConnection((n) => n + 1);
          }}
        />
      )}

      {config && tasksSection && !configured && (
        <div className={styles.panel}>
          <p>Falta configurar la conexión con Supabase.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => navigate('/connection')}>
              Ir a Conexión
            </button>
          </div>
        </div>
      )}

      {configured && tasksSection && error && (
        <div className={styles.errorBox} role="alert">
          <span>{error}</span>
          <button type="button" disabled={loading} onClick={() => void load(true)}>
            Reintentar
          </button>
        </div>
      )}

      {configured && loaded && section.path === '' && (
        <Backlog
          tasks={data.tasks}
          parameters={data.parameters}
          filters={filters}
          onFilters={setFilters}
          sort={sort}
          onSort={setSort}
          onCreate={openCreate}
          onOpen={(t) => openDetail(t.id)}
          onEdit={openEdit}
          onClone={openClone}
        />
      )}
      {configured && loaded && section.path === '/kanban' && (
        <Kanban
          tasks={data.tasks}
          parameters={data.parameters}
          saving={saving}
          onOpen={(t) => openDetail(t.id)}
          onMove={(t, status) => void updateTask({ id: t.id, task_status: status })}
        />
      )}
      {configured && loaded && section.path === '/order' && (
        <Order tasks={data.order} parameters={data.parameters} saving={saving} onSave={saveOrder} />
      )}
      {configured && loaded && section.path === '/completion' && (
        <Completion
          tasks={data.completion}
          parameters={data.parameters}
          saving={saving}
          onOpen={(t) => openDetail(t.id, true)}
          onResolve={resolve}
        />
      )}
      {configured && loaded && section.path === '/daily' && (
        <Daily
          report={data.report}
          date={day}
          onDate={chooseDay}
          sort={daySort}
          onSort={chooseDaySort}
          parameters={data.parameters}
          saving={saving}
          onCreateDay={createDay}
          onOpen={(t, readonly) => openDetail(t.id, readonly)}
          onUpdate={(payload) => void updateTask(payload)}
        />
      )}
      {configured && loaded && section.path === '/schedule' && (
        <Schedule
          report={data.report}
          date={day}
          onDate={chooseDay}
          parameters={data.parameters}
          includeExtra={includeExtra}
          onToggleExtra={() => setIncludeExtra((v) => !v)}
          completing={completing}
          onComplete={(taskId, reportDate, completed) => void completeDaily(taskId, reportDate, completed)}
          onOpen={(t) => openDetail(t.id)}
        />
      )}
      {configured && loaded && section.path === '/routine' && (
        <Routine
          tasks={data.routine}
          pending={data.pending}
          parameters={data.parameters}
          saving={saving}
          completing={completing}
          onComplete={(item, completed) => void completeDaily(item.task_id, item.report_date, completed)}
          onCompleteAll={() => void completeAllDaily()}
          onCreate={() => {
            setDetail(null);
            setForm({ task: { ticket_type: DAILY_TICKET_TYPE }, proposedTicket: '' });
          }}
          onEdit={openEdit}
          onFinish={(t) => void updateTask({ id: t.id, task_status: 'Done' })}
          onReactivate={(t) => void updateTask({ id: t.id, task_status: 'To do' })}
        />
      )}
      {configured && loaded && section.path === '/calendar' && (
        <Calendar
          calendar={data.calendar}
          year={period.year}
          month={period.month}
          onMonth={chooseMonth}
          parameters={data.parameters}
          saving={saving}
          onOpenTask={(id) => openDetail(id)}
          onSaveDay={saveDay}
        />
      )}

      {detail && detailTask && !form && (
        <TaskDetail
          task={detailTask}
          parameters={data.parameters}
          readonly={detail.readonly}
          saving={saving}
          onUpdate={updateTask}
          onEdit={() => openEdit(detailTask)}
          onClose={() => setDetail(null)}
        />
      )}
      {form &&
        (form.task.ticket_type === DAILY_TICKET_TYPE ? (
          <DailyTaskForm
            key={form.task.id ?? 'new'}
            task={form.task}
            saving={saving}
            onSave={(payload) => void saveTask(payload)}
            onDelete={(id) => void deleteTask(id)}
            onClose={() => setForm(null)}
          />
        ) : (
          <TaskForm
            // Otra tarea, otro formulario.
            key={`${form.task.id ?? 'new'}-${form.entry ?? 0}`}
            task={form.task}
            saving={saving}
            onSave={(payload) => void saveTask(payload)}
            onDelete={(id) => void deleteTask(id)}
            onClose={() => setForm(null)}
          />
        ))}
    </div>
  );
}
