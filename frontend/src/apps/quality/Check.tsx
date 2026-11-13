import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState, useMiniApp } from '../../platform';
import styles from './quality.module.css';
import {
  errorMessage,
  LABELS,
  resultLabel,
  type ConfigView,
  type Run,
  type ScriptListing,
  type ScriptResult,
  type ScriptTables,
} from './types';

/** CD-44: cada cuánto se consulta una comprobación en marcha. */
export const POLL_MS = 1000;

interface Props {
  config: ConfigView;
  /** La sección está a la vista. */
  visible: boolean;
}

/** CD-42: el resumen de la comprobación. */
function summary(run: Run): string {
  if (run.state === 'running') {
    const done = run.scripts.filter((s) => s.state !== 'pending' && s.state !== 'running').length;
    return run.scripts.length === 0 ? 'Comprobación en marcha' : `Comprobación en marcha: ${done} de ${run.scripts.length}`;
  }
  if (run.state === 'cancelled') return 'Comprobación cancelada';
  return run.message ?? '';
}

const hasIncident = (r: ScriptResult | undefined) => r?.state === 'rows' || r?.state === 'error';

/** CD-41 a CD-44: elegir los scripts, ejecutarlos y ver sus resultados. */
export function Check({ config, visible }: Props) {
  const { api, active, navigate, notify, showConsole } = useMiniApp();
  const [filter, setFilter] = useAppState('filter', '');
  const [onlyIncidents, setOnlyIncidents] = useAppState('onlyIncidents', false);
  const [listing, setListing] = useState<ScriptListing | null>(null);
  const [unchecked, setUnchecked] = useState<string[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScriptTables | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const sawRunning = useRef(false);

  const missing = config.missing;
  const canList = !missing.includes('qualitySqlDir');
  const running = run?.state === 'running';
  const watching = active && visible;

  // CD-10: los scripts de la carpeta. Se releen al terminar una comprobación y al volver a la sección.
  useEffect(() => {
    if (!watching || !canList || running) return;
    api
      .get<ScriptListing>('/scripts')
      .then(setListing)
      .catch(() => setListing(null));
  }, [api, watching, canList, running, config]);

  /** CD-28 */
  const apply = useCallback(
    (received: Run | null) => {
      setRun(received);
      if (!received) return;
      // CD-44: avisa al terminar una comprobación que se estaba viendo.
      if (sawRunning.current && received.state !== 'running') {
        const ok = received.state === 'succeeded' && !received.scripts.some(hasIncident);
        notify(`Calidad del dato: ${summary(received)}`, ok || received.state === 'cancelled' ? 'info' : 'error');
      }
      sawRunning.current = received.state === 'running';
    },
    [notify],
  );

  // CD-44: cada segundo mientras hay una en marcha y la mini app está a la vista; al volver, de inmediato.
  useEffect(() => {
    if (!watching) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let received: Run | null = null;
      try {
        received = (await api.get<{ run: Run | null }>('/run')).run;
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

  const results = new Map((run?.scripts ?? []).map((s) => [s.file, s]));
  const names = listing?.files ?? (run?.scripts ?? []).map((s) => s.file);
  const needle = filter.trim().toLowerCase();
  // CD-41: el filtro, como el parámetro del script de consola; CD-42: «Solo con incidencias» oculta los correctos.
  const shown = names.filter(
    (name) => name.toLowerCase().includes(needle) && !(onlyIncidents && results.get(name)?.state === 'clean'),
  );
  const chosen = shown.filter((name) => !unchecked.includes(name));
  const allShownChecked = shown.length > 0 && chosen.length === shown.length;
  const configured = missing.length === 0;

  const start = async () => {
    // Todos los de la carpeta: el servidor los toma de ella.
    const files = listing && chosen.length === listing.files.length ? null : chosen;
    setBusy(true);
    setError(null);
    setSelected(null);
    setDetail(null);
    try {
      const { run: started } = await api.post<{ run: Run }>('/run', { files });
      sawRunning.current = false;
      apply(started);
      // CD-42: al iniciar se muestra la consola.
      showConsole(started.consoleId);
      setEpoch((e) => e + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setError(null);
    try {
      await api.post('/run/cancel');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  /** CD-43: las filas o el error de un script. */
  const open = async (result: ScriptResult) => {
    if (selected === result.file) {
      setSelected(null);
      return;
    }
    setSelected(result.file);
    setDetail(null);
    setDetailError(null);
    if (result.state !== 'rows') return;
    try {
      setDetail(await api.get<ScriptTables>(`/run/scripts/${encodeURIComponent(result.file)}`));
    } catch (e) {
      setDetailError(errorMessage(e));
    }
  };

  const toggleAll = (checked: boolean) =>
    setUnchecked((u) => (checked ? u.filter((n) => !shown.includes(n)) : [...new Set([...u, ...shown])]));

  const selectedResult = selected ? results.get(selected) : undefined;
  const shownRows = detail ? detail.tables.reduce((n, t) => n + t.rows.length, 0) : 0;

  return (
    <div className={styles.check}>
      {!configured && (
        <p className={styles.notice}>
          Falta configurar: {missing.map((k) => LABELS[k] ?? k).join(', ')}.{' '}
          <button type="button" className={styles.link} onClick={() => navigate('/settings')}>
            Ir a Configuración
          </button>
        </p>
      )}

      <section className={styles.panel} aria-label="Scripts de calidad">
        <div className={styles.toolbar}>
          <label className={styles.inline}>
            <input
              type="checkbox"
              aria-label="Marcar todos"
              checked={allShownChecked}
              disabled={running || shown.length === 0}
              onChange={(e) => toggleAll(e.target.checked)}
            />
          </label>
          <input
            type="search"
            className={styles.filter}
            placeholder="Filtrar por nombre"
            aria-label="Filtrar"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label className={styles.inline}>
            <input type="checkbox" checked={onlyIncidents} onChange={(e) => setOnlyIncidents(e.target.checked)} />
            Solo con incidencias
          </label>
          <span className={styles.spacer} />
          {running ? (
            <button type="button" onClick={() => void cancel()}>
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !configured || chosen.length === 0}
              onClick={() => void start()}
            >
              Ejecutar
            </button>
          )}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {run && (
          <div className={styles.summary} data-state={run.state === 'succeeded' && !run.scripts.some(hasIncident) ? 'clean' : run.state}>
            <strong role="status" aria-label="Resumen">
              {summary(run)}
            </strong>
            <button type="button" onClick={() => showConsole(run.consoleId)}>
              Ver consola
            </button>
          </div>
        )}

        {listing && !listing.exists && <p className={styles.error}>La carpeta {listing.folder} no existe.</p>}
        {listing?.exists && listing.files.length === 0 && <p className={styles.muted}>No hay scripts de calidad en {listing.folder}.</p>}
        {names.length > 0 && shown.length === 0 && <p className={styles.muted}>Ningún script coincide.</p>}

        {shown.length > 0 && (
          <ul className={styles.scripts} aria-label="Scripts">
            {shown.map((name) => {
              const result = results.get(name);
              const clickable = hasIncident(result);
              return (
                <li key={name} data-state={result?.state ?? 'none'} aria-current={selected === name || undefined}>
                  <input
                    type="checkbox"
                    aria-label={name}
                    checked={!unchecked.includes(name)}
                    disabled={running}
                    onChange={(e) => setUnchecked((u) => (e.target.checked ? u.filter((x) => x !== name) : [...u, name]))}
                  />
                  {clickable ? (
                    <button type="button" className={styles.scriptName} onClick={() => void open(result!)}>
                      {name}
                    </button>
                  ) : (
                    <span className={styles.mono}>{name}</span>
                  )}
                  {result && <span className={styles.badge}>{resultLabel(result)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selectedResult && (
        <section className={styles.panel} aria-label={`Resultado de ${selectedResult.file}`}>
          <div className={styles.summary}>
            <strong className={styles.mono}>{selectedResult.file}</strong>
            <span className={styles.badge}>{resultLabel(selectedResult)}</span>
          </div>
          {selectedResult.state === 'error' && <pre className={styles.scriptError}>{selectedResult.error}</pre>}
          {detailError && <p className={styles.error}>{detailError}</p>}
          {detail && (
            <>
              {(shownRows < detail.rowCount || !detail.complete) && (
                <p className={styles.muted}>
                  Se muestran {shownRows} de {detail.complete ? detail.rowCount : `más de ${detail.rowCount}`} filas.
                </p>
              )}
              {detail.tables.map((table, t) => (
                <div key={t} className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {table.columns.map((c, i) => (
                          <th key={i} scope="col">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, r) => (
                        <tr key={r}>
                          {row.map((value, i) =>
                            value === null ? (
                              <td key={i} className={styles.null}>
                                NULL
                              </td>
                            ) : (
                              <td key={i}>{value}</td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
