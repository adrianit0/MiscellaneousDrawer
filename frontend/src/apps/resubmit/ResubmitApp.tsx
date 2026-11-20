import { useCallback, useEffect, useRef, useState } from 'react';
import { useMiniApp } from '../../platform';
import { Confirm } from './Confirm';
import { Connection } from './Connection';
import styles from './resubmit.module.css';
import { errorMessage, formatDate, jobSummary, resultLabel, type Candidate, type ConfigView, type Job } from './types';

/** RP-45: cada cuánto se consulta un trabajo en marcha. */
export const POLL_MS = 1000;

/** RP-40 */
const SECTIONS = [
  { path: '', label: 'PR rechazados' },
  { path: '/connection', label: 'Conexión' },
];

/**
 * «Reenviar PR» (RP-40 a RP-45): los PR de corrección rechazados al cerrar una versión y el trabajo que los vuelve a
 * pedir en Bitbucket.
 */
export function ResubmitApp() {
  const { api, active, path, navigate, notify, setSubtitle, showConsole } = useMiniApp();
  const section = SECTIONS.find((s) => s.path === path) ?? SECTIONS[0];
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [job, setJob] = useState<Job | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [listEpoch, setListEpoch] = useState(0);
  const [jobEpoch, setJobEpoch] = useState(0);
  const sawRunning = useRef(false);
  /** Solo cuenta la respuesta de la última lista pedida. */
  const listRequest = useRef(0);

  const configured = config !== null && config.missing.length === 0;

  useEffect(() => {
    setSubtitle(section.label);
    return () => setSubtitle(null);
  }, [section.label, setSubtitle]);

  useEffect(() => {
    api
      .get<ConfigView>('/config')
      .then((received) => {
        setConfig(received);
        setConfigError(null);
        // RP-40: sin conexión completa, abre en «Conexión».
        if (received.missing.length > 0) navigate('/connection', { replace: true });
      })
      .catch((e: unknown) => setConfigError(errorMessage(e)));
    // Solo al abrir: navigate no es una dependencia.
  }, [api]);

  const reload = useCallback(() => setListEpoch((e) => e + 1), []);

  // RP-42: al abrir «PR rechazados», al pulsar «Buscar de nuevo» y al terminar un trabajo.
  useEffect(() => {
    if (!active || !configured || section.path !== '') return;
    const mine = ++listRequest.current;
    setLoading(true);
    api
      .get<{ candidates: Candidate[] }>('/candidates')
      .then((received) => {
        if (mine !== listRequest.current) return;
        setCandidates(received.candidates);
        setSelected(new Set(received.candidates.filter((c) => c.selectable).map((c) => c.id)));
        setListError(null);
      })
      .catch((e: unknown) => {
        if (mine === listRequest.current) setListError(errorMessage(e));
      })
      .finally(() => {
        if (mine === listRequest.current) setLoading(false);
      });
  }, [api, active, configured, section.path, listEpoch]);

  /** RP-44 */
  const apply = useCallback(
    (received: Job | null) => {
      setJob(received);
      if (!received) return;
      if (sawRunning.current && received.state !== 'running') {
        notify(jobSummary(received), received.state === 'failed' ? 'error' : 'info');
        reload();
      }
      sawRunning.current = received.state === 'running';
    },
    [notify, reload],
  );

  // RP-45: cada segundo mientras hay un trabajo en marcha y la mini app está a la vista.
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
  const chosen = (candidates ?? []).filter((c) => c.selectable && selected.has(c.id));

  /** RP-20, RP-43 */
  const start = async () => {
    setConfirming(false);
    setStarting(true);
    try {
      const { job: started } = await api.post<{ job: Job }>('/jobs', { prIds: chosen.map((c) => c.id) });
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

  const toggle = (id: number, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const selectable = (candidates ?? []).filter((c) => c.selectable);
  const allChosen = selectable.length > 0 && selectable.every((c) => selected.has(c.id));

  const candidateRow = (c: Candidate) => (
    <tr key={c.id} data-selectable={c.selectable}>
      <td>
        {c.selectable && (
          <input
            type="checkbox"
            aria-label={`Reenviar ${c.ticket ?? c.branch}`}
            checked={selected.has(c.id)}
            disabled={locked}
            onChange={(e) => toggle(c.id, e.target.checked)}
          />
        )}
      </td>
      <td className={styles.mono}>{c.ticket ?? '—'}</td>
      <td>
        {c.link ? (
          <a href={c.link} target="_blank" rel="noreferrer">
            {c.title}
          </a>
        ) : (
          c.title
        )}
        {!c.selectable && c.reason && <div className={styles.warn}>{c.reason}</div>}
      </td>
      <td className={styles.mono}>
        <div>{c.branch}</div>
        {c.newBranch && <div className={styles.newBranch}>→ {c.newBranch}</div>}
      </td>
      <td>{formatDate(c.declinedAt)}</td>
    </tr>
  );

  return (
    <div className={styles.app}>
      <nav className={styles.tabs} aria-label="Secciones">
        {SECTIONS.map((s) => (
          <button key={s.path} type="button" aria-current={s === section ? 'page' : undefined} onClick={() => navigate(s.path)}>
            {s.label}
          </button>
        ))}
      </nav>

      {configError && (
        <p className={styles.error} role="alert">
          {configError}
        </p>
      )}
      {!config && !configError && <p className={styles.muted}>Cargando…</p>}

      {config && section.path === '/connection' && (
        <Connection
          config={config}
          locked={locked}
          onSaved={(next) => {
            setConfig(next);
            setCandidates(null);
          }}
        />
      )}

      {config && section.path === '' && !configured && (
        <div className={styles.panel}>
          <p>Falta configurar la conexión con Bitbucket.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => navigate('/connection')}>
              Ir a Conexión
            </button>
          </div>
        </div>
      )}

      {configured && section.path === '' && (
        <>
          <div className={styles.toolbar}>
            <button type="button" className={styles.primary} disabled={locked || chosen.length === 0} onClick={() => setConfirming(true)}>
              Reenviar seleccionados ({chosen.length})
            </button>
            <button type="button" disabled={loading} onClick={reload}>
              Buscar de nuevo
            </button>
            <span className={styles.spacer} />
            <span className={styles.muted}>
              PR de {config.username} contra {config.targetBranch ?? 'hotfix'} rechazados en los últimos 30 días
            </span>
          </div>

          {job && (
            <section className={styles.jobBox} aria-label="Reenvío">
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
              <div className={styles.tableWrap}>
                <table className={styles.table} aria-label="Resultado del reenvío">
                  <thead>
                    <tr>
                      <th>PR</th>
                      <th>Rama nueva</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.prs.map((p) => (
                      <tr key={p.id}>
                        <td>
                          #{p.id} {p.title ?? ''}
                        </td>
                        <td className={styles.mono}>{p.newBranch ?? '—'}</td>
                        <td>
                          <span className={styles.badge} data-result={p.result}>
                            {resultLabel(p.result)}
                          </span>{' '}
                          {p.link && (
                            <a href={p.link} target="_blank" rel="noreferrer">
                              Abrir PR nuevo
                            </a>
                          )}
                          {p.detail && <div className={styles.detail}>{p.detail}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {listError && (
            <p className={styles.error} role="alert">
              {listError}
            </p>
          )}
          {!candidates && !listError && <p className={styles.muted}>Buscando PR rechazados…</p>}
          {candidates && candidates.length === 0 && <p className={styles.muted}>No hay PR rechazados pendientes de reenviar.</p>}
          {candidates && candidates.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table} aria-label="PR rechazados">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={allChosen}
                        disabled={locked || selectable.length === 0}
                        onChange={(e) => setSelected(new Set(e.target.checked ? selectable.map((c) => c.id) : []))}
                      />
                    </th>
                    <th>Ticket</th>
                    <th>Título</th>
                    <th>Rama</th>
                    <th>Rechazado</th>
                  </tr>
                </thead>
                <tbody>{candidates.map(candidateRow)}</tbody>
              </table>
            </div>
          )}
        </>
      )}

      {confirming && (
        <Confirm title="Reenviar PR" action="Reenviar" onAnswer={(yes) => (yes ? void start() : setConfirming(false))}>
          <p>
            Se {chosen.length === 1 ? 'subirá 1 rama' : `subirán ${chosen.length} ramas`} al remoto y se{' '}
            {chosen.length === 1 ? 'creará 1 PR' : `crearán ${chosen.length} PR`} en Bitbucket contra «{config?.targetBranch ?? 'hotfix'}».
          </p>
          <p className={styles.muted}>Un PR cuyos commits no se puedan aplicar sin conflictos no se sube: se avisa y se sigue con el siguiente.</p>
        </Confirm>
      )}
    </div>
  );
}
