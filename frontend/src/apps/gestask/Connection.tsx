import { useMemo, useState } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import styles from './gestask.module.css';
import { errorMessage, type ConfigView } from './types';

type Field = 'supabaseUrl' | 'publishableKey' | 'email' | 'password';
type Values = Record<Field, string>;

const FIELDS: Field[] = ['supabaseUrl', 'publishableKey', 'email', 'password'];
const TEXT_FIELDS: Field[] = ['supabaseUrl', 'publishableKey', 'email'];

const LABELS: Record<Field, string> = {
  supabaseUrl: 'URL de Supabase',
  publishableKey: 'Clave publicable',
  email: 'Email',
  password: 'Contraseña',
};

/** Con marcadores: nada de esto tiene valor en el código (S-32). */
const HINTS: Partial<Record<Field, string>> = {
  supabaseUrl: 'La del proyecto, como https://<proyecto>.supabase.co. Es el VITE_SUPABASE_URL de la web.',
  publishableKey: 'La clave pública del proyecto. Es el VITE_SUPABASE_PUBLISHABLE_KEY de la web.',
  email: 'El de tu cuenta de Gestask. La cuenta se crea en la web.',
};

function initial(config: ConfigView): Values {
  return {
    supabaseUrl: config.supabaseUrl ?? '',
    publishableKey: config.publishableKey ?? '',
    email: config.email ?? '',
    password: '',
  };
}

interface Props {
  config: ConfigView;
  onSaved: (config: ConfigView) => void;
}

/**
 * GT-01 a GT-06: la conexión con Supabase. La contraseña solo se envía si se escribe y no vuelve a mostrarse. «Probar
 * conexión» inicia sesión con lo guardado.
 */
export function Connection({ config, onSaved }: Props) {
  const { api, notify } = useMiniApp();
  const [values, setValues] = useState<Values>(() => initial(config));
  const [clearPassword, setClearPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);
  const [tested, setTested] = useState<string | null>(null);

  const saved = useMemo(() => initial(config), [config]);
  const dirty = values.password !== '' || clearPassword || TEXT_FIELDS.some((key) => values[key].trim() !== saved[key]);

  const save = async () => {
    const body: Record<string, unknown> = {};
    for (const key of TEXT_FIELDS) body[key] = values[key].trim() === '' ? null : values[key].trim();
    // GT-02: sin escribirla se conserva la guardada; vacía la borra.
    if (values.password !== '') body.password = values.password;
    else if (clearPassword) body.password = '';
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      const result = await api.put<ConfigView>('/config', body);
      setValues(initial(result));
      setClearPassword(false);
      onSaved(result);
      notify('Conexión guardada.');
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { field?: string } | null) : null;
      setError({ field: details?.field ?? null, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  /** GT-06 */
  const test = async () => {
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      await api.post('/connection/test');
      setTested('Conexión correcta: se ha iniciado sesión en Supabase.');
    } catch (e) {
      setError({ field: null, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: Field) => {
    const password = key === 'password';
    const hint = password
      ? config.passwordSet
        ? 'Hay una contraseña guardada. Escribe otra para cambiarla.'
        : 'No hay ninguna contraseña guardada.'
      : HINTS[key];
    const invalid = error?.field === key;
    return (
      <div key={key} className={styles.field}>
        <label className={styles.field}>
          <span>{LABELS[key]}</span>
          <input
            type={password ? 'password' : key === 'email' ? 'email' : 'text'}
            autoComplete={password ? 'new-password' : 'off'}
            spellCheck={false}
            value={values[key]}
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? `gestask-hint-${key}` : undefined}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
        {hint && (
          <small id={`gestask-hint-${key}`} className={styles.muted}>
            {hint}
          </small>
        )}
        {invalid && (
          <small className={styles.error} role="alert">
            {error.text}
          </small>
        )}
        {password && config.passwordSet && (
          <label className={styles.inline}>
            <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} />
            Borrar la contraseña guardada
          </label>
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
      <fieldset>
        <legend>Supabase</legend>
        {FIELDS.map(field)}
      </fieldset>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>
          Guardar
        </button>
        <button
          type="button"
          disabled={busy || dirty || config.missing.length > 0}
          title={dirty ? 'Guarda los cambios antes de probar' : undefined}
          onClick={() => void test()}
        >
          Probar conexión
        </button>
        {error && error.field === null && (
          <span className={styles.error} role="alert">
            {error.text}
          </span>
        )}
        {tested && <span role="status">{tested}</span>}
      </div>
      <p className={styles.muted}>
        Estos valores se guardan solo en este equipo, en un fichero privado, y la contraseña no vuelve a mostrarse.
        Gestask solo contacta con ese proyecto de Supabase, que es el mismo que usa su versión web. Si la sesión caduca,
        se vuelve a iniciar sola.
      </p>
    </form>
  );
}
