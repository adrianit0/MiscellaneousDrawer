import { useEffect, useMemo, useState } from 'react';
import { useAppState, useMiniApp } from '../../platform';
import { passes, type SavedFilter } from './filters';
import type { DetailCache } from './detailCache';
import type { IssueCache } from './issueCache';
import { IssuePanel } from './IssuePanel';
import styles from './jira.module.css';
import {
  assigneeColors,
  initials,
  paletteColor,
  formatCardDate,
  formatTime,
  GESTASK_APP,
  gestaskPath,
  GROUPINGS,
  matches,
  MAX_ISSUES,
  rows,
  ticketKey,
  ticketPath,
  UNASSIGNED,
  type Board,
  type Grouping,
  type Issue,
} from './types';

interface Props {
  boards: Board[];
  siteUrl: string;
  /** JR-46 */
  cache: IssueCache;
  /** JR-48 */
  filters: SavedFilter[];
  /** JR-51: los tickets que ya son tareas de Gestask, normalizados con ticketKey. */
  gestask: ReadonlySet<string>;
  /** JR-75 */
  detail: DetailCache;
  /** JR-70: el ticket abierto en el panel, o null. */
  openKey: string | null;
}

/** JR-51: «+» crea la tarea en Gestask y «>» abre la que ya existe (P-33). */
function GestaskButton({ issue, exists }: { issue: Issue; exists: boolean }) {
  const { openApp } = useMiniApp();
  const action = exists ? 'Abrir en Gestask' : 'Crear en Gestask';
  return (
    <button
      type="button"
      className={styles.gestask}
      data-exists={exists}
      aria-label={`${action}: ${issue.key}`}
      title={action}
      onClick={() => openApp(GESTASK_APP, gestaskPath(issue, exists))}
    >
      {exists ? '>' : '+'}
    </button>
  );
}

/** JR-45: el círculo con las iniciales del asignado, o «?» en gris si no tiene. */
function Avatar({ name, color }: { name: string | null; color: string | undefined }) {
  const label = name ?? UNASSIGNED;
  return (
    <span
      className={styles.avatar}
      role="img"
      aria-label={label}
      title={label}
      style={name && color ? { background: color } : undefined}
    >
      {name ? initials(name) : '?'}
    </span>
  );
}

/** JR-41: clave, estado y el botón de Gestask; resumen; cliente; creado y actualizado; prioridad; asignado y su círculo. */
function Card({
  issue,
  siteUrl,
  avatar,
  inGestask,
  open,
  onOpen,
}: {
  issue: Issue;
  siteUrl: string;
  avatar: string | undefined;
  inGestask: boolean;
  open: boolean;
  onOpen: () => void;
}) {
  const created = formatCardDate(issue.created);
  const updated = formatCardDate(issue.updated);
  return (
    <li
      className={styles.card}
      aria-label={issue.key}
      aria-current={open ? 'true' : undefined}
      onClick={(e) => {
        // JR-70: la clave y el botón de Gestask hacen lo suyo; el resto de la tarjeta abre el detalle.
        if ((e.target as HTMLElement).closest('a, button:not([data-open])')) return;
        onOpen();
      }}
    >
      <div className={styles.cardTop}>
        {/* JR-41: se abre en el Chrome habitual (C-16). */}
        <a className={styles.key} href={`${siteUrl}/browse/${encodeURIComponent(issue.key)}`} target="_blank" rel="noreferrer">
          {issue.key}
        </a>
        <span className={styles.cardTopEnd}>
          <span className={styles.label} data-paint={paletteColor(issue.statusColor)}>
            {issue.status}
          </span>
          <GestaskButton issue={issue} exists={inGestask} />
        </span>
      </div>
      {/* JR-70: con el teclado se abre desde el resumen. */}
      <button type="button" data-open className={styles.summary} aria-label={`Ver detalle: ${issue.key} ${issue.summary}`}>
        {issue.summary}
      </button>
      {issue.customer && (
        <div className={styles.customer} aria-label={`Cliente ${issue.customer}`}>
          {issue.customer}
        </div>
      )}
      {created && <div className={styles.cardDate}>Creado {created}</div>}
      {updated && <div className={styles.cardDate}>Actualizado {updated}</div>}
      {issue.priority && (
        <div className={styles.priority} data-paint={paletteColor(issue.priority.color)} aria-label={`Prioridad ${issue.priority.name}`}>
          {issue.priority.name}
        </div>
      )}
      <div className={styles.cardLine}>
        <span className={issue.assignee ? styles.assignee : `${styles.assignee} ${styles.muted}`}>{issue.assignee ?? UNASSIGNED}</span>
        <Avatar name={issue.assignee} color={avatar} />
      </div>
    </li>
  );
}

/** JR-40 a JR-48: las pestañas de tableros, la línea de filtros y el tablero elegido con sus columnas y sus filas. */
export function BoardView({ boards, siteUrl, cache, filters, gestask, detail, openKey }: Props) {
  const { active, navigate } = useMiniApp();
  const [chosen, setChosen] = useAppState<number | null>('board', null);
  const [groupings, setGroupings] = useAppState<Record<string, Grouping>>('grouping', {});
  const [activeFilter, setActiveFilter] = useAppState<number | null>('filter', null);
  const [text, setText] = useState('');

  const board = boards.find((b) => b.id === chosen) ?? boards[0];
  const grouping: Grouping = (board && groupings[String(board.id)]) || 'none';
  // JR-48: si el recordado ya no existe, «Todos».
  const filter = filters.find((f) => f.id === activeFilter) ?? null;

  // JR-46: solo si nunca se consultó o cambió su configuración. Oculta, no consulta (N-05).
  const needs = board ? cache.needs(board) : false;
  useEffect(() => {
    if (active && board && needs) cache.load(board);
  }, [active, board, needs, cache]);

  const shown = board ? cache.data(board) : null;
  const loading = board ? cache.loading(board) : false;
  const error = board ? cache.error(board) : null;

  // JR-43, JR-49: el texto y el filtro activo, sin consultar Jira.
  const filtered = useMemo(() => {
    const now = new Date();
    return shown ? shown.columns.map((c) => c.issues.filter((i) => matches(i, text) && (!filter || passes(i, filter, now)))) : [];
  }, [shown, text, filter]);
  const grid = useMemo(() => rows(filtered, grouping, board?.projects ?? []), [filtered, grouping, board?.projects]);
  // JR-45: sobre todos los tickets del tablero, no solo los filtrados, para que el color no cambie al filtrar.
  const avatars = useMemo(
    () => assigneeColors((shown?.columns ?? []).flatMap((c) => c.issues.flatMap((i) => (i.assignee ? [i.assignee] : [])))),
    [shown],
  );

  // JR-70, JR-72: abrir otro ticket deja entrada en el historial; cerrar vuelve a «Tableros».
  const panel = openKey && (
    <IssuePanel
      key="detail"
      issueKey={openKey}
      siteUrl={siteUrl}
      cache={detail}
      boardUpdated={shown?.columns.flatMap((c) => c.issues).find((i) => i.key === openKey)?.updated ?? null}
      onOpen={(key) => navigate(ticketPath(key))}
      onClose={() => navigate('')}
    />
  );

  if (!board) {
    return (
      <div className={styles.boardView}>
      {panel}
      <div className={styles.panel}>
        <p>Todavía no hay ningún tablero.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => navigate('/boards/new')}>
            Crear un tablero
          </button>
        </div>
      </div>
      </div>
    );
  }

  const columnCount = shown?.columns.length ?? board.columns.length;
  const template = { gridTemplateColumns: `repeat(${columnCount}, minmax(220px, 1fr))` };

  return (
    <section className={styles.boardView} aria-label="Tablero">
      {/* JR-40 */}
      <nav className={styles.strip} aria-label="Tableros">
        {boards.map((b) => (
          <button
            key={b.id}
            type="button"
            className={styles.boardTab}
            aria-current={b.id === board.id ? 'page' : undefined}
            onClick={() => setChosen(b.id)}
          >
            {b.name}
          </button>
        ))}
      </nav>

      {/* JR-48 */}
      <div className={styles.strip} role="group" aria-label="Filtros guardados">
        <button type="button" className={styles.filterChip} aria-pressed={filter === null} onClick={() => setActiveFilter(null)}>
          Todos
        </button>
        {filters.map((f) => (
          <button key={f.id} type="button" className={styles.filterChip} aria-pressed={filter?.id === f.id} onClick={() => setActiveFilter(f.id)}>
            {f.name}
          </button>
        ))}
        {filters.length === 0 && (
          <button type="button" className={styles.link} onClick={() => navigate('/filters')}>
            Crear un filtro
          </button>
        )}
      </div>

      <div className={styles.toolbar}>
        <label className={styles.inline}>
          <span>Agrupar por</span>
          <select
            value={grouping}
            onChange={(e) => setGroupings({ ...groupings, [String(board.id)]: e.target.value as Grouping })}
          >
            {GROUPINGS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          aria-label="Filtrar tickets"
          placeholder="Filtrar por clave, resumen o asignado"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <span className={styles.spacer} />
        {loading && (
          <span className={styles.muted} role="status">
            Cargando…
          </span>
        )}
        {!loading && shown && <span className={styles.muted}>Actualizado a las {formatTime(shown.fetchedAt)}</span>}
        <button type="button" disabled={loading} onClick={() => cache.load(board)}>
          Actualizar
        </button>
      </div>

      {error && !loading && (
        <div className={styles.panel} role="alert">
          <p className={styles.error}>{error}</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => cache.load(board)}>
              Reintentar
            </button>
          </div>
        </div>
      )}
      {shown?.truncated && <p className={styles.notice}>Se muestran los {MAX_ISSUES} tickets más recientes.</p>}
      {shown && shown.missingStatuses.length > 0 && (
        <div className={styles.panel} role="status">
          <p className={styles.notice}>
            Estos estados ya no existen en Jira:{' '}
            {shown.missingStatuses.map((s) => `${s.name} (${s.project}, en ${s.column})`).join(', ')}.
          </p>
          <div className={styles.actions}>
            <button type="button" onClick={() => navigate(`/boards/${board.id}`)}>
              Revisar el tablero
            </button>
          </div>
        </div>
      )}

      {shown && (
        <div className={styles.boardScroll}>
          {/* JR-53: los nombres de las columnas, fijos arriba al desplazar el tablero. */}
          <div className={`${styles.grid} ${styles.heads}`} style={template}>
            {shown.columns.map((c, index) => (
              <div key={c.name} className={styles.columnHead}>
                <strong>{c.name}</strong> <span className={styles.count}>{filtered[index]?.length ?? 0}</span>
              </div>
            ))}
          </div>
          {grid.map((row) => {
            const total = row.columns.reduce((n, list) => n + list.length, 0);
            return (
              <section key={row.name ?? '-'} className={styles.lane} aria-label={row.name ?? 'Todos los tickets'}>
                {row.name !== null && (
                  <h3 className={styles.laneHead}>
                    {row.name} <span className={styles.count}>{total}</span>
                  </h3>
                )}
                <div className={styles.grid} style={template}>
                  {row.columns.map((list, index) => (
                    <ul key={shown.columns[index].name} className={styles.column} aria-label={shown.columns[index].name}>
                      {list.map((issue) => (
                        <Card
                          key={issue.key}
                          issue={issue}
                          siteUrl={siteUrl}
                          avatar={issue.assignee ? avatars.get(issue.assignee) : undefined}
                          inGestask={gestask.has(ticketKey(issue.key))}
                          open={issue.key === openKey}
                          onOpen={() => navigate(ticketPath(issue.key))}
                        />
                      ))}
                    </ul>
                  ))}
                </div>
              </section>
            );
          })}
          {grid.length === 0 && <p className={styles.muted}>Ningún ticket coincide.</p>}
        </div>
      )}
      {panel}
    </section>
  );
}
