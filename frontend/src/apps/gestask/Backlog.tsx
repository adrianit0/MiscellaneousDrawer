import { useMemo } from 'react';
import styles from './gestask.module.css';
import { activeFilterCount, filterTasks } from './logic';
import { activation, TaskSummary, taskColors, TypeBadge, Value } from './parts';
import { NO_FILTERS, PRIORITIES, SORT_OPTIONS, STATUS_DESCRIPTIONS, TASK_STATUSES, type Filters, type Parameter, type Sort, type Task } from './types';

interface Props {
  tasks: Task[];
  parameters: Parameter[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  sort: Sort;
  onSort: (sort: Sort) => void;
  onCreate: () => void;
  onOpen: (task: Task) => void;
  onEdit: (task: Task) => void;
  onClone: (task: Task) => void;
}

/** GT-30 a GT-34: todas las tareas, con filtros que no piden datos y la ordenación de Supabase. */
export function Backlog({ tasks, parameters, filters, onFilters, sort, onSort, onCreate, onOpen, onEdit, onClone }: Props) {
  const visible = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const active = activeFilterCount(filters);
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });
  const toggleStatus = (status: string) =>
    set({ statuses: filters.statuses.includes(status) ? filters.statuses.filter((s) => s !== status) : [...filters.statuses, status] });

  return (
    <div className={styles.section}>
      <div className={styles.panel} role="search" aria-label="Filtros">
        <div className={styles.toolbar}>
          <input
            type="search"
            className={styles.search}
            aria-label="Texto a buscar"
            placeholder="Buscar por título, ticket o info"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
          />
          <label className={styles.inline}>
            Prioridad
            <select value={filters.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">Todas</option>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className={styles.inline} title="Fecha de asignación o de finalización">
            Fecha
            <input type="date" value={filters.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label className={styles.inline}>
            Ordenar por
            <select value={sort.by} onChange={(e) => onSort({ ...sort, by: e.target.value })}>
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.inline}>
            Dirección
            <select value={sort.dir} onChange={(e) => onSort({ ...sort, dir: e.target.value === 'asc' ? 'asc' : 'desc' })}>
              <option value="desc">Descendente</option>
              <option value="asc">Ascendente</option>
            </select>
          </label>
          <span className={styles.spacer} />
          <button type="button" className={styles.primary} title="Alt+N" onClick={onCreate}>
            Crear tarea
          </button>
        </div>
        <div className={styles.toolbar}>
          <fieldset className={styles.chips}>
            <legend>Estados</legend>
            {TASK_STATUSES.map((status) => (
              <label key={status} className={styles.chip} title={STATUS_DESCRIPTIONS[status]} data-status={status}>
                <input type="checkbox" checked={filters.statuses.includes(status)} onChange={() => toggleStatus(status)} />
                <span className={styles.dot} aria-hidden="true" />
                {status}
              </label>
            ))}
          </fieldset>
          <span className={styles.spacer} />
          <label className={styles.inline}>
            <input type="checkbox" checked={filters.history} onChange={(e) => set({ history: e.target.checked })} />
            Histórico completo
          </label>
          <button type="button" className={styles.link} disabled={active === 0} onClick={() => onFilters(NO_FILTERS)}>
            Limpiar filtros{active ? ` (${active})` : ''}
          </button>
        </div>
      </div>
      <div className={styles.panel}>
        <h2>
          Tareas <span className={styles.badge}>{visible.length}</span>
        </h2>
        {visible.length === 0 ? (
          <p className={styles.muted}>No hay tareas para mostrar.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Tipo</th>
                  <th>Asignación</th>
                  <th>Límite</th>
                  <th>Finalización</th>
                  <th className={styles.number}>Scoring</th>
                  <th className={styles.number}>Orden</th>
                  <th>
                    <span className={styles.hidden}>Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => (
                  <tr key={task.id} className={styles.task} {...taskColors(task)} {...activation(() => onOpen(task))}>
                    <td>
                      <TaskSummary task={task} parameters={parameters} />
                    </td>
                    <td>
                      <TypeBadge type={task.ticket_type} />
                    </td>
                    <td className={styles.nowrap}>
                      <Value value={task.assigned_date} />
                    </td>
                    <td className={styles.nowrap}>
                      <Value value={task.limit_date} />
                    </td>
                    <td className={styles.nowrap}>
                      <Value value={task.finished_date} />
                    </td>
                    <td className={styles.number}>
                      <Value value={task.scoring} />
                    </td>
                    <td className={styles.number}>
                      <Value value={task.order_points} />
                    </td>
                    <td className={styles.rowActions}>
                      <button type="button" aria-label={`Editar ${task.title ?? ''}`} onClick={() => onEdit(task)}>
                        Editar
                      </button>
                      <button type="button" aria-label={`Clonar ${task.title ?? ''}`} onClick={() => onClone(task)}>
                        Clonar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
