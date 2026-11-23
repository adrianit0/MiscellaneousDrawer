import { useMemo, useState } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import styles from './jira.module.css';
import { FIELDS, LABELS, errorMessage, type ConfigView, type Field } from './types';

type Values = Record<Field, string>;

/** Con marcadores: nada de esto tiene valor en el código (S-32). */
const HINTS: Record<Field, string> = {
  siteUrl: 'La dirección de Jira Cloud de tu empresa, como https://<empresa>.atlassian.net.',
  email: 'El email de tu cuenta de Atlassian, el mismo con que entras en Jira.',
  token: '',
};

const PLACEHOLDERS: Partial<Record<Field, string>> = { siteUrl: 'https://<empresa>.atlassian.net' };

function initial(config: ConfigView): Values {
  return { siteUrl: config.siteUrl ?? '', email: config.email ?? '', token: '' };
}

interface Props {
  config: ConfigView;
  onSaved: (config: ConfigView) => void;
}

/**
 * JR-31: la conexión con Jira Cloud. El token solo se envía si se escribe y no vuelve a mostrarse. «Probar conexión»
 * pide el usuario con lo guardado (JR-06).
 */
export function Connection({ config, onSaved }: Props) {
  const { api, notify } = useMiniApp();
  const [values, setValues] = useState<Values>(() => initial(config));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);
  const [tested, setTested] = useState<string | null>(null);

  const saved = useMemo(() => initial(config), [config]);
  const dirty = values.token !== '' || values.siteUrl.trim() !== saved.siteUrl || values.email.trim() !== saved.email;

  const save = async () => {
    const body: Record<string, unknown> = {
      siteUrl: values.siteUrl.trim() === '' ? null : values.siteUrl.trim(),
      email: values.email.trim() === '' ? null : values.email.trim(),
    };
    // JR-03: sin escribirlo se conserva el guardado.
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

  /** JR-06 */
  const test = async () => {
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      const result = await api.post<{ ok: boolean; user: string }>('/connection/test');
      setTested(`Conexión correcta como ${result.user}.`);
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
        : 'Un token de API de Atlassian. Se crea en id.atlassian.com, en «Seguridad» › «Tokens de API».'
      : HINTS[key];
    const invalid = error?.field === key;
    return (
      <div key={key} className={styles.field}>
        <label className={styles.field}>
          <span>{LABELS[key]}</span>
          <input
            type={token ? 'password' : key === 'email' ? 'email' : 'text'}
            autoComplete={token ? 'new-password' : 'off'}
            spellCheck={false}
            placeholder={PLACEHOLDERS[key]}
            value={values[key]}
            aria-invalid={invalid || undefined}
            aria-describedby={`jira-hint-${key}`}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
        <small id={`jira-hint-${key}`} className={styles.muted}>
          {hint}
        </small>
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
      noValidate
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
        <legend>Jira Cloud</legend>
        {FIELDS.map(field)}
      </fieldset>
      <p className={styles.muted}>La mini app solo lee de Jira: nunca cambia tickets, estados ni proyectos.</p>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>
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
