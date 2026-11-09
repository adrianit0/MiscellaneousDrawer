import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type AppConfig } from '../api';
import { useUi } from './uiStore';

const CATEGORIES = [{ id: 'general', label: 'General' }] as const;

/** U-06: «Ajustes». */
export function SettingsDialog() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [port, setPort] = useState('');
  const [autoShutdown, setAutoShutdown] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const close = () => useUi.getState().setSettingsOpen(false);

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        const c = s.config ?? { port: 47800, autoShutdownMinutes: null };
        setConfig(c);
        setPort(String(c.port));
        setAutoShutdown(c.autoShutdownMinutes === null ? '' : String(c.autoShutdownMinutes));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (config) firstField.current?.focus();
  }, [config]);

  const save = async () => {
    if (!config) return;
    const next: AppConfig = {
      port: Number(port),
      autoShutdownMinutes: autoShutdown.trim() === '' ? null : Number(autoShutdown),
    };
    setSaving(true);
    setError(null);
    try {
      await api.saveSettings({ config: next });
      useUi.getState().notify(
        next.port !== config.port ? 'Ajustes guardados. El puerto nuevo se usará al siguiente arranque.' : 'Ajustes guardados.',
      );
      close();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron guardar los ajustes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <div
        className="dialog settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      >
        <header className="dialog-header">
          <h2 id="settings-title">Ajustes</h2>
          <button type="button" className="icon-button" aria-label="Cerrar ajustes" onClick={close}>
            ×
          </button>
        </header>
        <div className="settings-body">
          <ul className="settings-categories" aria-label="Categorías">
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <button type="button" aria-current="true">
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="settings-content"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h3>General</h3>
            {!config && !error && <p className="muted">Cargando…</p>}
            {config && (
              <>
                <label className="field">
                  <span>Puerto</span>
                  <input
                    ref={firstField}
                    type="number"
                    min={1024}
                    max={65535}
                    required
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                  />
                  <small className="muted">Se aplica al siguiente arranque.</small>
                </label>
                <label className="field">
                  <span>Apagado automático (minutos sin ventanas)</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    placeholder="Desactivado"
                    value={autoShutdown}
                    onChange={(e) => setAutoShutdown(e.target.value)}
                  />
                  <small className="muted">Vacío: sigue en marcha aunque la ventana se pierda sin cerrarse.</small>
                </label>
              </>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        </div>
        <footer className="dialog-footer">
          <button type="button" onClick={close}>
            Cerrar
          </button>
          <button type="button" className="primary" disabled={!config || saving} onClick={() => void save()}>
            Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}
