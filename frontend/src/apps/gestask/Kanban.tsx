import { useState } from 'react';
import styles from './gestask.module.css';
import { KANBAN_STATUSES, kanbanColumn } from './logic';
import { activation, taskColors, TicketLink, TypeBadge } from './parts';
import type { Parameter, Task } from './types';

interface Props {
  tasks: Task[];
  parameters: Parameter[];
  saving: boolean;
  onOpen: (task: Task) => void;
  /** GT-52: cambia el estado de una tarea. */
  onMove: (task: Task, status: string) => void;
}

/** GT-50 a GT-52: una columna por estado; arrastrar una tarjeta a otra columna cambia su estado. */
export function Kanban({ tasks, parameters, saving, onOpen, onMove }: Props) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const columns = KANBAN_STATUSES.map((status) => ({ status, tasks: kanbanColumn(tasks, status) }));
  const total = columns.reduce((sum, c) => sum + c.tasks.length, 0);

  const drop = (status: string) => {
    const task = tasks.find((t) => t.id === dragged);
    setDragged(null);
    setTarget(null);
    if (task && task.task_status !== status && !saving) onMove(task, status);
  };

  return (
    <div className={styles.section}>
      <p className={styles.muted}>
        {total === 1 ? '1 tarea en curso' : `${total} tareas en curso`}, por estado y puntos de orden. Arrastra una tarjeta a otra
        columna para cambiar su estado.
      </p>
      <div className={styles.board}>
        {columns.map((column) => (
          <section
            key={column.status}
            className={styles.column}
            aria-label={column.status}
            data-status={column.status}
            data-target={target === column.status || undefined}
            onDragOver={(e) => {
              if (!dragged) return;
              e.preventDefault();
              setTarget(column.status);
            }}
            onDragLeave={() => setTarget((t) => (t === column.status ? null : t))}
            onDrop={(e) => {
              e.preventDefault();
              drop(column.status);
            }}
          >
            <header>
              <h2>
                <span className={styles.dot} aria-hidden="true" />
                {column.status}
              </h2>
              <span className={styles.badge}>{column.tasks.length}</span>
            </header>
            {column.tasks.length === 0 && <p className={styles.muted}>Sin tareas</p>}
            {column.tasks.map((task) => (
              <article
                key={task.id}
                className={`${styles.card} ${styles.task}`}
                {...taskColors(task)}
                {...activation(() => onOpen(task))}
                draggable={!saving}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', task.id);
                  setDragged(task.id);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setTarget(null);
                }}
              >
                <header>
                  <TicketLink ticket={task.ticket} parameters={parameters} />
                  <span className={styles.muted} title="Puntos de orden">
                    #{task.order_points ?? '-'}
                  </span>
                </header>
                <p className={styles.title}>{task.title || 'Sin título'}</p>
                <footer>
                  <TypeBadge type={task.ticket_type} />
                  <span>{task.priority}</span>
                  <span title="Puntos de esfuerzo">{task.effort_points ?? 0} PE</span>
                  {task.limit_date && <span title="Fecha límite">Límite {task.limit_date}</span>}
                  {task.task_status === 'Done' && <span title="Estado del PR">{task.pr_status || '-'}</span>}
                </footer>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
