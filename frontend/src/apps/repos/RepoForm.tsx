import { useState } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import styles from './repos.module.css';
import { errorMessage, FIELDS, LABELS, type Field, type Repo } from './types';

const HINTS: Record<Field, string> = {
  name: 'Cómo se ve el repositorio en la lista.',
  dir: 'Ruta absoluta de la copia local. Si no existe, se puede clonar.',
  remoteUrl: 'Como https://servidor/ruta.git o usuario@servidor:ruta.git, sin contraseña: git usa las credenciales que ya tenga.',
  defaultBranch: 'La rama a la que vuelve «Actualizar todas». Vacía: develop.',
};

type Values = Record<Field, string>;

interface Props {
  /** El repositorio que se edita; null para uno nuevo. */
  repo: Repo | null;
  onSaved: (repo: Repo) => void;
  onCancel: () => void;
}

/** RG-45: el formulario de un repositorio. El formato lo valida el servidor (RG-02). */
export function RepoForm({ repo, onSaved, onCancel }: Props) {
  const { api, notify } = useMiniApp();
  const [values, setValues] = useState<Values>(() => ({
    name: repo?.name ?? '',
    dir: repo?.dir ?? '',
    remoteUrl: repo?.remoteUrl ?? '',
    defaultBranch: repo?.defaultBranch ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);
  const title = repo ? 'Editar repositorio' : 'Nuevo repositorio';

  const save = async () => {
    const text = (key: Field) => (values[key].trim() === '' ? null : values[key].trim());
    const body = { name: values.name.trim(), dir: text('dir'), remoteUrl: text('remoteUrl'), defaultBranch: text('defaultBranch') };
    setSaving(true);
    setError(null);
    try {
      const saved = repo ? await api.put<Repo>(`/repos/${repo.id}`, body) : await api.post<Repo>('/repos', body);
      notify('Repositorio guardado.');
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
    return (
      <div key={key} className={styles.field}>
        <label className={styles.field}>
          <span>{LABELS[key]}</span>
          <input
            type="text"
            className={key === 'name' ? undefined : styles.mono}
            autoComplete="off"
            spellCheck={false}
            value={values[key]}
            aria-invalid={invalid || undefined}
            aria-describedby={`repos-hint-${key}`}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
        <small id={`repos-hint-${key}`} className={styles.muted}>
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
