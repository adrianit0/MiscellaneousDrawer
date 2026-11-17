import styles from './gestask.module.css';
import { longDate } from './logic';
import { activation, TaskSummary, taskColors, TypeBadge, Value } from './parts';
import { DayPicker } from './Pickers';
import { PR_STATUSES, SORT_OPTIONS, TASK_PR_STATUSES, TASK_STATUSES, type Parameter, type Report, type Sort, type Task } from './types';

interface Props {
  /** El último parte recibido; si es de otro día, el del día elegido todavía no ha llegado. */
  report: Report | null;
  date: string;
  onDate: (date: string) => void;
  sort: Sort;
  onSort: (sort: Sort) => void;
  parameters: Parameter[];
  saving: boolean;
  onCreateDay: () => void;
  onOpen: (task: Task, readonly: boolean) => void;
  onUpdate: (payload: Record<string, unknown>) => void;
}

/** GT-80 a GT-84: el parte del día elegido. */
export function Daily({ report, date, onDate, sort, onSort, parameters, saving, onCreateDay, onOpen, onUpdate }: Props) {
  const ready = report !== null && report.date === date;
  const editable = ready && report.editable;

  return (
    <div className={styles.section}>
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <DayPicker date={date} onChange={onDate} />
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
          <button type="button" className={styles.primary} disabled={saving} onClick={onCreateDay}>
            Nuevo día
          </button>
        </div>
      </div>

      {ready && report.exists && !report.editable && (
        <p className={styles.warningBox} role="note">
          Modo histórico: el parte de un día anterior es de solo lectura.
        </p>
      )}

      <div className={styles.panel}>
        {!ready ? (
          <p className={styles.muted}>Cargando el parte…</p>
        ) : !report.exists ? (
          <p className={styles.muted}>No existe parte diario para esta fecha.</p>
        ) : (
          <>
            <h2>
              Parte del {longDate(date)} <span className={styles.badge}>{report.tasks.length}</span>
            </h2>
            {report.tasks.length === 0 ? (
              <p className={styles.muted}>No hay tareas en el parte.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tarea</th>
                      <th>Tipo</th>
                      <th>Asignación</th>
                      <th>Límite</th>
                      <th className={styles.number}>Scoring</th>
                      <th className={styles.number}>Orden</th>
                      <th>Estado</th>
                      <th>PR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.tasks.map((task) => (
                      <tr key={task.id} className={styles.task} {...taskColors(task)} {...activation(() => onOpen(task, !editable))}>
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
                        <td className={styles.number}>
                          <Value value={task.scoring} />
                        </td>
                        <td className={styles.number}>
                          <Value value={task.order_points} />
                        </td>
                        <td>
                          {editable ? (
                            <select
                              aria-label={`Estado de ${task.title ?? ''}`}
                              value={task.task_status ?? ''}
                              disabled={saving}
                              onChange={(e) => onUpdate({ id: task.id, task_status: e.target.value })}
                            >
                              {TASK_STATUSES.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          ) : (
                            <Value value={task.task_status} />
                          )}
                        </td>
                        <td>
                          {editable ? (
                            <select
                              aria-label={`Estado del PR de ${task.title ?? ''}`}
                              value={task.pr_status ?? ''}
                              // GT-41: el estado PR solo se cambia con la tarea en Done.
                              disabled={saving || task.task_status !== 'Done'}
                              onChange={(e) => onUpdate({ id: task.id, pr_status: e.target.value })}
                            >
                              {(task.ticket_type === 'Task' ? TASK_PR_STATUSES : PR_STATUSES).map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          ) : (
                            <Value value={task.pr_status} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
