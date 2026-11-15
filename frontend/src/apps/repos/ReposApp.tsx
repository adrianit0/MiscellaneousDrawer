import { useCallback, useEffect, useRef, useState } from 'react';
import { useMiniApp } from '../../platform';
import { Confirm } from './Confirm';
import { RepoForm } from './RepoForm';
import styles from './repos.module.css';
import {
  errorMessage,
  isMulti,
  jobSummary,
  pendingLabel,
  resultLabel,
  stateLabel,
  type Action,
  type Job,
  type Repo,
  type Status,
  type Statuses,
} from './types';

/** RG-44: cada cuánto se consulta un trabajo en marcha. */
export const POLL_MS = 1000;

/** «Repositorios» (RG-40 a RG-45): el estado de cada repositorio de la lista y las acciones de git sobre ellos. */
export function ReposApp() {
  const { api, active, notify, showConsole } = useMiniApp();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [statuses, setStatuses] = useState<Statuses | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** RG-45: 'new', el identificador del repositorio que se edita o null. */
  const [editing, setEditing] = useState<'new' | number | null>(null);
  /** RG-42 */
  const [confirming, setConfirming] = useState<{ kind: 'delete' | 'discard'; repo: Repo } | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [statusEpoch, setStatusEpoch] = useState(0);
  const [jobEpoch, setJobEpoch] = useState(0);
  const sawRunning = useRef(false);
  /** Solo cuenta la respuesta del último estado pedido. */
  const statusRequest = useRef(0);

  const refresh = useCallback(() => setStatusEpoch((e) => e + 1), []);

  useEffect(() => {
    api
      .get<{ repos: Repo[] }>('/repos')
      .then((r) => {
        setRepos(r.repos);
        setError(null);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [api]);

  // RG-44: al abrir, al refrescar, al terminar un trabajo, tras guardar o eliminar y al volver a verse.
  useEffect(() => {
    if (!active) return;
    const mine = ++statusRequest.current;
    api
      .get<Statuses>('/status')
      .then((received) => {
        if (mine === statusRequest.current) setStatuses(received);
      })
      .catch((e: unknown) => {
        if (mine === statusRequest.current) setError(errorMessage(e));
      });
  }, [api, active, statusEpoch]);

  /** RG-31, RG-43 */
  const apply = useCallback(
    (received: Job | null) => {
      setJob(received);
      if (!received) return;
      if (sawRunning.current && received.state !== 'running') {
        notify(jobSummary(received), received.state === 'failed' ? 'error' : 'info');
        refresh();
      }
      sawRunning.current = received.state === 'running';
    },
    [notify, refresh],
  );

  // RG-44: cada segundo mientras hay un trabajo en marcha y la mini app está a la vista.
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let received: Job | null = null;
      try {
        received = (await api.get<{ job: Job | null }>('/job')).job;
        if (stopped) return;
        apply(received);
      } catch {
        if (stopped) return;
        // Sin contacto: se reintenta mientras se crea que sigue en marcha.
        if (sawRunning.current) timer = setTimeout(tick, POLL_MS);
        return;
      }
      if (received?.state === 'running') timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [api, apply, active, jobEpoch]);

  const running = job?.state === 'running';
  const locked = running || starting;

  /** RG-20 */
  const start = async (action: Action, repo?: Repo, branch?: string) => {
    setMenu(null);
    setStarting(true);
    try {
      const { job: started } = await api.post<{ job: Job }>('/jobs', { action, repoId: repo?.id, branch });
      // El trabajo puede haber terminado ya: cuenta como visto en marcha para avisar de su resultado.
      sawRunning.current = true;
      apply(started);
      setJobEpoch((e) => e + 1);
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    try {
      await api.post('/job/cancel');
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  const saved = (repo: Repo) => {
    setRepos((list) => {
      const current = list ?? [];
      return current.some((r) => r.id === repo.id) ? current.map((r) => (r.id === repo.id ? repo : r)) : [...current, repo];
    });
    setEditing(null);
    refresh();
  };

  const remove = async (repo: Repo) => {
    try {
      await api.delete(`/repos/${repo.id}`);
      setRepos((list) => (list ?? []).filter((r) => r.id !== repo.id));
      notify('Repositorio eliminado de la lista.');
      refresh();
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  const answer = (yes: boolean) => {
    const asked = confirming;
    setConfirming(null);
    if (!yes || !asked) return;
    if (asked.kind === 'delete') void remove(asked.repo);
    else void start('discard', asked.repo);
  };

  const statusOf = (repo: Repo): Status | undefined => statuses?.statuses.find((s) => s.id === repo.id);
  const resultOf = (repo: Repo) => (job && isMulti(job) ? job.repos.find((r) => r.repoId === repo.id) : undefined);
  const edited = typeof editing === 'number' ? (repos?.find((r) => r.id === editing) ?? null) : null;
  const discarding = confirming?.kind === 'discard' ? statusOf(confirming.repo) : undefined;

  const row = (repo: Repo) => {
    const status = statusOf(repo);
    const result = resultOf(repo);
    const ok = status?.state === 'ok';
    const detached = ok && status.branch === null ? `(${status.head ?? 'sin commits'})` : null;
    return (
      <tr key={repo.id} data-state={status?.state ?? 'loading'}>
        <td>
          <strong>{repo.name}</strong>
          <div className={styles.dir}>{repo.dir}</div>
          {ok && status.remoteMatches === false && (
            <div className={styles.notice}>
              El remoto «origin» no es el configurado.{' '}
              <button type="button" className={styles.link} disabled={locked} onClick={() => void start('set-remote', repo)}>
                Usar el configurado
              </button>
            </div>
          )}
        </td>
        <td>
          {ok ? (
            <select
              aria-label={`Rama de ${repo.name}`}
              value={status.branch ?? detached ?? ''}
              disabled={locked}
              onChange={(e) => void start('switch', repo, e.target.value)}
            >
              {detached && <option disabled>{detached}</option>}
              {status.branch !== null && !status.branches.includes(status.branch) && <option>{status.branch}</option>}
              {status.branches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          ) : (
            '—'
          )}
        </td>
        <td className={status && status.state !== 'ok' ? styles.warn : undefined}>{status ? stateLabel(status) : '…'}</td>
        <td>{status ? pendingLabel(status) : '…'}</td>
        <td>
          <div className={styles.rowActions}>
            {result && (
              <span className={styles.badge} data-result={result.result} title={result.detail ?? undefined}>
                {resultLabel(result.result)}
              </span>
            )}
            {ok && (
              <button type="button" disabled={locked} onClick={() => void start('pull', repo)}>
                Actualizar
              </button>
            )}
            {status?.state === 'missing' && (
              <button type="button" disabled={locked} onClick={() => void start('clone', repo)}>
                Clonar
              </button>
            )}
            <button
              type="button"
              aria-label={`Más acciones de ${repo.name}`}
              aria-haspopup="menu"
              aria-expanded={menu === repo.id}
              onClick={() => setMenu(menu === repo.id ? null : repo.id)}
            >
              ⋯
            </button>
            {menu === repo.id && (
              <div className={styles.menu} role="menu" aria-label={`Acciones de ${repo.name}`}>
                {ok && (
                  <button type="button" role="menuitem" disabled={locked} onClick={() => void start('fetch', repo)}>
                    Consultar el remoto
                  </button>
                )}
                {ok && (status.changes ?? 0) > 0 && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.danger}
                    disabled={locked}
                    onClick={() => {
                      setMenu(null);
                      setConfirming({ kind: 'discard', repo });
                    }}
                  >
                    Descartar cambios
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={locked}
                  onClick={() => {
                    setMenu(null);
                    setEditing(repo.id);
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={locked}
                  onClick={() => {
                    setMenu(null);
                    setConfirming({ kind: 'delete', repo });
                  }}
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className={styles.app}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!repos && !error && <p className={styles.muted}>Cargando…</p>}
      {repos && editing !== null && (editing === 'new' || edited) && (
        <RepoForm key={editing} repo={edited} onSaved={saved} onCancel={() => setEditing(null)} />
      )}
      {repos && !(editing !== null && (editing === 'new' || edited)) && (
        <>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.primary}
              disabled={locked || repos.length === 0}
              onClick={() => void start('update-all')}
            >
              Actualizar todas
            </button>
            <button type="button" disabled={locked || repos.length === 0} onClick={() => void start('fetch-all')}>
              Consultar todas
            </button>
            <button type="button" onClick={refresh}>
              Refrescar
            </button>
            <span className={styles.spacer} />
            <button type="button" disabled={locked} onClick={() => setEditing('new')}>
              Nuevo repositorio
            </button>
          </div>

          {job && (
            <div className={styles.summary} data-state={job.state}>
              <strong role="status" aria-label="Trabajo">
                {jobSummary(job)}
              </strong>
              <div className={styles.actions}>
                <button type="button" onClick={() => showConsole(job.consoleId)}>
                  Ver consola
                </button>
                {running && (
                  <button type="button" onClick={() => void cancel()}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}

          {statuses?.warning && <p className={styles.notice}>{statuses.warning}</p>}
          {repos.length === 0 ? (
            <p className={styles.muted}>No hay ningún repositorio. Añade uno con «Nuevo repositorio».</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} aria-label="Repositorios">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Rama</th>
                    <th>Estado</th>
                    <th>Pendientes</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>{repos.map(row)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
      {confirming?.kind === 'delete' && (
        <Confirm title="Eliminar repositorio" action="Eliminar" onAnswer={answer}>
          <p>Se quitará «{confirming.repo.name}» de la lista. No se borra nada del disco.</p>
        </Confirm>
      )}
      {confirming?.kind === 'discard' && (
        <Confirm title="Descartar cambios" action="Descartar" onAnswer={answer}>
          <p>
            Se desharán los cambios de {discarding?.changes === 1 ? '1 fichero' : `${discarding?.changes ?? 0} ficheros`} de «
            {confirming.repo.name}». No se pueden recuperar.
          </p>
          {(discarding?.untracked ?? 0) > 0 && <p className={styles.muted}>Los ficheros sin seguimiento no se tocan.</p>}
        </Confirm>
      )}
    </div>
  );
}
