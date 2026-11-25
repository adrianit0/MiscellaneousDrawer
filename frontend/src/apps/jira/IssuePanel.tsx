import { useEffect, useRef, type ReactNode } from 'react';
import { useAppShortcut } from '../../platform';
import { Adf } from './adf';
import type { DetailCache } from './detailCache';
import styles from './jira.module.css';
import {
  attachmentUrl,
  categoryColor,
  formatDateTime,
  formatSize,
  formatTime,
  MAX_COMMENTS,
  UNASSIGNED,
  type BriefIssue,
  type DetailStatus,
  type IssueDetail,
} from './types';

interface Props {
  issueKey: string;
  siteUrl: string;
  cache: DetailCache;
  /** JR-75: la fecha de actualización con la que el tablero elegido muestra el ticket, o null si no lo muestra. */
  boardUpdated: string | null;
  /** JR-72: abre el detalle de otro ticket. */
  onOpen: (key: string) => void;
  /** JR-70 */
  onClose: () => void;
}

/** JR-71, JR-72: el estado como etiqueta del color de su categoría (JR-33). */
function StatusLabel({ status }: { status: DetailStatus }) {
  return (
    <span className={styles.label} data-paint={categoryColor(status.category)}>
      {status.name}
    </span>
  );
}

/** JR-72: tipo, clave, resumen y estado; pulsarlo abre su detalle. */
function Brief({ issue, onOpen }: { issue: BriefIssue; onOpen: (key: string) => void }) {
  return (
    <button type="button" className={styles.brief} onClick={() => onOpen(issue.key)} aria-label={`Abrir ${issue.key}: ${issue.summary}`}>
      {issue.type && <span className={styles.muted}>{issue.type}</span>}
      <span className={styles.key}>{issue.key}</span>
      <span className={styles.briefSummary}>{issue.summary}</span>
      <StatusLabel status={issue.status} />
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.detailSection} aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** JR-71: la ficha, sin las líneas vacías salvo Estado y Asignado. */
function Facts({ d, onOpen }: { d: IssueDetail; onOpen: (key: string) => void }) {
  const rows: [string, ReactNode][] = [
    ['Estado', <StatusLabel key="s" status={d.status} />],
    ...(d.priority ? ([['Prioridad', d.priority.name]] as [string, ReactNode][]) : []),
    ['Asignado', d.assignee ?? <span className={styles.muted}>{UNASSIGNED}</span>],
    ...(d.reporter ? ([['Informador', d.reporter]] as [string, ReactNode][]) : []),
    ...(d.created ? ([['Creado', formatDateTime(d.created)]] as [string, ReactNode][]) : []),
    ...(d.updated ? ([['Actualizado', formatDateTime(d.updated)]] as [string, ReactNode][]) : []),
    ...(d.parent ? ([['Padre', <Brief key="p" issue={d.parent} onOpen={onOpen} />]] as [string, ReactNode][]) : []),
    ...(d.labels.length > 0 ? ([['Etiquetas', d.labels.join(', ')]] as [string, ReactNode][]) : []),
    ...(d.components.length > 0 ? ([['Componentes', d.components.join(', ')]] as [string, ReactNode][]) : []),
  ];
  return (
    <dl className={styles.facts}>
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** JR-71: los enlaces agrupados por relación, en el orden de Jira. */
function Links({ d, onOpen }: { d: IssueDetail; onOpen: (key: string) => void }) {
  const groups = new Map<string, BriefIssue[]>();
  for (const l of d.links) groups.set(l.relation, [...(groups.get(l.relation) ?? []), l.issue]);
  return (
    <>
      {[...groups].map(([relation, list]) => (
        <div key={relation} className={styles.linkGroup}>
          <h4>{relation}</h4>
          <ul className={styles.plainList}>
            {list.map((i) => (
              <li key={i.key}>
                <Brief issue={i} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function Detail({ d, siteUrl, onOpen }: { d: IssueDetail; siteUrl: string; onOpen: (key: string) => void }) {
  return (
    <>
      <Facts d={d} onOpen={onOpen} />
      <Section title="Descripción">{d.description ? <Adf doc={d.description} /> : <p className={styles.muted}>Sin descripción</p>}</Section>
      {d.subtasks.length > 0 && (
        <Section title="Subtareas">
          <ul className={styles.plainList}>
            {d.subtasks.map((s) => (
              <li key={s.key}>
                <Brief issue={s} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {d.links.length > 0 && (
        <Section title="Enlaces">
          <Links d={d} onOpen={onOpen} />
        </Section>
      )}
      {d.attachments.length > 0 && (
        <Section title="Adjuntos">
          <ul className={styles.plainList}>
            {d.attachments.map((a) => (
              <li key={a.id} className={styles.attachment}>
                {/* JR-73: se abre en el Chrome habitual, con la sesión de Jira (C-16). */}
                <a href={attachmentUrl(siteUrl, a.id)} target="_blank" rel="noreferrer">
                  {a.filename}
                </a>
                <span className={styles.muted}>
                  {[a.mimeType, formatSize(a.size), a.author, formatDateTime(a.created)].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={`Comentarios (${d.comments.length})`}>
        {d.commentsTruncated && <p className={styles.notice}>Se muestran los {MAX_COMMENTS} comentarios más recientes.</p>}
        {d.comments.length === 0 && <p className={styles.muted}>Sin comentarios</p>}
        {d.comments.map((c) => (
          <article key={c.id} className={styles.comment} aria-label={`Comentario de ${c.author ?? 'alguien'}`}>
            <header>
              <strong>{c.author ?? 'Desconocido'}</strong>{' '}
              <span className={styles.muted}>
                {formatDateTime(c.created)}
                {c.updated && c.updated !== c.created ? ' (editado)' : ''}
              </span>
            </header>
            <Adf doc={c.body} />
          </article>
        ))}
      </Section>
    </>
  );
}

/** JR-70 a JR-75: el detalle de un ticket en un panel a la derecha del tablero. */
export function IssuePanel({ issueKey, siteUrl, cache, boardUpdated, onOpen, onClose }: Props) {
  const panel = useRef<HTMLElement>(null);
  const data = cache.data(issueKey);
  const loading = cache.loading(issueKey);
  const error = cache.error(issueKey);
  const needs = cache.needs(issueKey, boardUpdated);

  // JR-75: solo si nunca se consultó o el tablero lo muestra con otra fecha de actualización.
  useEffect(() => {
    if (needs) cache.load(issueKey, boardUpdated);
  }, [needs, issueKey, boardUpdated, cache]);

  // JR-71: al abrirse, y al pasar a otro ticket, el foco va al panel.
  useEffect(() => {
    panel.current?.focus();
  }, [issueKey]);

  // JR-70: Esc lo cierra. El panel solo está montado mientras está abierto.
  useAppShortcut('Escape', () => onClose());

  const shown = data && data.key === issueKey ? data : null;

  return (
    <aside ref={panel} className={styles.detail} aria-label={`Detalle de ${issueKey}`} tabIndex={-1}>
      <div className={styles.detailHead}>
        {shown?.type && <span className={styles.muted}>{shown.type}</span>}
        <a className={styles.key} href={`${siteUrl}/browse/${encodeURIComponent(issueKey)}`} target="_blank" rel="noreferrer">
          {issueKey}
        </a>
        <span className={styles.spacer} />
        {loading && (
          <span className={styles.muted} role="status">
            Cargando…
          </span>
        )}
        {!loading && shown && <span className={styles.muted}>A las {formatTime(shown.fetchedAt)}</span>}
        <button type="button" disabled={loading} onClick={() => cache.load(issueKey, boardUpdated)}>
          Actualizar
        </button>
        <button type="button" className={styles.link} aria-label="Cerrar" title="Cerrar" onClick={onClose}>
          ✕
        </button>
      </div>
      {shown && <h2 className={styles.detailTitle}>{shown.summary}</h2>}
      {error && !loading && (
        <div className={styles.panel} role="alert">
          <p className={styles.error}>{error}</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => cache.load(issueKey, boardUpdated)}>
              Reintentar
            </button>
          </div>
        </div>
      )}
      {shown && <Detail d={shown} siteUrl={siteUrl} onOpen={onOpen} />}
    </aside>
  );
}
