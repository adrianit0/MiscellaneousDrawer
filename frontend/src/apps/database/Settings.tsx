import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import { Confirm } from './Confirm';
import styles from './database.module.css';
import { MAX_SH_BYTES, parseSh, type Skipped } from './shImport';
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

/** Los campos que se comparan con lo guardado (BD-67): todos menos la contraseña. */
const SAVED_FIELDS = [...TEXT_FIELDS, 'hostPort', 'containerPort'] as const;

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

/** BD-66: lo que dice la última importación. */
interface Report {
  text: string;
  skipped: Skipped[];
}

function report(file: string, filled: number, skipped: Skipped[]): Report {
  if (filled === 0 && skipped.length === 0) {
    return { text: `${file} no tiene ninguna de las variables que se pueden importar.`, skipped };
  }
  const text =
    filled === 0
      ? `No se ha rellenado ningún campo con ${file}.`
      : filled === 1
        ? `Se ha rellenado 1 campo con ${file}. Revísalo y pulsa «Guardar».`
        : `Se han rellenado ${filled} campos con ${file}. Revísalos y pulsa «Guardar».`;
  return { text, skipped };
}

interface Props {
  config: ConfigView;
  onSaved: (config: ConfigView) => void;
  /** BD-67: si hay cambios sin guardar. */
  onDirtyChange: (dirty: boolean) => void;
  /** BD-67: se ha pulsado otra sección con cambios sin guardar. */
  leaving: boolean;
  /** BD-67: la respuesta al diálogo; true para cambiar de sección. */
  onLeave: (go: boolean) => void;
}

/**
 * BD-65, BD-01, BD-02: la configuración, escrita a mano o importada de un .sh (BD-66). La contraseña solo se envía si
 * se escribe. Con cambios sin guardar, cambiar de sección pide confirmación (BD-67).
 */
export function Settings({ config, onSaved, onDirtyChange, leaving, onLeave }: Props) {
  const { api, notify } = useMiniApp();
  const [values, setValues] = useState<Values>(() => initial(config));
  const [clearPassword, setClearPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);
  const [imported, setImported] = useState<Report | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const saved = useMemo(() => initial(config), [config]);
  const dirty = values.rootPassword !== '' || clearPassword || SAVED_FIELDS.some((key) => values[key].trim() !== saved[key]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  /** Devuelve si se ha guardado. */
  const save = async (): Promise<boolean> => {
    const body: Record<string, unknown> = {};
    for (const key of TEXT_FIELDS) body[key] = values[key].trim() === '' ? null : values[key].trim();
    body.hostPort = port(values.hostPort);
    body.containerPort = port(values.containerPort);
    // BD-02: sin escribirla se conserva la guardada; vacía la borra.
    if (values.rootPassword !== '') body.rootPassword = values.rootPassword;
    else if (clearPassword) body.rootPassword = '';
    setSaving(true);
    setError(null);
    try {
      const result = await api.put<ConfigView>('/config', body);
      onSaved(result);
      setValues(initial(result));
      setClearPassword(false);
      setImported(null);
      notify('Configuración guardada.');
      return true;
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { field?: string } | null) : null;
      setError({ field: details?.field ?? null, text: errorMessage(e) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** BD-67: «Salir sin guardar». */
  const discard = () => {
    setValues(saved);
    setClearPassword(false);
    setError(null);
    setImported(null);
  };

  /** BD-66: el fichero se lee aquí y no se envía a ningún sitio; solo rellena el formulario. */
  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    // Para poder elegir otra vez el mismo fichero.
    input.value = '';
    if (!file) return;
    if (file.size > MAX_SH_BYTES) {
      setImported({ text: `${file.name} ocupa más de 1 MiB: no se importa.`, skipped: [] });
      return;
    }
    const result = parseSh(await file.text());
    setValues((v) => ({ ...v, ...result.values }));
    setImported(report(file.name, Object.keys(result.values).length, result.skipped));
  };

  const answer = async (yes: boolean) => {
    onLeave(yes ? await save() : false);
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
    <>
      <form
        className={styles.settings}
        aria-label="Configuración"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className={styles.importer}>
          <div className={styles.actions}>
            <button type="button" onClick={() => fileInput.current?.click()}>
              Importar de un .sh…
            </button>
            <input ref={fileInput} type="file" accept=".sh" hidden aria-label="Fichero .sh" onChange={(e) => void importFile(e)} />
          </div>
          <div role="status" aria-label="Importación">
            {imported && (
              <>
                <p>{imported.text}</p>
                {imported.skipped.length > 0 && (
                  <>
                    <p>No se han importado:</p>
                    <ul>
                      {imported.skipped.map((s) => (
                        <li key={s.field}>
                          {LABELS[s.field]} ({s.variable}): {s.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {GROUPS.map((g) => (
          <fieldset key={g.title}>
            <legend>{g.title}</legend>
            {g.fields.map(field)}
          </fieldset>
        ))}
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
      {leaving && (
        <Confirm
          title="Cambios sin guardar"
          action="Guardar"
          ready={!saving}
          alternative={{
            label: 'Salir sin guardar',
            onSelect: () => {
              discard();
              onLeave(true);
            },
          }}
          onAnswer={(yes) => void answer(yes)}
        >
          <p>Has cambiado la configuración y no la has guardado. Si sales sin guardar, perderás los cambios.</p>
        </Confirm>
      )}
    </>
  );
}
