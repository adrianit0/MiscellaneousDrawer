import { useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import styles from './gestask.module.css';
import { commentsOf } from './logic';
import { TicketLink, TypeBadge, Value } from './parts';
import { PR_STATUSES, TASK_PR_STATUSES, TASK_STATUSES, type Parameter, type Task } from './types';

interface Props {
  task: Task;
  parameters: Parameter[];
  /** GT-43: desde «Completar» solo se pueden añadir comentarios. */
  readonly: boolean;
  saving: boolean;
  /** GT-41, GT-42: un cambio con tasks-update. Devuelve si se guardó. */
  onUpdate: (payload: Record<string, unknown>) => Promise<boolean>;
  onEdit: () => void;
  onClose: () => void;
}

function Item({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? `${styles.detailItem} ${styles.span3}` : styles.detailItem}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** Un enlace solo si es http o https; si no, el texto tal cual. */
function External({ value, label }: { value: string; label: string }) {
  if (!/^https?:\/\//i.test(value.trim())) return <>{value}</>;
  return (
    <a href={value.trim()} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function commentDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** GT-40 a GT-43: el detalle de una tarea, con su estado, su estado PR y sus comentarios. */
export function TaskDetail({ task, parameters, readonly, saving, onUpdate, onEdit, onClose }: Props) {
  const [comment, setComment] = useState('');
  const locked = readonly || saving;
  const prStatuses: readonly string[] = task.ticket_type === 'Task' ? TASK_PR_STATUSES : PR_STATUSES;
  const comments = commentsOf(task).slice().reverse();

  return (
    <Dialog
      title={task.title || 'Sin título'}
      eyebrow={task.ticket ? `Detalle de tarea · ${task.ticket}` : 'Detalle de tarea'}
      wide
      onClose={onClose}
      actions={
        !readonly && (
          <button type="button" className={styles.primary} onClick={onEdit}>
            Editar
          </button>
        )
      }
    >
      <div className={styles.detailGrid}>
        <Item label="Ticket">{task.ticket ? <TicketLink ticket={task.ticket} parameters={parameters} /> : <Value value={null} />}</Item>
        <Item label="Tipo">
          <TypeBadge type={task.ticket_type} />
        </Item>
        <Item label="Prioridad">
          <Value value={task.priority} />
        </Item>
        <Item label="Estado">
          <select
            aria-label="Estado de la tarea"
            value={task.task_status ?? ''}
            disabled={locked}
            onChange={(e) => void onUpdate({ id: task.id, task_status: e.target.value })}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Item>
        <Item label="PR">
          <select
            aria-label="Estado del PR"
            value={task.pr_status ?? ''}
            disabled={locked || task.task_status !== 'Done'}
            onChange={(e) => void onUpdate({ id: task.id, pr_status: e.target.value })}
          >
            {prStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Item>
        <Item label="Scoring">
          <Value value={task.scoring} />
        </Item>
        <Item label="Fecha asignación">
          <Value value={task.assigned_date} />
        </Item>
        <Item label="Fecha límite">
          <Value value={task.limit_date} />
        </Item>
        <Item label="Fecha finalización">
          <Value value={task.finished_date} />
        </Item>
        <Item label="Esfuerzo">
          <Value value={task.effort_points} />
        </Item>
        <Item label="Orden">
          <Value value={task.order_points} />
        </Item>
        {task.imputed_date && <Item label="Fecha imputación">{task.imputed_date}</Item>}
        {task.pr_link && (
          <Item label="Link PR">
            <External value={task.pr_link} label="Abrir PR" />
          </Item>
        )}
        {task.test_cases && (
          <Item label="Test cases">
            <External value={task.test_cases} label="Abrir test cases" />
          </Item>
        )}
        <Item label="Más info" wide>
          <span className={styles.pre}>
            <Value value={task.more_info} />
          </span>
        </Item>
      </div>
      <section className={styles.comments} aria-label="Comentarios">
        <h3>
          Comentarios <span className={styles.badge}>{comments.length}</span>
        </h3>
        <form
          className={styles.commentForm}
          onSubmit={(e) => {
            e.preventDefault();
            const text = comment.trim();
            // GT-42: uno vacío no se envía, y si falla se conserva lo escrito.
            if (!text || saving) return;
            void onUpdate({ id: task.id, comment: text }).then((ok) => {
              if (ok) setComment('');
            });
          }}
        >
          <label>
            Nuevo comentario
            <textarea rows={2} value={comment} placeholder="Añade un comentario a la tarea" onChange={(e) => setComment(e.target.value)} />
          </label>
          <button type="submit" disabled={saving || comment.trim() === ''}>
            Añadir comentario
          </button>
        </form>
        {comments.length === 0 && <p className={styles.muted}>Sin comentarios todavía.</p>}
        <ul className={styles.commentList}>
          {comments.map((c, i) => (
            <li key={i}>
              <p className={styles.pre}>{c.text ?? ''}</p>
              {c.created_at && <time className={styles.muted}>{commentDate(c.created_at)}</time>}
            </li>
          ))}
        </ul>
      </section>
    </Dialog>
  );
}
