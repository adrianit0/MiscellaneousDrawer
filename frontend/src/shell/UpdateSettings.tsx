import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type UpdateCheck, type UpdateRelease, type UpdateStatus } from '../api';
import { flushAppStates, unsavedAppStates } from '../platform/appState';
import { useCatalog } from './catalogStore';
import { flushShellState } from './navStore';
import { useUi } from './uiStore';

const shortCommit = (commit: string) => commit.slice(0, 7);

const pad = (n: number) => String(n).padStart(2, '0');

/** U-02: dd/MM/yyyy HH:mm, en la hora local. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function installedLabel(s: UpdateStatus): string {
  return s.build === 0 ? `${s.version}, compilada a mano` : `${s.version}, build ${s.build}, commit ${shortCommit(s.commit)}`;
}

function message(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : 'Error inesperado';
}

/** R-41: lo que impide reiniciar sin perder trabajo. */
async function updateBlockers(): Promise<string[]> {
  await flushShellState();
  await flushAppStates(false);
  const names = new Map(useCatalog.getState().apps.map((a) => [a.id, a.name]));
  return unsavedAppStates().map((id) => `no se pudo guardar el estado de ${names.get(id) ?? id}`);
}

interface ConfirmProps {
  release: UpdateRelease;
  onAnswer: (update: boolean) => void;
}

/** R-40: confirmación con el build, el commit y los commits. */
function ConfirmUpdate({ release, onAnswer }: ConfirmProps) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => primary.current?.focus(), []);
  return (
    <div className="overlay overlay-top">
      <div
        className="dialog confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-confirm-title"
        aria-describedby="update-confirm-body"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Solo cierra la confirmación, no «Ajustes».
            e.preventDefault();
            e.stopPropagation();
            onAnswer(false);
          }
        }}
      >
        <header className="dialog-header">
          <h2 id="update-confirm-title">Actualizar Cajón de sastre</h2>
        </header>
        <div className="confirm-body" id="update-confirm-body">
          <p>
            Se instalará el build {release.build} (commit {shortCommit(release.commit)}) y Cajón de sastre se reiniciará. La ventana se
            recargará sola.
          </p>
          <ul className="update-commits" aria-label="Cambios">
            {release.commits.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
        <footer className="dialog-footer">
          <button type="button" onClick={() => onAnswer(false)}>
            Cancelar
          </button>
          <button ref={primary} type="button" className="primary" onClick={() => onAnswer(true)}>
            Actualizar ahora
          </button>
        </footer>
      </div>
    </div>
  );
}

interface Props {
  /** Lo escrito en el campo. */
  repository: string;
  /** R-11: la URL guardada, la única con la que se puede buscar. */
  saved: string | null;
  onChange: (repository: string) => void;
}

/** R-10 a R-14, R-40, R-41: buscar e instalar una versión publicada (ADR-0010). */
export function UpdateSettings({ repository, saved, onChange }: Props) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [found, setFound] = useState<UpdateCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<UpdateRelease | null>(null);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const updating = useUi((s) => s.updating);
  const ready = saved !== null && saved === repository.trim();

  useEffect(() => {
    api
      .updateStatus()
      .then(setStatus)
      .catch((e: unknown) => setResult({ kind: 'error', text: message(e) }));
  }, []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setResult(null);
    try {
      await work();
    } catch (e) {
      setResult({ kind: 'error', text: message(e) });
    } finally {
      setBusy(false);
    }
  };

  const search = () =>
    void run(async () => {
      setFound(null);
      const check = await api.checkUpdate();
      setFound(check);
      if (!check.newer) setResult({ kind: 'ok', text: 'Tienes la última versión' });
    });

  const askToInstall = (release: UpdateRelease) =>
    void run(async () => {
      const blockers = await updateBlockers();
      if (blockers.length > 0) throw new Error(`No se puede actualizar: ${blockers.join(', ')}.`);
      setConfirming(release);
    });

  const install = (release: UpdateRelease) =>
    void run(async () => {
      const ui = useUi.getState();
      ui.setUpdating(true);
      try {
        await api.applyUpdate(release.build);
      } catch (e) {
        ui.setUpdating(false);
        throw e;
      }
      ui.notify('Actualizando Cajón de sastre: la ventana se recargará sola.');
      ui.setSettingsOpen(false);
    });

  const release = found?.newer ? found.latest : null;

  return (
    <>
      <div className="field">
        <span>Versión instalada</span>
        <span className="update-installed">{status ? installedLabel(status) : '…'}</span>
      </div>
      <label className="field field-wide">
        <span>URL del repositorio</span>
        <input
          value={repository}
          placeholder="https://github.com/propietario/repositorio"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
        {repository.trim() !== '' && !ready && <small className="muted">Guarda los ajustes para usar esta URL.</small>}
      </label>
      {status && !status.available && <p className="muted">{status.reason}</p>}
      {status?.available && (
        <div className="update-actions">
          <button type="button" disabled={busy || updating || !ready} onClick={search}>
            Buscar actualizaciones
          </button>
          <button type="button" disabled={busy || updating || !release} onClick={() => release && askToInstall(release)}>
            Actualizar
          </button>
        </div>
      )}
      {result && (
        <p className={result.kind === 'error' ? 'error-text' : undefined} role={result.kind === 'error' ? 'alert' : 'status'}>
          {result.text}
        </p>
      )}
      {release && (
        <section className="update-release" aria-label="Versión disponible">
          <p>
            Build {release.build}, {formatDateTime(release.date)}, commit {shortCommit(release.commit)}
          </p>
          <ul className="update-commits">
            {release.commits.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted">
        Cajón de sastre solo contacta con GitHub al pulsar un botón, no envía ningún dato tuyo y solo instala versiones firmadas. Las actualizaciones
        nunca se instalan solas.
      </p>
      {confirming && (
        <ConfirmUpdate
          release={confirming}
          onAnswer={(yes) => {
            setConfirming(null);
            if (yes) install(confirming);
          }}
        />
      )}
    </>
  );
}
