import { useState } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import styles from './database.module.css';
import { errorMessage, LABELS, TEXT_FIELDS, type ConfigView, type PortField, type TextField } from './types';

/** BD-65: los grupos del formulario. */
const GROUPS: { title: string; fields: (TextField | PortField | 'rootPassword')[] }[] = [
  { title: 'Descarga', fields: ['workDir', 's3Path', 's3Suffix', 'localSuffix'] },
  {
    title: 'Docker y MySQL',
    fields: ['containerName', 'mysqlImage', 'rootPassword', 'hostPort', 'containerPort', 'timeZone', 'initSqlFile', 'secondInitSqlFile'],
  },
  { title: 'Scripts', fields: ['databaseName', 'pendingSqlDir', 'versionsSqlDir'] },
];

/** Formato de cada campo, con marcadores: nada de esto tiene valor en el código (S-32). */
const HINTS: Record<string, string> = {
  workDir: 'Ruta absoluta. Aquí se guardan los volcados, sus copias y la carpeta dynamodb.',
  s3Path: 's3://<bucket>/<prefijo>, sin / final.',
  s3Suffix: 'El fichero en S3 es BBDD_<rama><sufijo>.',
  localSuffix: 'El volcado local es BBDD_<rama><sufijo>.',
  hostPort: 'Entre 1 y 65535.',
  containerPort: 'Entre 1 y 65535.',
  timeZone: 'Por ejemplo, Europe/Madrid.',
  initSqlFile: 'Ruta absoluta. Se ejecuta al terminar de importar.',
  secondInitSqlFile: 'Ruta absoluta. Se ejecuta después del script inicial.',
  pendingSqlDir: 'Ruta absoluta de la carpeta con los scripts por ejecutar.',
  versionsSqlDir: 'Ruta absoluta. Cada subcarpeta es una versión. Opcional.',
};

type Values = Record<string, string>;

function initial(config: ConfigView): Values {
  const values: Values = { rootPassword: '' };
  for (const key of TEXT_FIELDS) values[key] = config[key] ?? '';
  values.hostPort = config.hostPort === null ? '' : String(config.hostPort);
  values.containerPort = config.containerPort === null ? '' : String(config.containerPort);
  return values;
}

const port = (text: string): number | string | null => {
  const value = text.trim();
  if (value === '') return null;
  // Lo que no es un número entero se envía tal cual: el servidor dice qué campo está mal.
  return /^\d+$/.test(value) ? Number(value) : value;
};

interface Props {
  config: ConfigView;
  onSaved: (config: ConfigView) => void;
}

/** BD-65, BD-01, BD-02: la configuración, escrita a mano. La contraseña solo se envía si se escribe. */
export function Settings({ config, onSaved }: Props) {
  const { api, notify } = useMiniApp();
  const [values, setValues] = useState<Values>(() => initial(config));
  const [notifyOnFinish, setNotifyOnFinish] = useState(config.notifyOnFinish);
  const [clearPassword, setClearPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);

  const save = async () => {
    const body: Record<string, unknown> = { notifyOnFinish };
    for (const key of TEXT_FIELDS) body[key] = values[key].trim() === '' ? null : values[key].trim();
    body.hostPort = port(values.hostPort);
    body.containerPort = port(values.containerPort);
    // BD-02: sin escribirla se conserva la guardada; vacía la borra.
    if (values.rootPassword !== '') body.rootPassword = values.rootPassword;
    else if (clearPassword) body.rootPassword = '';
    setSaving(true);
    setError(null);
    try {
      const saved = await api.put<ConfigView>('/config', body);
      onSaved(saved);
      setValues(initial(saved));
      setClearPassword(false);
      notify('Configuración guardada.');
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { field?: string } | null) : null;
      setError({ field: details?.field ?? null, text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: string) => {
    const password = key === 'rootPassword';
    const hint = password
      ? config.rootPasswordSet
        ? 'Hay una contraseña guardada. Escribe otra para cambiarla.'
        : 'No hay ninguna contraseña guardada.'
      : HINTS[key];
    const invalid = error?.field === key;
    return (
      <div key={key} className={styles.field}>
        <label className={styles.field}>
          <span>{LABELS[key]}</span>
          <input
            type={password ? 'password' : 'text'}
            inputMode={key.endsWith('Port') ? 'numeric' : undefined}
            autoComplete={password ? 'new-password' : 'off'}
            spellCheck={false}
            value={values[key]}
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? `database-hint-${key}` : undefined}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
        {hint && (
          <small id={`database-hint-${key}`} className={styles.muted}>
            {hint}
          </small>
        )}
        {invalid && (
          <small className={styles.error} role="alert">
            {error.text}
          </small>
        )}
        {password && config.rootPasswordSet && (
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
      className={styles.settings}
      aria-label="Configuración"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {GROUPS.map((g) => (
        <fieldset key={g.title}>
          <legend>{g.title}</legend>
          {g.fields.map(field)}
        </fieldset>
      ))}
      <fieldset>
        <legend>Avisos</legend>
        <label className={styles.inline}>
          <input type="checkbox" checked={notifyOnFinish} onChange={(e) => setNotifyOnFinish(e.target.checked)} />
          {LABELS.notifyOnFinish}: notificación de escritorio y sonido
        </label>
      </fieldset>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={saving}>
          Guardar
        </button>
        {error && error.field === null && (
          <span className={styles.error} role="alert">
            {error.text}
          </span>
        )}
      </div>
      <p className={styles.muted}>
        Estos valores se guardan solo en este equipo, en un fichero privado. La contraseña no vuelve a mostrarse.
      </p>
    </form>
  );
}
