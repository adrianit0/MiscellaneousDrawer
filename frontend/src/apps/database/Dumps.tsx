import { useCallback, useEffect, useState } from 'react';
import { useMiniApp } from '../../platform';
import { Confirm } from './Confirm';
import styles from './database.module.css';
import type { ImportChoice } from './DatabaseApp';
import { BRANCH_LABELS, errorMessage, formatBytes, formatDateTime, LABELS, type Branch, type BranchDumps, type ConfigView, type Dump } from './types';

const KINDS: Record<Dump['kind'], string> = { current: 'Actual', previous: 'Anterior', kept: 'Conservada' };

interface Props {
  config: ConfigView;
  onImport: (choice: ImportChoice) => void;
}

interface Pending {
  branch: Branch;
  dump: Dump;
}

/** BD-64: la biblioteca de copias: el volcado actual, la copia anterior y las conservadas de cada rama. */
export function Dumps({ config, onImport }: Props) {
  const { api, navigate, notify } = useMiniApp();
  const [branches, setBranches] = useState<BranchDumps[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keeping, setKeeping] = useState<Pending | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<Pending | null>(null);
  const configured = config.missing.dumps.length === 0;

  const load = useCallback(() => {
    if (!configured) return;
    api
      .get<{ branches: BranchDumps[] }>('/dumps')
      .then((r) => setBranches(r.branches))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [api, configured]);

  useEffect(load, [load]);

  const act = async (work: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await work();
      notify(done);
    } catch (e) {
      setError(errorMessage(e));
    }
    load();
  };

  if (!configured) {
    return (
      <p className={styles.notice}>
        Falta configurar: {config.missing.dumps.map((k) => LABELS[k] ?? k).join(', ')}.{' '}
        <button type="button" className={styles.link} onClick={() => navigate('/settings')}>
          Ir a Configuración
        </button>
      </p>
    );
  }

  return (
    <div className={styles.dumps}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!branches && !error && <p className={styles.muted}>Cargando…</p>}
      {branches?.map((b) => {
        const rows = [b.current, b.previous, ...b.kept].filter((d): d is Dump => d !== null);
        return (
          <section key={b.branch} aria-label={BRANCH_LABELS[b.branch]}>
            <h2>{BRANCH_LABELS[b.branch]}</h2>
            {b.partial && (
              <p className={styles.muted}>
                Hay una descarga a medias: {formatBytes(b.partial.done)}
                {b.partial.total !== null && ` de ${formatBytes(b.partial.total)}`}. Se reanudará en la próxima descarga por bloques.
              </p>
            )}
            {rows.length === 0 ? (
              <p className={styles.muted}>Todavía no hay ningún volcado de esta rama.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Copia</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">Fecha del volcado</th>
                    <th scope="col">Tamaño</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.file}>
                      <td>{KINDS[d.kind]}</td>
                      <td>{d.name ?? '—'}</td>
                      <td>{formatDateTime(d.modified)}</td>
                      <td>{formatBytes(d.size)}</td>
                      <td className={styles.rowActions}>
                        <button type="button" onClick={() => onImport({ branch: b.branch, dump: d.kind === 'current' ? 'current' : d.file })}>
                          Importar
                        </button>
                        {d.kind !== 'kept' && (
                          <button
                            type="button"
                            onClick={() => {
                              setName('');
                              setKeeping({ branch: b.branch, dump: d });
                            }}
                          >
                            Conservar
                          </button>
                        )}
                        {d.kind !== 'current' && (
                          <button type="button" onClick={() => setDeleting({ branch: b.branch, dump: d })}>
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      <p className={styles.muted}>
        Al descargar un volcado nuevo, el que había pasa a ser la copia anterior y sustituye a la que hubiera. Las conservadas no se borran solas y
        no ocupan más disco mientras exista el volcado del que salieron.
      </p>

      {keeping && (
        <Confirm
          title="Conservar copia"
          action="Conservar"
          ready={name.trim() !== ''}
          onAnswer={(yes) => {
            const target = keeping;
            setKeeping(null);
            if (yes) {
              void act(
                () => api.post('/dumps/keep', { branch: target.branch, source: target.dump.kind === 'current' ? 'current' : target.dump.file, name: name.trim() }),
                `Copia «${name.trim()}» conservada.`,
              );
            }
          }}
        >
          <label className={styles.field}>
            <span>Nombre de la copia</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <small className={styles.muted}>Hasta 40 caracteres: letras, cifras, espacios, guiones y puntos.</small>
          </label>
        </Confirm>
      )}
      {deleting && (
        <Confirm
          title="Eliminar copia"
          action="Eliminar"
          onAnswer={(yes) => {
            const target = deleting;
            setDeleting(null);
            if (yes) void act(() => api.delete(`/dumps/${target.branch}/${encodeURIComponent(target.dump.file)}`), 'Copia eliminada.');
          }}
        >
          <p>
            Se borrará la copia {deleting.dump.name ? `«${deleting.dump.name}»` : 'anterior'} de {BRANCH_LABELS[deleting.branch]}, del{' '}
            {formatDateTime(deleting.dump.modified)}. No se puede deshacer.
          </p>
        </Confirm>
      )}
    </div>
  );
}
