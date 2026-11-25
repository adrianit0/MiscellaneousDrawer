import { Fragment, type ReactNode } from 'react';
import styles from './jira.module.css';
import type { AdfNode } from './types';

/** JR-74: más niveles de anidamiento que estos no se pintan. */
export const MAX_DEPTH = 50;

/** JR-74: el color de cada tipo de panel; los demás, gris. */
const PANEL_COLORS: Record<string, string> = {
  info: 'blue',
  note: 'blue',
  success: 'green',
  warning: 'gold',
  error: 'red',
};

function isNode(value: unknown): value is AdfNode {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function attr(node: AdfNode, name: string): unknown {
  return node.attrs && typeof node.attrs === 'object' ? node.attrs[name] : undefined;
}

function textAttr(node: AdfNode, name: string): string {
  const value = attr(node, name);
  return typeof value === 'string' ? value : '';
}

function children(node: AdfNode): AdfNode[] {
  return Array.isArray(node.content) ? node.content.filter(isNode) : [];
}

/** JR-74, C-16: solo las URL http o https son enlaces. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** JR-74: el texto que contiene un nodo, para los que no están en la tabla y los bloques de código. */
export function textOf(node: AdfNode, depth = 0): string {
  if (depth > MAX_DEPTH) return '';
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'hardBreak') return '\n';
  const own = textAttr(node, 'text');
  const inner = children(node)
    .map((c) => textOf(c, depth + 1))
    .join('');
  return inner || own;
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

/** JR-74: las marcas de un texto, de dentro afuera en el orden de Jira. */
function marked(node: AdfNode): ReactNode {
  let out: ReactNode = typeof node.text === 'string' ? node.text : '';
  for (const mark of Array.isArray(node.marks) ? node.marks : []) {
    if (!mark || typeof mark.type !== 'string') continue;
    switch (mark.type) {
      case 'strong':
        out = <strong>{out}</strong>;
        break;
      case 'em':
        out = <em>{out}</em>;
        break;
      case 'underline':
        out = <u>{out}</u>;
        break;
      case 'strike':
        out = <s>{out}</s>;
        break;
      case 'code':
        out = <code>{out}</code>;
        break;
      case 'subsup':
        out = mark.attrs?.type === 'sub' ? <sub>{out}</sub> : <sup>{out}</sup>;
        break;
      case 'link': {
        const href = safeUrl(mark.attrs?.href);
        if (href) {
          out = (
            <a href={href} target="_blank" rel="noreferrer">
              {out}
            </a>
          );
        }
        break;
      }
      default:
        // JR-74: textColor y las demás marcas se ignoran.
        break;
    }
  }
  return out;
}

function renderAll(nodes: AdfNode[], depth: number): ReactNode {
  return nodes.map((c, i) => <Fragment key={i}>{renderNode(c, depth)}</Fragment>);
}

/** JR-74: un nodo ADF como elementos de React; React escapa todo el texto, así que nada se interpreta como HTML. */
function renderNode(node: AdfNode, depth: number): ReactNode {
  if (depth > MAX_DEPTH) return null;
  const inner = () => renderAll(children(node), depth + 1);
  switch (node.type) {
    case 'doc':
      return inner();
    case 'paragraph':
      return <p>{inner()}</p>;
    case 'text':
      return marked(node);
    case 'hardBreak':
      return <br />;
    case 'heading': {
      const level = Number(attr(node, 'level'));
      if (level <= 2) return <h4>{inner()}</h4>;
      if (level === 3) return <h5>{inner()}</h5>;
      return <h6>{inner()}</h6>;
    }
    case 'bulletList':
      return <ul>{inner()}</ul>;
    case 'orderedList':
      return <ol start={positive(attr(node, 'order'))}>{inner()}</ol>;
    case 'listItem':
      return <li>{inner()}</li>;
    case 'taskList':
      return <ul className={styles.adfTasks}>{inner()}</ul>;
    case 'taskItem':
      return (
        <li>
          <span aria-hidden="true">{attr(node, 'state') === 'DONE' ? '☑' : '☐'}</span> {inner()}
        </li>
      );
    case 'decisionList':
      return <ul className={styles.adfTasks}>{inner()}</ul>;
    case 'decisionItem':
      return (
        <li>
          <strong>Decisión:</strong> {inner()}
        </li>
      );
    case 'codeBlock':
      return (
        <pre className={styles.adfCode}>
          <code>{textOf(node, depth)}</code>
        </pre>
      );
    case 'blockquote':
      return <blockquote className={styles.adfQuote}>{inner()}</blockquote>;
    case 'rule':
      return <hr />;
    case 'panel':
      return (
        <div className={styles.adfPanel} data-paint={PANEL_COLORS[textAttr(node, 'panelType')] ?? 'gray'}>
          {inner()}
        </div>
      );
    case 'expand':
    case 'nestedExpand':
      return (
        <details className={styles.adfExpand}>
          <summary>{textAttr(node, 'title') || 'Desplegar'}</summary>
          {inner()}
        </details>
      );
    case 'table':
      return (
        <div className={styles.adfTableWrap}>
          <table className={styles.adfTable}>
            <tbody>{inner()}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr>{inner()}</tr>;
    case 'tableHeader':
      return (
        <th colSpan={positive(attr(node, 'colspan'))} rowSpan={positive(attr(node, 'rowspan'))}>
          {inner()}
        </th>
      );
    case 'tableCell':
      return (
        <td colSpan={positive(attr(node, 'colspan'))} rowSpan={positive(attr(node, 'rowspan'))}>
          {inner()}
        </td>
      );
    case 'mention': {
      const name = textAttr(node, 'text');
      return <span className={styles.mention}>{name.startsWith('@') ? name : `@${name}`}</span>;
    }
    case 'emoji':
      return textAttr(node, 'text') || textAttr(node, 'shortName');
    case 'status':
      return <span className={styles.adfStatus}>{textAttr(node, 'text')}</span>;
    case 'date': {
      const ms = Number(attr(node, 'timestamp'));
      const d = new Date(ms);
      return Number.isFinite(ms) && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-ES') : '';
    }
    case 'inlineCard':
    case 'blockCard':
    case 'embedCard': {
      const url = textAttr(node, 'url');
      const href = safeUrl(url);
      return href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {href}
        </a>
      ) : (
        url
      );
    }
    case 'mediaSingle':
    case 'mediaGroup': {
      const list = children(node);
      return list.length > 0 ? inner() : '[Adjunto]';
    }
    case 'media':
    case 'mediaInline': {
      const alt = textAttr(node, 'alt');
      return <span className={styles.muted}>{alt ? `[Adjunto: ${alt}]` : '[Adjunto]'}</span>;
    }
    default:
      // JR-74: un nodo desconocido muestra el texto que contiene.
      return textOf(node, depth);
  }
}

/** JR-74: la descripción o el cuerpo de un comentario, pintados a partir de su ADF. */
export function Adf({ doc }: { doc: unknown }) {
  if (!isNode(doc)) return null;
  return <div className={styles.adf}>{renderNode(doc, 0)}</div>;
}
