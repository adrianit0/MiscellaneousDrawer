import { useState } from 'react';
import styles from './gestask.module.css';
import { moveUpdates, normalizeUpdates } from './logic';
import { TicketLink, TypeBadge, Value } from './parts';
import type { OrderUpdate, Parameter, Task } from './types';

interface Props {
  tasks: Task[];
  parameters: Parameter[];
  saving: boolean;
  /** GT-63: guarda los cambios con una sola llamada. */
  onSave: (updates: OrderUpdate[]) => void;
}

/** GT-60 a GT-63: el orden manual de las tareas pendientes, con flechas o arrastrando. */
export function Order({ tasks, parameters, saving, onSave }: Props) {
  const [dragged, setDragged] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const move = (from: number, to: number) => onSave(moveUpdates(tasks, from, to));

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <p className={styles.muted}>
          Solo aparecen las tareas pendientes con puntos de orden. Arrastra una fila para moverla varias posiciones o usa las
          flechas.
        </p>
        <span className={styles.spacer} />
        <button type="button" disabled={saving || tasks.length === 0} onClick={() => onSave(normalizeUpdates(tasks))}>
          Ordenar automáticamente
        </button>
      </div>
      <div className={styles.panel}>
        {tasks.length === 0 ? (
          <p className={styles.muted}>No hay tareas ordenables.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Posición</th>
                  <th>Tarea</th>
                  <th>Tipo</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Asignación</th>
                  <th>Límite</th>
                  <th className={styles.number}>Orden</th>
                  <th>
                    <span className={styles.hidden}>Mover</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, index) => (
                  <tr
                    key={task.id}
                    className={styles.orderRow}
                    draggable={!saving}
                    data-dragging={dragged === index || undefined}
                    data-target={(target === index && dragged !== index) || undefined}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(index));
                      setDragged(index);
                    }}
                    onDragOver={(e) => {
                      if (dragged === null) return;
                      e.preventDefault();
                      setTarget(index);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragged;
                      setDragged(null);
                      setTarget(null);
                      if (from !== null && !saving) move(from, index);
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setTarget(null);
                    }}
                  >
                    <td>
                      <span className={styles.grip} aria-hidden="true">
                        ⠿
                      </span>
                      {index + 1}
                    </td>
                    <td>
                      <TicketLink ticket={task.ticket} parameters={parameters} /> <span className={styles.title}>{task.title}</span>
                    </td>
                    <td>
                      <TypeBadge type={task.ticket_type} />
                    </td>
                    <td>{task.priority}</td>
                    <td>{task.task_status}</td>
                    <td className={styles.nowrap}>
                      <Value value={task.assigned_date} />
                    </td>
                    <td className={styles.nowrap}>
                      <Value value={task.limit_date} />
                    </td>
                    <td className={styles.number}>{task.order_points}</td>
                    <td className={styles.rowActions}>
                      <button
                        type="button"
                        aria-label={`Mover arriba ${task.title ?? ''}`}
                        title="Mover arriba"
                        disabled={saving || index === 0}
                        onClick={() => move(index, index - 1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Mover abajo ${task.title ?? ''}`}
                        title="Mover abajo"
                        disabled={saving || index === tasks.length - 1}
                        onClick={() => move(index, index + 1)}
                      >
                        ↓
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
