import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppShortcut, useAppState, useMiniApp } from '../../platform';
import { Backlog } from './Backlog';
import { Completion } from './Completion';
import { Connection } from './Connection';
import styles from './gestask.module.css';
import { Kanban } from './Kanban';
import { cloneOf, nextOrderPoints, nextTicket, nextTicketOrderValue, TICKET_ORDER } from './logic';
import { Order } from './Order';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';
import {
  DEFAULT_SORT,
  errorMessage,
  NO_DATA,
  NO_FILTERS,
  type ConfigView,
  type Data,
  type Filters,
  type OrderUpdate,
  type Parameter,
  type Sort,
  type Task,
} from './types';

/** GT-20: las secciones y su subruta. */
const SECTIONS = [
  { path: '', label: 'Backlog' },
  { path: '/kanban', label: 'Kanban' },
  { path: '/order', label: 'Ordenar' },
  { path: '/completion', label: 'Completar' },
  { path: '/connection', label: 'Conexión' },
] as const;

/** GT-23: tiempo oculta a partir del cual se recarga al volver. */
export const STALE_MS = 5 * 60 * 1000;

type Payload = Record<string, unknown>;

/** El formulario abierto: la tarea o los valores iniciales, y el ticket propuesto al crear (GT-37). */
interface FormState {
  task: Partial<Task>;
  proposedTicket: string;
}

/** «Gestask» (GT-20 a GT-79): backlog, tablero, orden y cierre de tareas sobre el Supabase de su versión web. */
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

  // --- Carga (GT-22 a GT-24) ---

  const sortRef = useRef(sort);
  sortRef.current = sort;
  /** Solo vale la última respuesta de tasks-list: una ordenación anterior que llega tarde se descarta. */
  const listSeq = useRef(0);

  /** GT-33: la ordenación la hace Supabase. */
  const loadList = useCallback(async () => {
    const mine = ++listSeq.current;
    const query = new URLSearchParams({ sort_by: sortRef.current.by, sort_direction: sortRef.current.dir });
    const result = await api.get<{ tasks?: Task[] }>(`/fn/tasks-list?${query.toString()}`);
    if (mine === listSeq.current) setData((d) => ({ ...d, tasks: result.tasks ?? [] }));
  }, [api]);

  /** GT-22, GT-24: las tres listas de tareas y, si se piden, los parámetros. Lo que falla no descarta lo demás. */
  const load = useCallback(
    async (withParameters: boolean) => {
      setLoading(true);
      const results = await Promise.allSettled([
        loadList(),
        api.get<{ tasks?: Task[] }>('/fn/tasks-completion-list').then((r) => setData((d) => ({ ...d, completion: r.tasks ?? [] }))),
        api.get<{ tasks?: Task[] }>('/fn/tasks-order-list').then((r) => setData((d) => ({ ...d, order: r.tasks ?? [] }))),
        withParameters
          ? api
              .get<{ configurations?: Parameter[] }>('/fn/configuration-list')
              .then((r) => setData((d) => ({ ...d, parameters: r.configurations ?? [] })))
          : Promise.resolve(),
      ]);
      const errors = new Set<string>();
      for (const r of results) if (r.status === 'rejected') errors.add(errorMessage(r.reason));
      setError(errors.size ? [...errors].join(' ') : null);
      setLoaded(true);
      setLoading(false);
    },
    [api, loadList],
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
    loadList().catch((e: unknown) => setError(errorMessage(e)));
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

  // --- Acciones (GT-24) ---

  /** Ejecuta un cambio, recarga las listas de tareas y dice el resultado. Devuelve si el cambio salió bien. */
  const run = useCallback(
    async (action: () => Promise<void>, done: string): Promise<boolean> => {
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
      if (ok) notify(done);
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
    const ok = await run(
      async () => {
        await api.post(create ? '/fn/tasks-create' : '/fn/tasks-update', payload);
        if (create && proposed && payload.ticket === proposed) await advanceTicketOrder();
      },
      create ? 'Tarea creada.' : 'Tarea guardada.',
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

  useAppShortcut('Alt+N', () => {
    if (!configured || form || detail) return;
    if (section.path !== '') navigate('');
    openCreate();
  });
  useAppShortcut('Alt+R', () => {
    if (configured && !loading && !saving) void load(true);
  });

  const known = [...data.tasks, ...data.completion, ...data.order];
  const detailTask = detail ? known.find((t) => t.id === detail.id) : undefined;
  const tasksSection = section.path !== '/connection';

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
          onOpen={(t) => setDetail({ id: t.id, readonly: false })}
          onEdit={openEdit}
          onClone={openClone}
        />
      )}
      {configured && loaded && section.path === '/kanban' && (
        <Kanban
          tasks={data.tasks}
          parameters={data.parameters}
          saving={saving}
          onOpen={(t) => setDetail({ id: t.id, readonly: false })}
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
          onOpen={(t) => setDetail({ id: t.id, readonly: true })}
          onResolve={resolve}
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
      {form && (
        <TaskForm
          // Otra tarea, otro formulario.
          key={form.task.id ?? 'new'}
          task={form.task}
          saving={saving}
          onSave={(payload) => void saveTask(payload)}
          onDelete={(id) => void deleteTask(id)}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
