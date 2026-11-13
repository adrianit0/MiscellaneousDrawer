import { useCallback, useEffect, useState } from 'react';
import { useMiniApp } from '../../platform';
import { Check } from './Check';
import styles from './quality.module.css';
import { Settings } from './Settings';
import { errorMessage, type ConfigView } from './types';

/** CD-40: las secciones y su subruta. */
const SECTIONS = [
  { path: '', label: 'Comprobar' },
  { path: '/settings', label: 'Configuración' },
] as const;

/** «Calidad del dato» (CD-40 a CD-45): comprueba los datos de la base local con scripts SQL. */
export function QualityApp() {
  const { api, path, navigate, setSubtitle } = useMiniApp();
  const section = SECTIONS.find((s) => s.path === path) ?? SECTIONS[0];
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** CD-06: si «Configuración» tiene cambios sin guardar, y la sección a la que se quiere ir mientras se pregunta. */
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [leavingTo, setLeavingTo] = useState<string | null>(null);

  const loadConfig = useCallback(() => {
    api
      .get<ConfigView>('/config')
      .then((c) => {
        setConfig(c);
        setError(null);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [api]);

  useEffect(loadConfig, [loadConfig]);

  useEffect(() => {
    setSubtitle(section.label);
    return () => setSubtitle(null);
  }, [section.label, setSubtitle]);

  // CD-06: si la sección cambia por otro camino (Atrás y Adelante), ya no hay nada que preguntar.
  useEffect(() => setLeavingTo(null), [section.path]);

  /** CD-06: salir de «Configuración» con cambios sin guardar pregunta antes. */
  const go = (target: string) => {
    if (section.path === '/settings' && target !== section.path && settingsDirty) setLeavingTo(target);
    else navigate(target);
  };

  return (
    <div className={styles.app}>
      <nav className={styles.tabs} aria-label="Secciones">
        {SECTIONS.map((s) => (
          <button key={s.path} type="button" aria-current={s === section ? 'page' : undefined} onClick={() => go(s.path)}>
            {s.label}
          </button>
        ))}
      </nav>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!config && !error && <p className={styles.muted}>Cargando…</p>}
      {/* Las dos secciones siguen montadas: «Comprobar» conserva la comprobación y «Configuración», lo escrito (CD-06). */}
      {config && (
        <div hidden={section.path !== ''}>
          <Check config={config} visible={section.path === ''} />
        </div>
      )}
      {config && (
        <div hidden={section.path !== '/settings'}>
          <Settings
            config={config}
            onSaved={setConfig}
            onDirtyChange={setSettingsDirty}
            leaving={leavingTo !== null}
            onLeave={(ok) => {
              if (ok && leavingTo !== null) navigate(leavingTo);
              setLeavingTo(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
