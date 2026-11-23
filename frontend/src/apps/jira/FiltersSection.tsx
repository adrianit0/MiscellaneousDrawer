import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import { Confirm } from './Confirm';
import {
  describe,
  emptyFilter,
  MAX_DAYS,
  MAX_FILTER_NAME,
  MAX_FILTERS,
  MODE_LABELS,
  NO_PRIORITY,
  type Criteria,
  type Dates,
  type FilterDraft,
  type Mode,
  type SavedFilter,
  type Values,
} from './filters';
import styles from './jira.module.css';
import { errorMessage, normalize, UNASSIGNED, type JiraPriority } from './types';

interface SectionProps {
  filters: SavedFilter[];
  /** Su subruta: '/filters', '/filters/new' o '/filters/<id>'. */
  path: string;
  /** JR-47: los nombres de los estados de todos los tableros. */
  statusNames: string[];
  /** JR-47: las personas de los tickets ya consultados. */
  people: string[];
  onChanged: () => void;
}

/** JR-26, JR-47: la lista de filtros y su editor. */
export function FiltersSection({ filters, path, statusNames, people, onChanged }: SectionProps) {
  const { api, navigate, notify } = useMiniApp();
  const [deleting, setDeleting] = useState<SavedFilter | null>(null);

  const editing = path === '/filters/new' ? 'new' : path.startsWith('/filters/') ? Number(path.slice('/filters/'.length)) : null;
  const filter = typeof editing === 'number' ? filters.find((f) => f.id === editing) : undefined;

  /** JR-26 */
  const remove = async (f: SavedFilter) => {
    setDeleting(null);
    try {
      await api.delete(`/filters/${f.id}`);
      notify(`Filtro «${f.name}» borrado.`);
      onChanged();
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  if (editing !== null) {
    if (editing !== 'new' && !filter) {
      return (
        <div className={styles.panel}>
          <p>El filtro no existe.</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => navigate('/filters')}>
              Volver a la lista
            </button>
          </div>
        </div>
      );
    }
    return (
      <FilterEditor
        key={filter?.id ?? 'new'}
        initial={filter ? { ...filter } : emptyFilter()}
        statusNames={statusNames}
        people={people}
        onCancel={() => navigate('/filters')}
        onSaved={(saved) => {
          onChanged();
          notify(`Filtro «${saved.name}» guardado.`);
          navigate('/filters');
        }}
      />
    );
  }

  return (
    <section className={styles.boardList} aria-label="Filtros guardados">
      <div className={styles.toolbar}>
        <button type="button" className={styles.primary} disabled={filters.length >= MAX_FILTERS} onClick={() => navigate('/filters/new')}>
          Nuevo filtro
        </button>
        {filters.length >= MAX_FILTERS && <span className={styles.muted}>Puede haber {MAX_FILTERS} filtros como mucho.</span>}
      </div>
      {filters.length === 0 && (
        <p className={styles.notice}>
          Crea un filtro para ver solo los tickets que te interesan. Sirve en todos los tableros y aparece bajo sus pestañas.
        </p>
      )}
      {filters.length > 0 && (
        <ul className={styles.list}>
          {filters.map((f) => (
            <li key={f.id} className={styles.panel}>
              <div className={styles.listItem}>
                <div>
                  <strong>{f.name}</strong>
                  <div className={styles.muted}>{describe(f)}</div>
                </div>
                <div className={styles.actions}>
                  <button type="button" onClick={() => navigate(`/filters/${f.id}`)} aria-label={`Editar ${f.name}`}>
                    Editar
                  </button>
                  <button type="button" onClick={() => setDeleting(f)} aria-label={`Borrar ${f.name}`}>
                    Borrar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleting && (
        <Confirm title="Borrar filtro" action="Borrar" onAnswer={(yes) => (yes ? void remove(deleting) : setDeleting(null))}>
          <p>Se borrará el filtro «{deleting.name}». No se puede deshacer.</p>
        </Confirm>
      )}
    </section>
  );
}

/** Una lista en el editor: 'any' es que no se aplica. */
interface ValuesDraft {
  mode: Mode | 'any';
  values: string[];
  none: boolean;
}

/** Las fechas en el editor, como texto de sus campos. */
interface DatesDraft {
  more: string;
  less: string;
  from: string;
  to: string;
}

interface EditorDraft {
  name: string;
  statuses: ValuesDraft;
  priorities: ValuesDraft;
  assignees: ValuesDraft;
  created: DatesDraft;
  updated: DatesDraft;
}

const valuesDraft = (v: Values | null): ValuesDraft => (v ? { ...v } : { mode: 'any', values: [], none: false });
const datesDraft = (d: Dates | null): DatesDraft => ({
  more: d?.moreThanDays?.toString() ?? '',
  less: d?.lessThanDays?.toString() ?? '',
  from: d?.from ?? '',
  to: d?.to ?? '',
});

const toValues = (v: ValuesDraft): Values | null => (v.mode === 'any' ? null : { mode: v.mode, values: v.values, none: v.none });
/** Un número de días escrito; lo que no es un número se manda tal cual para que el servidor lo rechace (JR-27). */
const toDays = (text: string): number | null => (text.trim() === '' ? null : Number(text));
function toDates(d: DatesDraft): Dates | null {
  const out: Dates = { moreThanDays: toDays(d.more), lessThanDays: toDays(d.less), from: d.from || null, to: d.to || null };
  return Object.values(out).every((v) => v === null) ? null : out;
}

function toBody(draft: EditorDraft): Criteria & { name: string } {
  return {
    name: draft.name.trim(),
    statuses: toValues(draft.statuses),
    priorities: toValues(draft.priorities),
    assignees: toValues(draft.assignees),
    created: toDates(draft.created),
    updated: toDates(draft.updated),
  };
}

const includes = (list: string[], value: string) => list.some((v) => normalize(v.trim()) === normalize(value.trim()));

interface ValuesProps {
  legend: string;
  value: ValuesDraft;
  onChange: (next: ValuesDraft) => void;
  options: string[];
  /** «Sin prioridad» o «Sin asignar»; los estados no lo tienen. */
  noneLabel?: string;
  /** JR-47: los asignados también se pueden escribir. */
  free?: boolean;
  error: string | null;
  children?: ReactNode;
}

/** JR-47: «Estados», «Prioridades» o «Asignados»: la condición y su lista. */
function ValuesCriterion({ legend, value, onChange, options, noneLabel, free, error, children }: ValuesProps) {
  const [written, setWritten] = useState('');
  const add = (name: string) => {
    if (noneLabel && name === noneLabel) onChange({ ...value, none: true });
    else if (name.trim() !== '' && !includes(value.values, name)) onChange({ ...value, values: [...value.values, name.trim()] });
  };
  const freeOptions = options.filter((o) => !includes(value.values, o));
  const chosen = [...value.values, ...(value.none && noneLabel ? [noneLabel] : [])];
  return (
    <fieldset>
      <legend>{legend}</legend>
      <select
        aria-label={`Condición de ${legend}`}
        value={value.mode}
        onChange={(e) => onChange({ ...value, mode: e.target.value as ValuesDraft['mode'] })}
      >
        <option value="any">Cualquiera</option>
        <option value="include">{MODE_LABELS.include}</option>
        <option value="exclude">{MODE_LABELS.exclude}</option>
      </select>
      {value.mode !== 'any' && (
        <>
          <ul className={styles.chips} aria-label={`${legend} elegidos`}>
            {chosen.map((v) => (
              <li key={v} className={styles.chip}>
                {v}
                <button
                  type="button"
                  className={styles.link}
                  aria-label={`Quitar ${v} de ${legend}`}
                  onClick={() =>
                    onChange(v === noneLabel && value.none ? { ...value, none: false } : { ...value, values: value.values.filter((x) => x !== v) })
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.row}>
            <select aria-label={`Añadir a ${legend}`} value="" onChange={(e) => add(e.target.value)}>
              <option value="">Añadir…</option>
              {noneLabel && !value.none && <option value={noneLabel}>{noneLabel}</option>}
              {freeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {free && (
              <>
                <input
                  aria-label="Escribir un nombre"
                  placeholder="Otro nombre"
                  value={written}
                  maxLength={255}
                  onChange={(e) => setWritten(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      add(written);
                      setWritten('');
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={written.trim() === ''}
                  onClick={() => {
                    add(written);
                    setWritten('');
                  }}
                >
                  Añadir nombre
                </button>
              </>
            )}
          </div>
          {children}
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function Days({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={styles.inline}>
      <span>{label.split(': ')[1]}</span>
      <input type="number" min={0} max={MAX_DAYS} step={1} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      <span>días</span>
    </label>
  );
}

function Day({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={styles.inline}>
      <span>{label.split(': ')[1]}</span>
      <input type="date" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

interface EditorProps {
  initial: FilterDraft;
  statusNames: string[];
  people: string[];
  onCancel: () => void;
  onSaved: (filter: SavedFilter) => void;
}

/** JR-47: el editor de un filtro. */
function FilterEditor({ initial, statusNames, people, onCancel, onSaved }: EditorProps) {
  const { api } = useMiniApp();
  const [draft, setDraft] = useState<EditorDraft>(() => ({
    name: initial.name,
    statuses: valuesDraft(initial.statuses),
    priorities: valuesDraft(initial.priorities),
    assignees: valuesDraft(initial.assignees),
    created: datesDraft(initial.created),
    updated: datesDraft(initial.updated),
  }));
  const [priorities, setPriorities] = useState<JiraPriority[] | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [prioritiesEpoch, setPrioritiesEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);

  // JR-47: las prioridades de Jira (JR-19).
  useEffect(() => {
    let current = true;
    setPriorityError(null);
    api
      .get<{ priorities: JiraPriority[] }>('/priorities')
      .then((r) => current && setPriorities(r.priorities))
      .catch((e: unknown) => current && setPriorityError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [api, prioritiesEpoch]);

  const set = <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setDate = (key: 'created' | 'updated', part: keyof DatesDraft, value: string) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], [part]: value } }));
  const fieldError = (field: string) => (error && error.field === field ? error.text : null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = toBody(draft);
      const saved =
        initial.id === null
          ? await api.post<SavedFilter>('/filters', body)
          : await api.put<SavedFilter>(`/filters/${initial.id}`, body);
      onSaved(saved);
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { field?: string } | null) : null;
      setError({ field: details?.field ?? null, text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const generic = error && !['statuses', 'priorities', 'assignees', 'created', 'updated'].includes(error.field ?? '') ? error.text : null;

  return (
    <form
      className={`${styles.editor} ${styles.filterEditor}`}
      aria-label={initial.id === null ? 'Nuevo filtro' : `Editar ${initial.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className={styles.field}>
        <span>Nombre</span>
        <input
          value={draft.name}
          maxLength={MAX_FILTER_NAME}
          aria-invalid={error?.field === 'name' ? 'true' : undefined}
          onChange={(e) => set('name', e.target.value)}
        />
      </label>
      <p className={styles.muted}>Todos los criterios son opcionales; un ticket tiene que cumplir todos los que elijas.</p>

      <ValuesCriterion
        legend="Estados"
        value={draft.statuses}
        onChange={(v) => set('statuses', v)}
        options={statusNames}
        error={fieldError('statuses')}
      />
      <ValuesCriterion
        legend="Prioridades"
        value={draft.priorities}
        onChange={(v) => set('priorities', v)}
        options={(priorities ?? []).map((p) => p.name)}
        noneLabel={NO_PRIORITY}
        error={fieldError('priorities')}
      >
        {priorities === null && !priorityError && <p className={styles.muted}>Cargando las prioridades de Jira…</p>}
        {priorityError && (
          <div className={styles.actions}>
            <span className={styles.error}>{priorityError}</span>
            <button type="button" onClick={() => setPrioritiesEpoch((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        )}
      </ValuesCriterion>
      <ValuesCriterion
        legend="Asignados"
        value={draft.assignees}
        onChange={(v) => set('assignees', v)}
        options={people}
        noneLabel={UNASSIGNED}
        free
        error={fieldError('assignees')}
      />

      <fieldset>
        <legend>Antigüedad</legend>
        <p className={styles.muted}>Días desde que se creó el ticket.</p>
        <div className={styles.row}>
          <Days label="Antigüedad: Más de" value={draft.created.more} onChange={(v) => setDate('created', 'more', v)} />
          <Days label="Antigüedad: Menos de" value={draft.created.less} onChange={(v) => setDate('created', 'less', v)} />
        </div>
      </fieldset>
      <fieldset>
        <legend>Creado</legend>
        <div className={styles.row}>
          <Day label="Creado: Desde" value={draft.created.from} onChange={(v) => setDate('created', 'from', v)} />
          <Day label="Creado: Hasta" value={draft.created.to} onChange={(v) => setDate('created', 'to', v)} />
        </div>
        {fieldError('created') && (
          <p className={styles.error} role="alert">
            {fieldError('created')}
          </p>
        )}
      </fieldset>
      <fieldset>
        <legend>Actualizado</legend>
        <div className={styles.row}>
          <Days label="Actualizado: Hace más de" value={draft.updated.more} onChange={(v) => setDate('updated', 'more', v)} />
          <Days label="Actualizado: Hace menos de" value={draft.updated.less} onChange={(v) => setDate('updated', 'less', v)} />
          <Day label="Actualizado: Desde" value={draft.updated.from} onChange={(v) => setDate('updated', 'from', v)} />
          <Day label="Actualizado: Hasta" value={draft.updated.to} onChange={(v) => setDate('updated', 'to', v)} />
        </div>
        {fieldError('updated') && (
          <p className={styles.error} role="alert">
            {fieldError('updated')}
          </p>
        )}
      </fieldset>

      {generic && (
        <p className={styles.error} role="alert">
          {generic}
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
