import { useEffect, useRef, type ReactNode } from 'react';
import styles from './jira.module.css';

interface Props {
  title: string;
  /** Texto del botón que confirma. */
  action: string;
  /** Texto del botón que no hace nada. */
  cancel?: string;
  onAnswer: (yes: boolean) => void;
  children: ReactNode;
}

/** U-05: diálogo para confirmar una acción destructiva. Esc y el botón de cancelar lo cierran sin hacer nada. */
export function Confirm({ title, action, cancel = 'Cancelar', onAnswer, children }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('button[data-primary]')?.focus();
  }, []);
  return (
    <div className={styles.overlay}>
      <div
        ref={dialog}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onAnswer(false);
          }
        }}
      >
        <h2>{title}</h2>
        <div className={styles.dialogBody}>{children}</div>
        <div className={styles.actions}>
          <button type="button" onClick={() => onAnswer(false)}>
            {cancel}
          </button>
          <button type="button" data-primary className={styles.danger} onClick={() => onAnswer(true)}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}
