import { useState } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import styles from './processes.module.css';
import { errorMessage, FIELDS, LABELS, type Field, type Profile } from './types';

const HINTS: Record<Field, string> = {
  name: 'Cómo se ve el perfil en la lista.',
  processPattern:
    'Expresión regular que se busca en la línea de comandos de cada proceso, como pkill -f. Distingue mayúsculas de minúsculas.',
  portFrom: 'Se cierran los procesos que escuchan en un puerto TCP del rango.',
  portTo: 'Para un solo puerto, el mismo que el inicial.',
};

type Values = Record<Field, string>;

function initial(profile: Profile | null): Values {
  return {
    name: profile?.name ?? '',
    processPattern: profile?.processPattern ?? '',
    portFrom: profile?.portFrom?.toString() ?? '',
    portTo: profile?.portTo?.toString() ?? '',
  };
}

/** Un puerto escrito: vacío es null y, si no son cifras, viaja como texto para que el servidor diga el error (CP-03). */
function port(text: string): number | string | null {
  const value = text.trim();
  if (value === '') return null;
  return /^\d{1,9}$/.test(value) ? Number(value) : value;
}

interface Props {
  /** El perfil que se edita; null para uno nuevo. */
  profile: Profile | null;
  onSaved: (profile: Profile) => void;
  onCancel: () => void;
}

/** CP-34: el formulario de un perfil. El formato lo valida el servidor (CP-03). */
export function ProfileForm({ profile, onSaved, onCancel }: Props) {
  const { api, notify } = useMiniApp();
  const [values, setValues] = useState<Values>(() => initial(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);
  const title = profile ? 'Editar perfil' : 'Nuevo perfil';

  const save = async () => {
    const body = {
      name: values.name.trim(),
      processPattern: values.processPattern.trim() === '' ? null : values.processPattern.trim(),
      portFrom: port(values.portFrom),
      portTo: port(values.portTo),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = profile ? await api.put<Profile>(`/profiles/${profile.id}`, body) : await api.post<Profile>('/profiles', body);
      notify('Perfil guardado.');
      onSaved(saved);
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { field?: string } | null) : null;
      setError({ field: details?.field ?? null, text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: Field) => {
    const invalid = error?.field === key;
    const numeric = key === 'portFrom' || key === 'portTo';
    return (
      <div key={key} className={styles.field}>
        <label className={styles.field}>
          <span>{LABELS[key]}</span>
          <input
            type="text"
            inputMode={numeric ? 'numeric' : undefined}
            className={key === 'processPattern' ? styles.mono : undefined}
            autoComplete="off"
            spellCheck={false}
            value={values[key]}
            aria-invalid={invalid || undefined}
            aria-describedby={`processes-hint-${key}`}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
        <small id={`processes-hint-${key}`} className={styles.muted}>
          {HINTS[key]}
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
      className={styles.form}
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2>{title}</h2>
      {FIELDS.map(field)}
      {error && error.field === null && (
        <p className={styles.error} role="alert">
          {error.text}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={saving}>
          Guardar
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
