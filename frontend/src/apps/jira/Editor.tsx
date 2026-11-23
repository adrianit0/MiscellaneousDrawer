import { useEffect, useMemo, useRef, useState } from 'react';
import { useMiniApp } from '../../platform';
import { Confirm } from './Confirm';
import styles from './jira.module.css';
import {
  categoryLabel,
  emptyDraft,
  errorMessage,
  MAX_BOARDS,
  MAX_COLUMN_NAME,
  MAX_COLUMNS,
  MAX_NAME,
  MAX_PROJECTS,
  pairOf,
  RECENT_DAYS,
  toBody,
  type Board,
  type Draft,
  type JiraStatus,
  type Project,
  type StatusRef,
} from './types';

/** Los estados de un proyecto: cargando, cargados o con error. */
type Loaded = { state: 'loading' } | { state: 'ok'; list: JiraStatus[] } | { state: 'error'; message: string };

interface SectionProps {
  boards: Board[];
  /** Su subruta: '/boards', '/boards/new' o '/boards/<id>'. */
  path: string;
  /** JR-36: navegar preguntando si hay cambios sin guardar. */
  leave: (target: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onChanged: () => void;
}

/** JR-32: la lista de tableros y su editor. */
export function BoardsSection({ boards, path, leave, onDirtyChange, onChanged }: SectionProps) {
  const { api, navigate, notify } = useMiniApp();
  const [deleting, setDeleting] = useState<Board | null>(null);

  const editing = path === '/boards/new' ? 'new' : path.startsWith('/boards/') ? Number(path.slice('/boards/'.length)) : null;
  const board = typeof editing === 'number' ? boards.find((b) => b.id === editing) : undefined;

  // Sin cambios fuera del editor.
  useEffect(() => {
    if (editing === null) onDirtyChange(false);
  }, [editing, onDirtyChange]);

  /** JR-16 */
  const remove = async (b: Board) => {
    setDeleting(null);
    try {
      await api.delete(`/boards/${b.id}`);
      notify(`Tablero «${b.name}» borrado.`);
      onChanged();
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  if (editing !== null) {
    if (editing !== 'new' && !board) {
      return (
        <div className={styles.panel}>
          <p>El tablero no existe.</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => navigate('/boards')}>
              Volver a la lista
            </button>
          </div>
        </div>
      );
    }
    const initial: Draft = board ? { ...board } : emptyDraft();
    return (
      <Editor
        key={board?.id ?? 'new'}
        initial={initial}
        leave={leave}
        onDirtyChange={onDirtyChange}
        onSaved={(saved) => {
          onDirtyChange(false);
          onChanged();
          notify(`Tablero «${saved.name}» guardado.`);
          navigate('/boards');
        }}
      />
    );
  }

  return (
    <section className={styles.boardList} aria-label="Tableros configurados">
      <div className={styles.toolbar}>
        <button type="button" className={styles.primary} disabled={boards.length >= MAX_BOARDS} onClick={() => navigate('/boards/new')}>
          Nuevo tablero
        </button>
        {boards.length >= MAX_BOARDS && <span className={styles.muted}>Puede haber {MAX_BOARDS} tableros como mucho.</span>}
      </div>
      {boards.length === 0 && <p className={styles.notice}>Crea tu primer tablero: elige sus proyectos, sus columnas y qué estados van en cada una.</p>}
      {boards.length > 0 && (
        <ul className={styles.list}>
          {boards.map((b) => (
            <li key={b.id} className={styles.panel}>
              <div className={styles.listItem}>
                <div>
                  <strong>{b.name}</strong>
                  <div className={styles.muted}>
                    {b.projects.join(', ')} · {b.columns.map((c) => c.name).join(' → ')}
                  </div>
                </div>
                <div className={styles.actions}>
                  <button type="button" onClick={() => navigate(`/boards/${b.id}`)} aria-label={`Editar ${b.name}`}>
                    Editar
                  </button>
                  <button type="button" onClick={() => setDeleting(b)} aria-label={`Borrar ${b.name}`}>
                    Borrar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleting && (
        <Confirm title="Borrar tablero" action="Borrar" onAnswer={(yes) => (yes ? void remove(deleting) : setDeleting(null))}>
          <p>Se borrará el tablero «{deleting.name}» con sus columnas. No se puede deshacer. En Jira no cambia nada.</p>
        </Confirm>
      )}
    </section>
  );
}

interface EditorProps {
  initial: Draft;
  leave: (target: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (board: Board) => void;
}

/** JR-32 a JR-36: el editor de un tablero. */
function Editor({ initial, leave, onDirtyChange, onSaved }: EditorProps) {
  const { api } = useMiniApp();
  const [draft, setDraft] = useState<Draft>(initial);
  const snapshot = useRef(JSON.stringify(toBody(initial)));
  const [statuses, setStatuses] = useState<Record<string, Loaded>>({});
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Project[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<string>());

  const dirty = JSON.stringify(toBody(draft)) !== snapshot.current;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // JR-11, JR-33: los estados de cada proyecto del tablero, una vez.
  useEffect(() => {
    for (const key of draft.projects) {
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      setStatuses((s) => ({ ...s, [key]: { state: 'loading' } }));
      api
        .get<{ statuses: JiraStatus[] }>(`/projects/${encodeURIComponent(key)}/statuses`)
        .then((r) => setStatuses((s) => ({ ...s, [key]: { state: 'ok', list: r.statuses } })))
        .catch((e: unknown) => {
          requested.current.delete(key);
          setStatuses((s) => ({ ...s, [key]: { state: 'error', message: errorMessage(e) } }));
        });
    }
  }, [api, draft.projects]);

  const assigned = useMemo(() => new Set(draft.columns.flatMap((c) => c.statuses.map(pairOf))), [draft.columns]);

  /** JR-34: los estados de Jira de cada proyecto que no están en ninguna columna. */
  const unassigned = useMemo(
    () =>
      draft.projects.map((project) => {
        const loaded = statuses[project];
        const list = loaded?.state === 'ok' ? loaded.list.filter((s) => !assigned.has(pairOf({ project, id: s.id }))) : [];
        return { project, list };
      }),
    [draft.projects, statuses, assigned],
  );

  /** JR-34: un estado guardado que Jira ya no tiene. */
  const gone = (s: StatusRef) => {
    const loaded = statuses[s.project];
    return loaded?.state === 'ok' && !loaded.list.some((j) => j.id === s.id);
  };
  const category = (s: StatusRef) => {
    const loaded = statuses[s.project];
    const found = loaded?.state === 'ok' ? loaded.list.find((j) => j.id === s.id) : undefined;
    return found ? categoryLabel(found.category) : null;
  };

  const search = async () => {
    setSearching(true);
    setSearchError(null);
    try {
      const r = await api.get<{ projects: Project[] }>(`/projects?query=${encodeURIComponent(query.trim())}`);
      setFound(r.projects);
    } catch (e) {
      setSearchError(errorMessage(e));
    } finally {
      setSearching(false);
    }
  };

  const update = (change: (d: Draft) => Draft) => setDraft((d) => change(d));

  const addProject = (key: string) =>
    update((d) => (d.projects.includes(key) || d.projects.length >= MAX_PROJECTS ? d : { ...d, projects: [...d.projects, key] }));

  /** JR-15: quitar un proyecto quita sus estados de las columnas. */
  const removeProject = (key: string) =>
    update((d) => ({
      ...d,
      projects: d.projects.filter((p) => p !== key),
      columns: d.columns.map((c) => ({ ...c, statuses: c.statuses.filter((s) => s.project !== key) })),
    }));

  const setColumn = (index: number, change: (c: Draft['columns'][number]) => Draft['columns'][number]) =>
    update((d) => ({ ...d, columns: d.columns.map((c, i) => (i === index ? change(c) : c)) }));

  const move = (index: number, delta: number) =>
    update((d) => {
      const columns = [...d.columns];
      const [col] = columns.splice(index, 1);
      columns.splice(index + delta, 0, col);
      return { ...d, columns };
    });

  const addStatus = (index: number, pair: string) => {
    const [project, id] = pair.split('/');
    const loaded = statuses[project];
    const status = loaded?.state === 'ok' ? loaded.list.find((s) => s.id === id) : undefined;
    if (!status) return;
    setColumn(index, (c) => ({ ...c, statuses: [...c.statuses, { project, id, name: status.name }] }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = toBody(draft);
      const saved =
        draft.id === null ? await api.post<Board>('/boards', body) : await api.put<Board>(`/boards/${draft.id}`, body);
      snapshot.current = JSON.stringify(toBody(saved));
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const last = draft.columns.length - 1;

  return (
    <form
      className={styles.editor}
      aria-label={draft.id === null ? 'Nuevo tablero' : `Editar ${initial.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className={styles.field}>
        <span>Nombre</span>
        <input value={draft.name} maxLength={MAX_NAME} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} />
      </label>

      <fieldset>
        <legend>Proyectos</legend>
        {draft.projects.length === 0 && <p className={styles.muted}>Añade de 1 a {MAX_PROJECTS} proyectos de Jira.</p>}
        <ul className={styles.chips} aria-label="Proyectos del tablero">
          {draft.projects.map((key) => (
            <li key={key} className={styles.chip}>
              <span className={styles.mono}>{key}</span>
              {statuses[key]?.state === 'error' && (
                <span className={styles.error}> · {(statuses[key] as { message: string }).message}</span>
              )}
              <button type="button" className={styles.link} aria-label={`Quitar ${key}`} onClick={() => removeProject(key)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <input
            aria-label="Buscar proyectos"
            placeholder="Clave o nombre del proyecto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
          />
          <button type="button" disabled={searching} onClick={() => void search()}>
            Buscar
          </button>
        </div>
        {searchError && (
          <p className={styles.error} role="alert">
            {searchError}
          </p>
        )}
        {found && found.length === 0 && <p className={styles.muted}>Ningún proyecto coincide.</p>}
        {found && found.length > 0 && (
          <ul className={styles.results} aria-label="Proyectos encontrados">
            {found.map((p) => (
              <li key={p.key}>
                <span className={styles.mono}>{p.key}</span> {p.name}
                <button
                  type="button"
                  disabled={draft.projects.includes(p.key) || draft.projects.length >= MAX_PROJECTS}
                  aria-label={`Añadir ${p.key}`}
                  onClick={() => addProject(p.key)}
                >
                  {draft.projects.includes(p.key) ? 'Añadido' : 'Añadir'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend>Columnas</legend>
        {/* JR-35 */}
        <p className={styles.muted}>
          La última columna es la de cerrados: solo muestra los tickets actualizados en los últimos {RECENT_DAYS} días.
        </p>
        <ol className={styles.columnsEditor}>
          {draft.columns.map((col, index) => {
            const options = unassigned.filter((u) => u.list.length > 0);
            return (
              <li key={index} className={styles.panel} aria-label={`Columna ${index + 1}`}>
                <div className={styles.actions}>
                  <input
                    aria-label={`Nombre de la columna ${index + 1}`}
                    value={col.name}
                    maxLength={MAX_COLUMN_NAME}
                    onChange={(e) => setColumn(index, (c) => ({ ...c, name: e.target.value }))}
                  />
                  {index === last && <span className={styles.badge}>Cerrados · {RECENT_DAYS} días</span>}
                  <span className={styles.spacer} />
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Subir ${col.name || index + 1}`}>
                    Subir
                  </button>
                  <button type="button" disabled={index === last} onClick={() => move(index, 1)} aria-label={`Bajar ${col.name || index + 1}`}>
                    Bajar
                  </button>
                  <button
                    type="button"
                    disabled={draft.columns.length === 1}
                    onClick={() => update((d) => ({ ...d, columns: d.columns.filter((_, i) => i !== index) }))}
                    aria-label={`Quitar la columna ${col.name || index + 1}`}
                  >
                    Quitar
                  </button>
                </div>
                {draft.projects.map((project) => {
                  const mine = col.statuses.filter((s) => s.project === project);
                  if (mine.length === 0) return null;
                  return (
                    <div key={project} className={styles.statusGroup}>
                      <span className={styles.mono}>{project}</span>
                      <ul className={styles.chips}>
                        {mine.map((s) => (
                          <li key={pairOf(s)} className={styles.chip} data-gone={gone(s) || undefined}>
                            {s.name}
                            {category(s) && <span className={styles.muted}> · {category(s)}</span>}
                            {gone(s) && <span className={styles.warn}> · Ya no existe en Jira</span>}
                            <button
                              type="button"
                              className={styles.link}
                              aria-label={`Quitar ${s.name} de ${project} de ${col.name || index + 1}`}
                              onClick={() =>
                                setColumn(index, (c) => ({ ...c, statuses: c.statuses.filter((x) => pairOf(x) !== pairOf(s)) }))
                              }
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {options.length > 0 && (
                  <select
                    aria-label={`Añadir estado a ${col.name || `la columna ${index + 1}`}`}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addStatus(index, e.target.value);
                    }}
                  >
                    <option value="">Añadir estado…</option>
                    {options.map((u) => (
                      <optgroup key={u.project} label={u.project}>
                        {u.list.map((s) => (
                          <option key={s.id} value={pairOf({ project: u.project, id: s.id })}>
                            {s.name} ({u.project})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ol>
        <div className={styles.actions}>
          <button
            type="button"
            disabled={draft.columns.length >= MAX_COLUMNS}
            onClick={() =>
              update((d) => {
                // Se añade antes de la final, que sigue siendo la de cerrados.
                const columns = [...d.columns];
                columns.splice(Math.max(columns.length - 1, 0), 0, { name: '', statuses: [] });
                return { ...d, columns };
              })
            }
          >
            Añadir columna
          </button>
        </div>
      </fieldset>

      {/* JR-34 */}
      <section className={styles.panel} aria-label="Estados sin columna">
        <strong>Estados sin columna</strong>
        {draft.projects.length === 0 && <p className={styles.muted}>Añade un proyecto para ver sus estados.</p>}
        {unassigned.some((u) => u.list.length > 0) ? (
          <>
            <p className={styles.muted}>Sus tickets no se verán en el tablero.</p>
            {unassigned
              .filter((u) => u.list.length > 0)
              .map((u) => (
                <div key={u.project} className={styles.statusGroup}>
                  <span className={styles.mono}>{u.project}</span>
                  <span>{u.list.map((s) => s.name).join(', ')}</span>
                </div>
              ))}
          </>
        ) : (
          draft.projects.length > 0 &&
          draft.projects.every((p) => statuses[p]?.state === 'ok') && <p className={styles.ok}>Todos los estados tienen columna.</p>
        )}
      </section>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={saving}>
          Guardar
        </button>
        <button type="button" onClick={() => leave('/boards')}>
          Cancelar
        </button>
        {dirty && <span className={styles.muted}>Hay cambios sin guardar.</span>}
      </div>
    </form>
  );
}
