import type { KeyboardEvent, MouseEvent } from 'react';
import { commentsOf, ticketUrl } from './logic';
import styles from './gestask.module.css';
import type { Parameter, Task } from './types';

/** GT-26: el ticket, como enlace al sistema externo si hay página configurada. */
export function TicketLink({ ticket, parameters }: { ticket: string | null | undefined; parameters: Parameter[] }) {
  const value = String(ticket ?? '').trim();
  if (!value) return null;
  const url = ticketUrl(parameters, value);
  if (!url) return <span className={styles.ticket}>{value}</span>;
  return (
    <a className={styles.ticket} href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {value}
    </a>
  );
}

/** GT-25: el tipo como etiqueta de color. */
export function TypeBadge({ type }: { type: string | null | undefined }) {
  const value = type || 'Bug';
  return (
    <span className={styles.type} data-type={value}>
      {value}
    </span>
  );
}

/** «—» para un valor vacío (GT-30). */
export function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return (
      <span className={styles.muted} aria-label="Sin valor">
        —
      </span>
    );
  }
  return <>{String(value)}</>;
}

/** GT-30: ticket, comentarios, título y más info: lo que identifica a una tarea en una lista. */
export function TaskSummary({ task, parameters, info = true }: { task: Task; parameters: Parameter[]; info?: boolean }) {
  const comments = commentsOf(task).length;
  return (
    <div className={styles.summary}>
      {(task.ticket || comments > 0) && (
        <div className={styles.summaryMeta}>
          <TicketLink ticket={task.ticket} parameters={parameters} />
          {comments > 0 && (
            <span className={styles.badge} title={comments === 1 ? '1 comentario' : `${comments} comentarios`}>
              💬 {comments}
            </span>
          )}
        </div>
      )}
      <p className={styles.title}>{task.title || 'Sin título'}</p>
      {info && task.more_info && <p className={styles.info}>{task.more_info}</p>}
    </div>
  );
}

/** GT-25: los atributos de los que salen el fondo y el borde de una tarea. */
export function taskColors(task: Task): Record<string, string | undefined> {
  return {
    'data-status': task.task_status ?? undefined,
    'data-priority': task.task_status === 'To do' ? (task.priority ?? undefined) : undefined,
    'data-pr': task.task_status === 'Done' ? (task.pr_status ?? undefined) : undefined,
  };
}

/** Abrir con clic, o con Enter o Espacio con el foco en la fila (GT-30). */
export function activation(open: () => void) {
  return {
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a, button, input, select, textarea, label')) return;
      open();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      open();
    },
  };
}
