/** Tipos de la API de «Tableros Jira» y utilidades de su interfaz (specs/requisitos/jira.md). */

/** JR-01 a JR-04: la conexión sin el token. */
export interface ConfigView {
  siteUrl: string | null;
  email: string | null;
  tokenSet: boolean;
  missing: string[];
}

/** JR-02: los campos del formulario, en su orden. */
export const FIELDS = ['siteUrl', 'email', 'token'] as const;
export type Field = (typeof FIELDS)[number];

export const LABELS: Record<Field, string> = {
  siteUrl: 'Sitio',
  email: 'Email',
  token: 'Token',
};

/** JR-10 */
export interface Project {
  key: string;
  name: string;
}

/** JR-11 */
export interface JiraStatus {
  id: string;
  name: string;
  category: 'new' | 'indeterminate' | 'done' | string;
}

/** JR-14: un estado de un proyecto, por su identificador. */
export interface StatusRef {
  project: string;
  id: string;
  name: string;
}

export interface Column {
  name: string;
  statuses: StatusRef[];
}

/** JR-13, JR-14 */
export interface Board {
  id: number;
  name: string;
  projects: string[];
  columns: Column[];
}

/** Un tablero en el editor: sin identificador si es nuevo. */
export type Draft = Omit<Board, 'id'> & { id: number | null };

/** JR-20 */
export interface Issue {
  key: string;
  summary: string;
  project: string;
  status: string;
  assignee: string | null;
  updated: string | null;
}

export interface MissingStatus extends StatusRef {
  column: string;
}

/** JR-20 a JR-23 */
export interface BoardIssues {
  board: { id: number; name: string };
  columns: { name: string; issues: Issue[] }[];
  fetchedAt: string;
  truncated: boolean;
  missingStatuses: MissingStatus[];
}

/** JR-13 */
export const MAX_BOARDS = 20;
/** JR-14 */
export const MAX_PROJECTS = 10;
export const MAX_COLUMNS = 12;
export const MAX_NAME = 60;
export const MAX_COLUMN_NAME = 40;
/** JR-21 */
export const RECENT_DAYS = 14;
/** JR-23 */
export const MAX_ISSUES = 1000;

export const UNASSIGNED = 'Sin asignar';

/** JR-42 */
export type Grouping = 'none' | 'project' | 'assignee';

export const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: 'none', label: 'Nada' },
  { value: 'project', label: 'Proyecto' },
  { value: 'assignee', label: 'Asignado' },
];

export const pairOf = (s: { project: string; id: string }) => `${s.project}/${s.id}`;

/** JR-33: la categoría de Jira de un estado, en palabras. */
export function categoryLabel(category: string): string {
  switch (category) {
    case 'new':
      return 'Por hacer';
    case 'done':
      return 'Hecho';
    default:
      return 'En curso';
  }
}

/** JR-43: sin mayúsculas ni acentos. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** JR-43: si el ticket contiene el texto en su clave, su resumen o su asignado. */
export function matches(issue: Issue, filter: string): boolean {
  const wanted = normalize(filter.trim());
  if (wanted === '') return true;
  return [issue.key, issue.summary, issue.assignee ?? UNASSIGNED].some((v) => normalize(v).includes(wanted));
}

/** Una fila del tablero: su nombre (null sin agrupar) y, por columna, sus tickets. */
export interface Row {
  name: string | null;
  columns: Issue[][];
}

/**
 * JR-42: reparte los tickets en filas con las mismas columnas. Por proyecto, en el orden del tablero; por asignado,
 * por nombre y «Sin asignar» la última. Solo salen las filas con algún ticket.
 */
export function rows(columns: Issue[][], grouping: Grouping, projects: string[]): Row[] {
  if (grouping === 'none') return [{ name: null, columns }];
  const keyOf = (i: Issue) => (grouping === 'project' ? i.project : (i.assignee ?? UNASSIGNED));
  const names = new Set<string>();
  columns.forEach((list) => list.forEach((i) => names.add(keyOf(i))));
  let ordered: string[];
  if (grouping === 'project') {
    ordered = [...projects.filter((p) => names.has(p)), ...[...names].filter((n) => !projects.includes(n)).sort()];
  } else {
    ordered = [...names].filter((n) => n !== UNASSIGNED).sort((a, b) => a.localeCompare(b, 'es'));
    if (names.has(UNASSIGNED)) ordered.push(UNASSIGNED);
  }
  return ordered.map((name) => ({ name, columns: columns.map((list) => list.filter((i) => keyOf(i) === name)) }));
}

/** JR-40: la hora de la última consulta. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error inesperado';
}

/** El tablero que se guarda: sin espacios en los extremos de los nombres. */
export function toBody(draft: Draft): Omit<Board, 'id'> {
  return {
    name: draft.name.trim(),
    projects: draft.projects,
    columns: draft.columns.map((c) => ({ name: c.name.trim(), statuses: c.statuses })),
  };
}

export const emptyDraft = (): Draft => ({
  id: null,
  name: '',
  projects: [],
  columns: [
    { name: 'Por hacer', statuses: [] },
    { name: 'En curso', statuses: [] },
    { name: 'Hecho', statuses: [] },
  ],
});
