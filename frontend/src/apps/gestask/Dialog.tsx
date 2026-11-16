import { useEffect, useRef, type ReactNode } from 'react';
import styles from './gestask.module.css';

interface DialogProps {
  title: string;
  /** Línea pequeña sobre el título: la sección y el ticket. */
  eyebrow?: string;
  wide?: boolean;
  /** Botones junto a «Cerrar». */
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** GT-27: diálogo de la mini app. Esc y «Cerrar» lo cierran sin hacer nada; el foco va a su primer campo. */
export function Dialog({ title, eyebrow, wide, actions, onClose, children }: DialogProps) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = dialog.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), select, textarea');
    (first ?? dialog.current)?.focus();
  }, []);
  return (
    <div className={styles.overlay}>
      <div
        ref={dialog}
        className={wide ? `${styles.dialog} ${styles.wide}` : styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header className={styles.dialogHeader}>
          <div>
            {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <div className={styles.actions}>
            {actions}
            <button type="button" aria-label="Cerrar" title="Cerrar (Esc)" onClick={onClose}>
              ×
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  /** Texto del botón que confirma. */
  action: string;
  danger?: boolean;
  onAnswer: (yes: boolean) => void;
  children: ReactNode;
}

/** U-05, GT-27: confirmación de una acción que no se puede deshacer o que afecta a varias tareas. */
export function Confirm({ title, action, danger, onAnswer, children }: ConfirmProps) {
  return (
    <Dialog title={title} onClose={() => onAnswer(false)}>
      <form
        className={styles.dialogBody}
        onSubmit={(e) => {
          e.preventDefault();
          onAnswer(true);
        }}
      >
        {children}
        <div className={styles.dialogActions}>
          <button type="button" onClick={() => onAnswer(false)}>
            Cancelar
          </button>
          <button type="submit" data-autofocus className={danger ? styles.danger : styles.primary}>
            {action}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
