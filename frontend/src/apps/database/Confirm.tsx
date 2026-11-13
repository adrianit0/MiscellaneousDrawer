import { useEffect, useRef, type ReactNode } from 'react';
import styles from './database.module.css';

interface Props {
  title: string;
  /** Texto del botón que confirma. */
  action: string;
  /** Si es false, el botón que confirma está desactivado. */
  ready?: boolean;
  /** Un tercer botón, entre «Cancelar» y el que confirma (BD-67). */
  alternative?: { label: string; onSelect: () => void };
  onAnswer: (yes: boolean) => void;
  children: ReactNode;
}

/** U-05: diálog para confirmar una acción destructiva o pedir un dato. Esc y «Cancelar» lo cierran sin hacer nada. */
export function Confirm({ title, action, ready = true, alternative, onAnswer, children }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = dialog.current?.querySelector<HTMLElement>('input, button[data-primary]');
    first?.focus();
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
        <form
          className={styles.dialogBody}
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) onAnswer(true);
          }}
        >
          {children}
          <div className={styles.actions}>
            <button type="button" onClick={() => onAnswer(false)}>
              Cancelar
            </button>
            {alternative && (
              <button type="button" onClick={alternative.onSelect}>
                {alternative.label}
              </button>
            )}
            <button type="submit" data-primary className={styles.primary} disabled={!ready}>
              {action}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
