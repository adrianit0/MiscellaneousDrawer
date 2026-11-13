import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import { Confirm } from './Confirm';
import styles from './quality.module.css';
import { MAX_SH_BYTES, parseSh, type Skipped } from './shImport';
import { errorMessage, LABELS, TEXT_FIELDS, type ConfigView, type Field } from './types';

/** CD-45: el orden del formulario. */
const FIELDS: Field[] = ['containerName', 'rootPassword', 'databaseName', 'qualitySqlDir'];

/** Formato de cada campo, con marcadores: nada de esto tiene valor en el código (S-32). */
const HINTS: Partial<Record<Field, string>> = {
  containerName: 'El contenedor MySQL de Docker donde está la base local.',
  databaseName: 'La base contra la que se ejecutan los scripts.',
  qualitySqlDir: 'Ruta absoluta de la carpeta con los scripts .sql de calidad.',
};

type Values = Record<Field, string>;

function initial(config: ConfigView): Values {
  return {
    containerName: config.containerName ?? '',
    databaseName: config.databaseName ?? '',
    qualitySqlDir: config.qualitySqlDir ?? '',
    rootPassword: '',
  };
}

/** CD-05: lo que dice la última importación. */
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
  /** CD-06: si hay cambios sin guardar. */
  onDirtyChange: (dirty: boolean) => void;
  /** CD-06: se ha pulsado otra sección con cambios sin guardar. */
  leaving: boolean;
  /** CD-06: la respuesta al diálogo; true para cambiar de sección. */
  onLeave: (go: boolean) => void;
}

/**
 * CD-45, CD-01, CD-02: la configuración, escrita a mano o importada de un .sh (CD-05). La contraseña solo se envía si
 * se escribe. Con cambios sin guardar, cambiar de sección pide confirmación (CD-06).
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
  const dirty = values.rootPassword !== '' || clearPassword || TEXT_FIELDS.some((key) => values[key].trim() !== saved[key]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  /** Devuelve si se ha guardado. */
  const save = async (): Promise<boolean> => {
    const body: Record<string, unknown> = {};
    for (const key of TEXT_FIELDS) body[key] = values[key].trim() === '' ? null : values[key].trim();
    // CD-02: sin escribirla se conserva la guardada; vacía la borra.
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

  /** CD-06: «Salir sin guardar». */
  const discard = () => {
    setValues(saved);
    setClearPassword(false);
    setError(null);
    setImported(null);
  };

  /** CD-05: el fichero se lee aquí y no se envía a ningún sitio; solo rellena el formulario. */
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

  const field = (key: Field) => {
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
            autoComplete={password ? 'new-password' : 'off'}
            spellCheck={false}
            value={values[key]}
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? `quality-hint-${key}` : undefined}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
        {hint && (
          <small id={`quality-hint-${key}`} className={styles.muted}>
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
        <fieldset>
          <legend>Docker y MySQL</legend>
          {FIELDS.map(field)}
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
          Estos valores se guardan solo en este equipo, en un fichero privado. La contraseña no vuelve a mostrarse. Son
          independientes de los de «Base de datos».
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
