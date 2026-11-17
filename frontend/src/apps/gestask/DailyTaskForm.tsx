import { useState } from 'react';
import { Confirm, Dialog } from './Dialog';
import styles from './gestask.module.css';
import { dailyDraftOf, dailyPayload, type DailyDraft } from './logic';
import type { Task } from './types';

interface Props {
  task: Partial<Task>;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** GT-101: crear o editar una tarea diaria, sin tipo, prioridad, puntos ni estado PR. */
export function DailyTaskForm({ task, saving, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<DailyDraft>(() => dailyDraftOf(task));
  const [deleting, setDeleting] = useState(false);
  const edit = draft.id !== '';

  const input = (key: keyof DailyDraft) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  if (deleting) {
    return (
      <Confirm
        title="Eliminar tarea diaria"
        action="Eliminar"
        danger
        onAnswer={(yes) => {
          if (yes) onDelete(draft.id);
          else setDeleting(false);
        }}
      >
        <p>
          ¿Seguro que quieres eliminar «{draft.title || 'Sin título'}»? También se borra su historial de partes diarios y no se
          puede deshacer.
        </p>
      </Confirm>
    );
  }

  return (
    <Dialog title={edit ? 'Editar tarea diaria' : 'Crear tarea diaria'} eyebrow="Tareas diarias" wide onClose={onClose}>
      <p className={styles.muted}>
        Se añade obligatoriamente a cada parte diario mientras no tenga fecha de finalización. No usa puntos de esfuerzo ni de
        orden.
      </p>
      <form
        className={styles.formGrid}
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) onSave(dailyPayload(draft));
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
          Fecha inicio
          <input type="date" required {...input('assigned_date')} />
        </label>
        {edit && (
          <label>
            Estado
            <select {...input('task_status')}>
              <option value="To do">Activa</option>
              <option value="Done">Finalizada</option>
            </select>
          </label>
        )}
        <label className={styles.span3}>
          Más info
          <textarea rows={3} {...input('more_info')} />
        </label>
        {edit && (
          <div className={`${styles.span3} ${styles.deleteZone}`}>
            <span className={styles.muted}>Eliminar la tarea diaria es permanente y borra su historial de partes diarios.</span>
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
