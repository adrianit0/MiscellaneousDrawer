import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppState, useMiniApp } from '../../platform';
import styles from './jira.module.css';
import {
  assigneeColors,
  errorMessage,
  initials,
  paletteColor,
  formatTime,
  GROUPINGS,
  matches,
  MAX_ISSUES,
  rows,
  UNASSIGNED,
  type Board,
  type BoardIssues,
  type Grouping,
  type Issue,
} from './types';

interface Props {
  boards: Board[];
  siteUrl: string;
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

/** JR-41: clave y estado; resumen; asignado y su círculo; prioridad. */
function Card({ issue, siteUrl, avatar }: { issue: Issue; siteUrl: string; avatar: string | undefined }) {
  return (
    <li className={styles.card} aria-label={issue.key}>
      <div className={styles.cardTop}>
        {/* JR-41: se abre en el Chrome habitual (C-16). */}
        <a className={styles.key} href={`${siteUrl}/browse/${encodeURIComponent(issue.key)}`} target="_blank" rel="noreferrer">
          {issue.key}
        </a>
        <span className={styles.label} data-paint={paletteColor(issue.statusColor)}>
          {issue.status}
        </span>
      </div>
      <div className={styles.summary}>{issue.summary}</div>
      <div className={styles.cardLine}>
        <span className={issue.assignee ? styles.assignee : `${styles.assignee} ${styles.muted}`}>{issue.assignee ?? UNASSIGNED}</span>
        <Avatar name={issue.assignee} color={avatar} />
      </div>
      {issue.priority && (
        <div className={styles.priority} data-paint={paletteColor(issue.priority.color)} aria-label={`Prioridad ${issue.priority.name}`}>
          <span aria-hidden="true">⌃</span> {issue.priority.name}
        </div>
      )}
    </li>
  );
}

/** JR-40 a JR-44: el tablero elegido, con sus columnas, sus filas y el filtro. */
export function BoardView({ boards, siteUrl }: Props) {
  const { api, active, navigate } = useMiniApp();
  const [chosen, setChosen] = useAppState<number | null>('board', null);
  const [groupings, setGroupings] = useAppState<Record<string, Grouping>>('grouping', {});
  const [filter, setFilter] = useState('');
  const [data, setData] = useState<BoardIssues | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const request = useRef(0);

  const board = boards.find((b) => b.id === chosen) ?? boards[0];
  const grouping: Grouping = (board && groupings[String(board.id)]) || 'none';

  // JR-40: al abrirse, al cambiar de tablero y con «Actualizar». Oculta, no consulta (N-05).
  useEffect(() => {
    if (!active || !board) return;
    const mine = ++request.current;
    setLoading(true);
    api
      .get<BoardIssues>(`/boards/${board.id}/issues`)
      .then((r) => {
        if (mine !== request.current) return;
        setData(r);
        setError(null);
      })
      .catch((e: unknown) => {
        if (mine === request.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (mine === request.current) setLoading(false);
      });
  }, [api, active, board?.id, epoch]);

  // Lo de otro tablero no se muestra mientras carga el nuevo.
  const shown = data && board && data.board.id === board.id ? data : null;

  const filtered = useMemo(
    () => (shown ? shown.columns.map((c) => c.issues.filter((i) => matches(i, filter))) : []),
    [shown, filter],
  );
  const grid = useMemo(() => rows(filtered, grouping, board?.projects ?? []), [filtered, grouping, board?.projects]);
  // JR-45: sobre todos los tickets del tablero, no solo los filtrados, para que el color no cambie al filtrar.
  const avatars = useMemo(
    () => assigneeColors((shown?.columns ?? []).flatMap((c) => c.issues.flatMap((i) => (i.assignee ? [i.assignee] : [])))),
    [shown],
  );

  if (!board) {
    return (
      <div className={styles.panel}>
        <p>Todavía no hay ningún tablero.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => navigate('/boards/new')}>
            Crear un tablero
          </button>
        </div>
      </div>
    );
  }

  const columnCount = shown?.columns.length ?? board.columns.length;
  const template = { gridTemplateColumns: `repeat(${columnCount}, minmax(220px, 1fr))` };

  return (
    <section className={styles.boardView} aria-label="Tablero">
      <div className={styles.toolbar}>
        <label className={styles.inline}>
          <span>Tablero</span>
          <select value={board.id} onChange={(e) => setChosen(Number(e.target.value))}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
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
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className={styles.spacer} />
        {loading && (
          <span className={styles.muted} role="status">
            Cargando…
          </span>
        )}
        {!loading && shown && <span className={styles.muted}>Actualizado a las {formatTime(shown.fetchedAt)}</span>}
        <button type="button" disabled={loading} onClick={() => setEpoch((e) => e + 1)}>
          Actualizar
        </button>
      </div>

      {error && (
        <div className={styles.panel} role="alert">
          <p className={styles.error}>{error}</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => setEpoch((e) => e + 1)}>
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
          <div className={styles.grid} style={template}>
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
    </section>
  );
}
