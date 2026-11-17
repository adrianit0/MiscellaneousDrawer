import { useState } from 'react';
import { Confirm } from './Dialog';
import styles from './gestask.module.css';
import { capitalize, completionKey, dailyTasksText, longDate, pendingSummary } from './logic';
import { DailyCheck, TaskSummary, Value } from './parts';
import type { Parameter, Pending, PendingItem, Task } from './types';

interface Props {
  /** GT-100: las tareas de tipo Diaria. */
  tasks: Task[];
  pending: Pending;
  parameters: Parameter[];
  saving: boolean;
  /** GT-104: las marcas que se están guardando, con su valor nuevo. */
  completing: ReadonlyMap<string, boolean>;
  onComplete: (item: PendingItem, completed: boolean) => void;
  onCompleteAll: () => void;
  onCreate: () => void;
  onEdit: (task: Task) => void;
  onFinish: (task: Task) => void;
  onReactivate: (task: Task) => void;
}

function RoutineTable({ tasks, parameters, finished, saving, onEdit, onAction }: {
  tasks: Task[];
  parameters: Parameter[];
  finished: boolean;
  saving: boolean;
  onEdit: (task: Task) => void;
  onAction: (task: Task) => void;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Tarea</th>
            <th>{finished ? 'Finalizada' : 'Desde'}</th>
            <th>
              <span className={styles.hidden}>Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <TaskSummary task={task} parameters={parameters} />
              </td>
              <td className={styles.nowrap}>
                <Value value={finished ? task.finished_date : task.assigned_date} />
              </td>
              <td className={styles.rowActions}>
                <button type="button" aria-label={`Editar ${task.title ?? ''}`} disabled={saving} onClick={() => onEdit(task)}>
                  Editar
                </button>
                <button
                  type="button"
                  aria-label={`${finished ? 'Reactivar' : 'Finalizar'} ${task.title ?? ''}`}
                  disabled={saving}
                  onClick={() => onAction(task)}
                >
                  {finished ? 'Reactivar' : 'Finalizar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** GT-100 a GT-105: las tareas diarias recurrentes y las que quedan por realizar. */
export function Routine({ tasks, pending, parameters, saving, completing, onComplete, onCompleteAll, onCreate, onEdit, onFinish, onReactivate }: Props) {
  const [finishing, setFinishing] = useState<Task | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const summary = pendingSummary(pending);
  const active = tasks.filter((t) => !t.finished_date);
  const finished = tasks.filter((t) => t.finished_date);
  const busy = completing.size > 0;

  return (
    <div className={styles.section}>
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <p className={styles.muted}>Tareas recurrentes que se añaden a cada parte diario hasta que se finalizan.</p>
          <span className={styles.spacer} />
          {summary.count > 0 && (
            <button type="button" disabled={busy} onClick={() => setConfirmAll(true)}>
              {busy ? 'Guardando…' : `Marcar todas como realizadas (${summary.count})`}
            </button>
          )}
          <button type="button" className={styles.primary} onClick={onCreate}>
            Nueva tarea diaria
          </button>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>
          Pendientes de realizar <span className={styles.badge}>{summary.count}</span>
        </h2>
        {summary.count === 0 ? (
          <p className={styles.muted}>Todas las tareas diarias están realizadas.</p>
        ) : (
          summary.groups.map((group) => (
            <section key={group.date} className={styles.pendingGroup} data-level={group.late ? 'error' : 'warning'}>
              <h3>
                {capitalize(longDate(group.date))}{' '}
                <span className={styles.badge} data-level={group.late ? 'error' : 'warning'}>
                  {group.late ? 'Atrasada' : 'Hoy'}
                </span>
              </h3>
              <ul className={styles.checklist}>
                {group.items.map((item) => {
                  const key = completionKey(item.task_id, item.report_date);
                  return (
                    <DailyCheck
                      key={key}
                      title={item.title}
                      ticket={item.ticket}
                      moreInfo={item.more_info}
                      parameters={parameters}
                      checked={completing.get(key) ?? false}
                      saving={completing.has(key)}
                      onChange={(checked) => onComplete(item, checked)}
                    />
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className={styles.panel}>
        <h2>
          Activas <span className={styles.badge}>{active.length}</span>
        </h2>
        {active.length === 0 ? (
          <p className={styles.muted}>No hay tareas diarias activas.</p>
        ) : (
          <RoutineTable tasks={active} parameters={parameters} finished={false} saving={saving} onEdit={onEdit} onAction={setFinishing} />
        )}
      </div>

      {finished.length > 0 && (
        <details className={styles.panel}>
          <summary>
            <h2 className={styles.inline}>
              Finalizadas <span className={styles.badge}>{finished.length}</span>
            </h2>
          </summary>
          <RoutineTable tasks={finished} parameters={parameters} finished saving={saving} onEdit={onEdit} onAction={onReactivate} />
        </details>
      )}

      {finishing && (
        <Confirm
          title="Finalizar tarea diaria"
          action="Finalizar"
          onAnswer={(yes) => {
            if (yes) onFinish(finishing);
            setFinishing(null);
          }}
        >
          <p>¿Finalizar «{finishing.title || 'Sin título'}»? Dejará de añadirse a los partes diarios nuevos.</p>
        </Confirm>
      )}
      {confirmAll && (
        <Confirm
          title="Marcar todas como realizadas"
          action="Marcar todas"
          onAnswer={(yes) => {
            setConfirmAll(false);
            if (yes) onCompleteAll();
          }}
        >
          <p>
            ¿Marcar como realizadas {dailyTasksText(summary.count)} pendientes?
            {summary.overdue.length > 0 && ` De ellas, ${summary.overdue.length} de días anteriores.`}
          </p>
        </Confirm>
      )}
    </div>
  );
}
