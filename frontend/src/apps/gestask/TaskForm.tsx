import { useState } from 'react';
import { Confirm, Dialog } from './Dialog';
import styles from './gestask.module.css';
import { draftOf, taskPayload, todayIso, type TaskDraft } from './logic';
import { PRIORITIES, PR_STATUSES, TASK_PR_STATUSES, TASK_STATUSES, TICKET_TYPES, type Task } from './types';

interface Props {
  /** La tarea que se edita, o los valores con los que nace una nueva (GT-35, GT-38). */
  task: Partial<Task>;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** GT-36, GT-39: crear o editar una tarea. Envía los mismos campos que el formulario de la web. */
export function TaskForm({ task, saving, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<TaskDraft>(() => draftOf(task));
  const [deleting, setDeleting] = useState(false);
  const edit = draft.id !== '';
  // GT-36: como en la web, el estado PR solo se cambia si la tarea guardada ya está en Done.
  const prEditable = edit && task.task_status === 'Done';
  const done = edit && draft.task_status === 'Done';
  const prStatuses: readonly string[] = draft.ticket_type === 'Task' ? TASK_PR_STATUSES : PR_STATUSES;

  const set = (key: keyof TaskDraft, value: string) =>
    setDraft((d) => {
      const next = { ...d, [key]: value };
      // GT-36: al pasar a Done se propone hoy como fecha de finalización.
      if (key === 'task_status' && value === 'Done' && !next.finished_date) next.finished_date = todayIso();
      if (key === 'ticket_type' && value === 'Task' && !(TASK_PR_STATUSES as readonly string[]).includes(next.pr_status)) {
        next.pr_status = TASK_PR_STATUSES[0];
      }
      return next;
    });

  const input = (key: keyof TaskDraft) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  });

  if (deleting) {
    return (
      <Confirm
        title="Eliminar tarea"
        action="Eliminar"
        danger
        onAnswer={(yes) => {
          if (yes) onDelete(draft.id);
          else setDeleting(false);
        }}
      >
        <p>
          ¿Seguro que quieres eliminar «{draft.title || 'Sin título'}»? Esta acción no se puede deshacer.
        </p>
      </Confirm>
    );
  }

  return (
    <Dialog title={edit ? 'Editar tarea' : 'Crear tarea'} eyebrow="Tareas" wide onClose={onClose}>
      <form
        className={styles.formGrid}
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) onSave(taskPayload(draft, prEditable));
        }}
      >
        <label className={styles.span3}>
          Título
          <input required data-autofocus {...input('title')} />
        </label>
        <label>
          Ticket
          <input {...input('ticket')} />
        </label>
        <label>
          Tipo
          <select {...input('ticket_type')}>
            {TICKET_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Prioridad
          <select {...input('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Fecha asignación
          <input type="date" required {...input('assigned_date')} />
        </label>
        <label>
          Fecha límite
          <input type="date" {...input('limit_date')} />
        </label>
        <label>
          Fecha finalización
          <input type="date" disabled={!done} {...input('finished_date')} />
        </label>
        <label>
          Puntos de esfuerzo
          <input type="number" min={0} {...input('effort_points')} />
        </label>
        <label>
          Puntos de orden
          <input type="number" {...input('order_points')} />
        </label>
        {edit && (
          <label>
            Estado tarea
            <select {...input('task_status')}>
              {TASK_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {edit && (
          <label>
            Estado PR
            <select disabled={!prEditable} {...input('pr_status')}>
              {prStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <label className={styles.span3}>
          Más info
          <textarea rows={4} {...input('more_info')} />
        </label>
        {edit && (
          <div className={`${styles.span3} ${styles.deleteZone}`}>
            <span className={styles.muted}>Eliminar la tarea es permanente: no se puede deshacer.</span>
            <button type="button" className={styles.danger} onClick={() => setDeleting(true)}>
              Eliminar tarea
            </button>
          </div>
        )}
        <div className={`${styles.span3} ${styles.dialogActions}`}>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={styles.primary} disabled={saving}>
            Guardar
          </button>
        </div>
      </form>
    </Dialog>
  );
}
