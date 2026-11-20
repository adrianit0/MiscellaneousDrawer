import { useMemo, useState } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import styles from './resubmit.module.css';
import { FIELDS, LABELS, errorMessage, type ConfigView, type Field } from './types';

type TextField = Exclude<Field, 'token'>;
type Values = Record<Field, string>;

const TEXT_FIELDS: TextField[] = ['baseUrl', 'projectKey', 'repoSlug', 'username', 'dir', 'targetBranch', 'branchPrefix'];

/** Con marcadores: nada de esto tiene valor en el código (S-32). */
const HINTS: Partial<Record<Field, string>> = {
  baseUrl: 'La dirección de vuestro Bitbucket, como https://<servidor>.',
  projectKey: 'La clave del proyecto, como aparece en …/projects/<PROYECTO>.',
  repoSlug: 'El nombre del repositorio en la URL, como en …/repos/<repositorio>.',
  username: 'Tu usuario de Bitbucket: solo se listan tus PR.',
  dir: 'La carpeta de tu copia local del repositorio. Su remoto «origin» debe ser este repositorio.',
  targetBranch: 'Contra la que se piden los PR de corrección. Si se deja vacía, hotfix.',
  branchPrefix: 'El de las ramas de corrección. Si se deja vacío, bug/.',
};

const PLACEHOLDERS: Partial<Record<Field, string>> = { targetBranch: 'hotfix', branchPrefix: 'bug/' };

function initial(config: ConfigView): Values {
  return {
    baseUrl: config.baseUrl ?? '',
    token: '',
    projectKey: config.projectKey ?? '',
    repoSlug: config.repoSlug ?? '',
    username: config.username ?? '',
    dir: config.dir ?? '',
    targetBranch: config.targetBranch ?? '',
    branchPrefix: config.branchPrefix ?? '',
  };
}

interface Props {
  config: ConfigView;
  /** RP-33: no se guarda con un trabajo en marcha. */
  locked: boolean;
  onSaved: (config: ConfigView) => void;
}

/**
 * RP-41: la conexión con Bitbucket y la copia local. El token solo se envía si se escribe y no vuelve a mostrarse.
 * «Probar conexión» lee el repositorio con lo guardado (RP-05).
 */
export function Connection({ config, locked, onSaved }: Props) {
  const { api, notify } = useMiniApp();
  const [values, setValues] = useState<Values>(() => initial(config));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);
  const [tested, setTested] = useState<string | null>(null);

  const saved = useMemo(() => initial(config), [config]);
  const dirty = values.token !== '' || TEXT_FIELDS.some((key) => values[key].trim() !== saved[key]);

  const save = async () => {
    const body: Record<string, unknown> = {};
    for (const key of TEXT_FIELDS) body[key] = values[key].trim() === '' ? null : values[key].trim();
    // RP-03: sin escribirlo se conserva el guardado.
    if (values.token.trim() !== '') body.token = values.token.trim();
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      const result = await api.put<ConfigView>('/config', body);
      setValues(initial(result));
      onSaved(result);
      notify('Conexión guardada.');
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { field?: string } | null) : null;
      setError({ field: details?.field ?? null, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  /** RP-05 */
  const test = async () => {
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      const result = await api.post<{ ok: boolean; repository: string }>('/connection/test');
      setTested(`Conexión correcta con ${result.repository}.`);
    } catch (e) {
      setError({ field: null, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: Field) => {
    const token = key === 'token';
    const hint = token
      ? config.tokenSet
        ? 'Hay un token guardado. Escribe otro para cambiarlo.'
        : 'Un token de acceso HTTP con permiso de escritura en el repositorio. Se crea en Bitbucket, en tu cuenta.'
      : HINTS[key];
    const invalid = error?.field === key;
    return (
      <div key={key} className={styles.field}>
        <label className={styles.field}>
          <span>{LABELS[key]}</span>
          <input
            type={token ? 'password' : 'text'}
            autoComplete={token ? 'new-password' : 'off'}
            spellCheck={false}
            placeholder={PLACEHOLDERS[key]}
            value={values[key]}
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? `resubmit-hint-${key}` : undefined}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
        {hint && (
          <small id={`resubmit-hint-${key}`} className={styles.muted}>
            {hint}
          </small>
        )}
        {invalid && (
          <small className={styles.error} role="alert">
            {error.text}
          </small>
        )}
      </div>
    );
  };

  return (
    <form
      className={styles.connection}
      aria-label="Conexión"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {config.missing.length > 0 && (
        <p className={styles.notice} role="status">
          Falta configurar: {config.missing.map((k) => LABELS[k as Field] ?? k).join(', ')}.
        </p>
      )}
      <fieldset>
        <legend>Bitbucket</legend>
        {FIELDS.slice(0, 5).map(field)}
      </fieldset>
      <fieldset>
        <legend>Repositorio local</legend>
        {FIELDS.slice(5).map(field)}
      </fieldset>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy || locked}>
          Guardar
        </button>
        <button type="button" disabled={busy || dirty || config.missing.length > 0} onClick={() => void test()}>
          Probar conexión
        </button>
        {dirty && <span className={styles.muted}>Hay cambios sin guardar.</span>}
      </div>
      {tested && (
        <p className={styles.ok} role="status">
          {tested}
        </p>
      )}
      {error && error.field === null && (
        <p className={styles.error} role="alert">
          {error.text}
        </p>
      )}
    </form>
  );
}
