import { useUi } from './uiStore';

/** U-05: avisos no bloqueantes, abajo a la derecha. */
export function Notices() {
  const notices = useUi((s) => s.notices);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice notice-${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
          <span>{n.text}</span>
          <button type="button" className="icon-button" aria-label="Cerrar aviso" onClick={() => useUi.getState().dismiss(n.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
