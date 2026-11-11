import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppState, useMiniApp } from '../../platform';
import { Confirm } from './Confirm';
import styles from './database.module.css';
import type { ImportChoice } from './DatabaseApp';
import {
  BRANCH_LABELS,
  dumpLabel,
  errorMessage,
  formatBytes,
  LABELS,
  type BranchDumps,
  type ConfigView,
  type Dump,
  type Job,
  type JobBranch,
  type JobRequest,
  type JobStep,
  type ScriptListing,
  type StepKind,
} from './types';

/** BD-63: cada cuánto se consulta un trabajo en marcha. */
export const POLL_MS = 1000;
const MAX_LINES = 5000;

const STEP_LABELS: Record<StepKind, string> = { download: 'Descargar', import: 'Importar', scripts: 'Ejecutar scripts' };
const STEP_STATES: Record<JobStep['state'], string> = {
  pending: 'Pendiente',
  running: 'En marcha',
  done: 'Hecho',
  failed: 'Fallido',
  skipped: 'Omitido',
};
const JOB_STATES: Record<Job['state'], string> = {
  running: 'Trabajo en marcha',
  succeeded: 'Trabajo terminado',
  failed: 'Trabajo terminado con errores',
  cancelled: 'Trabajo cancelado',
};
const SCRIPT_STATES = { pending: 'pendiente', running: 'en marcha', ok: 'correcto', error: 'con error' } as const;

type Steps = Record<StepKind, boolean>;

interface Props {
  config: ConfigView;
  /** La sección está a la vista. */
  visible: boolean;
  /** BD-64: volcado elegido en «Copias». */
  choice: ImportChoice | null;
  onChoiceUsed: () => void;
}

/** BD-61 a BD-63, BD-42: elegir los pasos, iniciar el trabajo y seguirlo. */
export function Prepare({ config, visible, choice, onChoiceUsed }: Props) {
  const { api, active, navigate, notify } = useMiniApp();
  const [branch, setBranch] = useAppState<JobBranch>('branch', 'hotfix');
  const [steps, setSteps] = useAppState<Steps>('steps', { download: true, import: true, scripts: true });
  const [mode, setMode] = useAppState<'chunked' | 'direct'>('mode', 'chunked');
  const [force, setForce] = useState(false);
  const [dump, setDump] = useState('current');
  const [version, setVersion] = useState<string | null>(null);
  const [listing, setListing] = useState<ScriptListing | null>(null);
  const [unchecked, setUnchecked] = useState<string[]>([]);
  const [dumps, setDumps] = useState<BranchDumps[] | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<JobRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const next = useRef(0);
  const jobId = useRef<number | null>(null);
  const sawRunning = useRef(false);
  const logBox = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  const both = branch === 'both';
  const missing = config.missing;
  const canList = missing.dumps.length === 0;
  const canScripts = !missing.scripts.includes('pendingSqlDir');
  const running = job?.state === 'running';
  const watching = active && visible;

  // BD-64: lo elegido en «Copias».
  useEffect(() => {
    if (!choice) return;
    setBranch(choice.branch);
    setDump(choice.dump);
    setSteps((s) => ({ ...s, import: true }));
    onChoiceUsed();
  }, [choice, onChoiceUsed, setBranch, setSteps]);

  // Los volcados de la rama, para elegir cuál importar. Se releen al terminar un trabajo.
  useEffect(() => {
    if (!watching || !canList || running) return;
    api
      .get<{ branches: BranchDumps[] }>('/dumps')
      .then((r) => setDumps(r.branches))
      .catch(() => setDumps(null));
  }, [api, watching, canList, running]);

  useEffect(() => {
    if (!watching || !canScripts) return;
    api
      .get<ScriptListing>(version === null ? '/scripts' : `/scripts?version=${encodeURIComponent(version)}`)
      .then((l) => {
        setListing(l);
        setUnchecked([]);
      })
      .catch(() => setListing(null));
  }, [api, watching, canScripts, version]);

  /** BD-14: añade las líneas nuevas; un trabajo distinto empieza su registro de cero. */
  const apply = useCallback(
    (received: Job | null) => {
      if (!received) {
        setJob(null);
        return;
      }
      const fresh = received.id !== jobId.current;
      if (fresh && received.log.from > 0 && next.current > 0) {
        // Se pidió con el índice del trabajo anterior: se vuelve a pedir entero.
        jobId.current = received.id;
        next.current = 0;
        setLines([]);
        setEpoch((e) => e + 1);
        return;
      }
      jobId.current = received.id;
      next.current = received.log.next;
      setLines((previous) => (fresh ? received.log.lines : [...previous, ...received.log.lines]).slice(-MAX_LINES));
      setJob(received);
      // BD-63: avisa al terminar un trabajo que se estaba viendo.
      if (sawRunning.current && received.state !== 'running') {
        notify(`Base de datos: ${JOB_STATES[received.state].toLowerCase()}`, received.state === 'succeeded' ? 'info' : 'error');
      }
      sawRunning.current = received.state === 'running';
    },
    [notify],
  );

  // BD-63: cada segundo mientras hay un trabajo en marcha y la mini app está a la vista; al volver, de inmediato.
  useEffect(() => {
    if (!watching) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let received: Job | null = null;
      try {
        received = (await api.get<{ job: Job | null }>(`/job?after=${next.current}`)).job;
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
  }, [api, apply, watching, epoch]);

  // BD-62: el registro baja solo hasta el final, salvo que el usuario haya subido.
  useLayoutEffect(() => {
    const box = logBox.current;
    if (box && stick.current) box.scrollTop = box.scrollHeight;
  }, [lines]);

  const enabled: Steps = {
    download: steps.download && missing.download.length === 0,
    import: steps.import && !both && missing.import.length === 0,
    scripts: steps.scripts && !both && missing.scripts.length === 0,
  };
  const branchDumps = both ? null : (dumps?.find((d) => d.branch === branch) ?? null);
  const copies: Dump[] = branchDumps ? [...(branchDumps.previous ? [branchDumps.previous] : []), ...branchDumps.kept] : [];
  const files = listing?.files ?? [];
  const chosenFiles = files.filter((f) => !unchecked.includes(f));

  const request = (): JobRequest => ({
    branch,
    download: enabled.download ? { mode, force } : null,
    import: enabled.import ? { dump: copies.some((c) => c.file === dump) ? dump : 'current' } : null,
    scripts: enabled.scripts ? { version, files: unchecked.length === 0 ? null : chosenFiles } : null,
  });

  const start = async (body: JobRequest) => {
    setBusy(true);
    setError(null);
    try {
      const { job: started } = await api.post<{ job: Job }>('/job', body);
      stick.current = true;
      sawRunning.current = false;
      apply(started);
      setEpoch((e) => e + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onStart = () => {
    const body = request();
    // BD-42: importar borra la base local.
    if (body.import) setConfirming(body);
    else void start(body);
  };

  const cancel = async () => {
    setError(null);
    try {
      await api.post('/job/cancel');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const missingNotice = (step: StepKind) =>
    missing[step].length > 0 && (
      <p className={styles.notice}>
        Falta configurar: {missing[step].map((k) => LABELS[k] ?? k).join(', ')}.{' '}
        <button type="button" className={styles.link} onClick={() => navigate('/settings')}>
          Ir a Configuración
        </button>
      </p>
    );

  const toggle = (step: StepKind) => (
    <label className={styles.stepTitle}>
      <input
        type="checkbox"
        checked={steps[step] && (step === 'download' || !both) && missing[step].length === 0}
        disabled={running || missing[step].length > 0 || (step !== 'download' && both)}
        onChange={(e) => setSteps((s) => ({ ...s, [step]: e.target.checked }))}
      />
      {STEP_LABELS[step]}
    </label>
  );

  return (
    <div className={styles.prepare}>
      <section className={styles.form} aria-label="Pasos">
        <fieldset className={styles.branches} disabled={running}>
          <legend>Rama</legend>
          {(['hotfix', 'develop', 'both'] as const).map((b) => (
            <label key={b}>
              <input type="radio" name="database-branch" checked={branch === b} onChange={() => setBranch(b)} />
              {BRANCH_LABELS[b]}
            </label>
          ))}
        </fieldset>

        <div className={styles.step}>
          {toggle('download')}
          {missingNotice('download')}
          <div className={styles.options}>
            <label>
              Modo{' '}
              <select value={mode} disabled={running || !enabled.download} onChange={(e) => setMode(e.target.value as 'chunked' | 'direct')}>
                <option value="chunked">Por bloques (reanudable)</option>
                <option value="direct">Directa</option>
              </select>
            </label>
            <label>
              <input type="checkbox" checked={force} disabled={running || !enabled.download} onChange={(e) => setForce(e.target.checked)} />
              Descargar aunque no haya cambiado
            </label>
          </div>
        </div>

        <div className={styles.step}>
          {toggle('import')}
          {both ? <p className={styles.notice}>Con «Ambas» solo se puede descargar.</p> : missingNotice('import')}
          <div className={styles.options}>
            <label>
              Volcado{' '}
              <select value={copies.some((c) => c.file === dump) ? dump : 'current'} disabled={running || !enabled.import} onChange={(e) => setDump(e.target.value)}>
                <option value="current">{branchDumps?.current ? dumpLabel(branchDumps.current) : 'Actual'}</option>
                {copies.map((c) => (
                  <option key={c.file} value={c.file}>
                    {dumpLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className={styles.step}>
          {toggle('scripts')}
          {!both && missingNotice('scripts')}
          <div className={styles.options}>
            <label>
              Carpeta{' '}
              <select
                value={version ?? ''}
                disabled={running || !enabled.scripts}
                onChange={(e) => setVersion(e.target.value === '' ? null : e.target.value)}
              >
                <option value="">Pendientes</option>
                {(listing?.versions ?? []).map((v) => (
                  <option key={v} value={v}>
                    Versión {v}
                  </option>
                ))}
              </select>
            </label>
            {listing && !listing.exists && <span className={styles.error}>La carpeta {listing.folder} no existe.</span>}
            {listing?.exists && files.length === 0 && <span className={styles.muted}>No hay scripts en esta carpeta.</span>}
          </div>
          {files.length > 0 && (
            <ul className={styles.files} aria-label="Scripts">
              {files.map((f) => (
                <li key={f}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!unchecked.includes(f)}
                      disabled={running || !enabled.scripts}
                      onChange={(e) => setUnchecked((u) => (e.target.checked ? u.filter((x) => x !== f) : [...u, f]))}
                    />
                    <span className={styles.mono}>{f}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.actions}>
          {running ? (
            <button type="button" onClick={() => void cancel()}>
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !(enabled.download || enabled.import || enabled.scripts)}
              onClick={onStart}
            >
              Iniciar
            </button>
          )}
          {error && (
            <span className={styles.error} role="alert">
              {error}
            </span>
          )}
        </div>
      </section>

      {job && (
        <section className={styles.job} aria-label="Trabajo">
          <h2 className={job.state === 'failed' ? styles.error : undefined}>
            {JOB_STATES[job.state]} · {BRANCH_LABELS[job.branch]}
          </h2>
          <ol className={styles.steps}>
            {job.steps.map((s) => (
              <li key={s.kind} data-state={s.state}>
                <div>
                  <strong>{STEP_LABELS[s.kind]}</strong> <span className={styles.badge}>{STEP_STATES[s.state]}</span>{' '}
                  {s.message && <span className={s.state === 'failed' ? styles.error : styles.muted}>{s.message}</span>}
                </div>
                {s.progress && (
                  <div className={styles.progress}>
                    <progress aria-label="Progreso de la descarga" value={s.progress.done} max={s.progress.total} />
                    <span>
                      {formatBytes(s.progress.done)} de {formatBytes(s.progress.total)} ({Math.floor((s.progress.done * 100) / s.progress.total)} %)
                    </span>
                  </div>
                )}
                {s.scripts && s.scripts.length > 0 && (
                  <ul className={styles.results} aria-label="Resultado de los scripts">
                    {s.scripts.map((r) => (
                      <li key={r.file} data-state={r.state}>
                        <span className={styles.mono}>{r.file}</span>: {SCRIPT_STATES[r.state]}
                        {r.error && <pre className={styles.scriptError}>{r.error}</pre>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <pre
            ref={logBox}
            className={styles.log}
            aria-label="Registro"
            tabIndex={0}
            onScroll={(e) => {
              const box = e.currentTarget;
              stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
            }}
          >
            {lines.join('\n')}
          </pre>
        </section>
      )}

      {confirming && (
        <Confirm
          title="Importar la base de datos"
          action="Iniciar"
          onAnswer={(yes) => {
            const body = confirming;
            setConfirming(null);
            if (yes) void start(body);
          }}
        >
          <p>
            Se borrarán el contenedor de MySQL y su volumen, con todos los datos de la base local, y se volverán a crear a partir del volcado.
          </p>
          <ul>
            {confirming.download && <li>Descargar el volcado de {BRANCH_LABELS[confirming.branch]}</li>}
            <li>
              Importar:{' '}
              {confirming.import?.dump === 'current'
                ? `volcado actual de ${BRANCH_LABELS[confirming.branch]}`
                : dumpLabel(copies.find((c) => c.file === confirming.import?.dump) ?? ({ kind: 'kept', name: confirming.import?.dump, modified: '' } as Dump))}
            </li>
            {confirming.scripts && (
              <li>
                Ejecutar {confirming.scripts.files === null ? files.length : confirming.scripts.files.length} scripts de{' '}
                {confirming.scripts.version === null ? 'Pendientes' : `la versión ${confirming.scripts.version}`}
              </li>
            )}
          </ul>
        </Confirm>
      )}
    </div>
  );
}
