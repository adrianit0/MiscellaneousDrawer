import { useCallback, useEffect, useRef, useState } from 'react';
import { useMiniApp } from '../../platform';
import styles from './processes.module.css';
import { closeNotice, errorMessage, portsLabel, type CloseResult, type Profile, type Scan } from './types';

interface Props {
  profile: Profile;
  onEdit: () => void;
  onDelete: () => void;
}

/** CP-31 a CP-33: el perfil elegido, su búsqueda y «Cerrar todo». */
export function ProfileView({ profile, onEdit, onDelete }: Props) {
  const { api, active, notify } = useMiniApp();
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  /** Solo cuenta la respuesta de la última búsqueda pedida. */
  const request = useRef(0);

  const load = useCallback(() => {
    const mine = ++request.current;
    setLoading(true);
    api
      .get<Scan>(`/profiles/${profile.id}/scan`)
      .then((result) => {
        if (mine !== request.current) return;
        setScan(result);
        setError(null);
      })
      .catch((e: unknown) => {
        if (mine !== request.current) return;
        setScan(null);
        setError(errorMessage(e));
      })
      .finally(() => {
        if (mine === request.current) setLoading(false);
      });
    // El perfil entero: al editarlo cambia lo que se busca.
  }, [api, profile]);

  // CP-32: al elegir el perfil y cuando la mini app vuelve a verse. No se repite sola.
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  /** CP-33: sin diálogo; la tabla es la confirmación. */
  const closeAll = async () => {
    if (!scan || scan.processes.length === 0) return;
    setClosing(true);
    try {
      const result = await api.post<CloseResult>(`/profiles/${profile.id}/close`, { pids: scan.processes.map((p) => p.pid) });
      const notice = closeNotice(result);
      notify(notice.text, notice.kind);
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setClosing(false);
      load();
    }
  };

  const ports = portsLabel(profile);
  const count = scan?.processes.length ?? 0;

  return (
    <section className={styles.view} aria-label={profile.name}>
      <header className={styles.header}>
        <div>
          <h2>{profile.name}</h2>
          <dl className={styles.summary}>
            {profile.processPattern !== null && (
              <div>
                <dt>Patrón</dt>
                <dd className={styles.mono}>{profile.processPattern}</dd>
              </div>
            )}
            {ports !== null && (
              <div>
                <dt>Puertos</dt>
                <dd>{ports}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={onEdit}>
            Editar
          </button>
          <button type="button" onClick={onDelete}>
            Eliminar
          </button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <button type="button" onClick={load} disabled={loading || closing}>
          Actualizar
        </button>
        <span className={styles.muted} role="status">
          {loading ? 'Buscando…' : scan ? (count === 1 ? '1 proceso' : `${count} procesos`) : ''}
        </span>
        <span className={styles.spacer} />
        <button type="button" className={styles.danger} onClick={() => void closeAll()} disabled={count === 0 || closing || loading}>
          Cerrar todo
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {scan?.warning && <p className={styles.notice}>{scan.warning}</p>}
      {scan && scan.blockedPorts.length > 0 && (
        <p className={styles.notice}>Ocupados por procesos de otro usuario, que no se pueden cerrar: {scan.blockedPorts.join(', ')}</p>
      )}
      {scan && count === 0 && <p className={styles.muted}>No hay nada que cerrar</p>}
      {scan && count > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Procesos">
            <thead>
              <tr>
                <th>PID</th>
                <th>Puertos</th>
                <th>Comando</th>
              </tr>
            </thead>
            <tbody>
              {scan.processes.map((p) => (
                <tr key={p.pid}>
                  <td>{p.pid}</td>
                  <td>{p.ports.length > 0 ? p.ports.join(', ') : '—'}</td>
                  <td className={styles.command}>{p.command !== '' ? p.command : '(sin línea de comandos)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
