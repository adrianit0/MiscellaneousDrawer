import { useCallback, useEffect, useState } from 'react';
import { useMiniApp } from '../../platform';
import styles from './database.module.css';
import { Dumps } from './Dumps';
import { Prepare } from './Prepare';
import { Settings } from './Settings';
import { errorMessage, type Branch, type ConfigView } from './types';

/** BD-60: las secciones y su subruta. */
const SECTIONS = [
  { path: '', label: 'Preparar' },
  { path: '/dumps', label: 'Copias' },
  { path: '/settings', label: 'Configuración' },
] as const;

/** BD-64: un volcado elegido en «Copias» para importarlo en «Preparar». */
export interface ImportChoice {
  branch: Branch;
  dump: string;
}

/** «Base de datos» (BD-60 a BD-65): prepara la base de datos local y guarda copias de sus volcados. */
export function DatabaseApp() {
  const { api, path, navigate, setSubtitle } = useMiniApp();
  const section = SECTIONS.find((s) => s.path === path) ?? SECTIONS[0];
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<ImportChoice | null>(null);

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

  return (
    <div className={styles.app}>
      <nav className={styles.tabs} aria-label="Secciones">
        {SECTIONS.map((s) => (
          <button key={s.path} type="button" aria-current={s === section ? 'page' : undefined} onClick={() => navigate(s.path)}>
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
      {/* «Preparar» sigue montada al cambiar de sección: conserva el trabajo y su registro. */}
      {config && (
        <div hidden={section.path !== ''}>
          <Prepare config={config} visible={section.path === ''} choice={choice} onChoiceUsed={() => setChoice(null)} />
        </div>
      )}
      {config && section.path === '/dumps' && (
        <Dumps
          config={config}
          onImport={(c) => {
            setChoice(c);
            navigate('');
          }}
        />
      )}
      {config && section.path === '/settings' && <Settings config={config} onSaved={setConfig} />}
    </div>
  );
}
