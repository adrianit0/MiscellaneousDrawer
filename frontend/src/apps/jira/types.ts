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

/** JR-18: la paleta, por su clave. */
export const PALETTE = ['gray', 'blue', 'green', 'violet', 'orange', 'cyan', 'gold', 'red'] as const;
export type PaletteColor = (typeof PALETTE)[number];

export const COLOR_LABELS: Record<PaletteColor, string> = {
  gray: 'Gris',
  blue: 'Azul',
  green: 'Verde',
  violet: 'Violeta',
  orange: 'Naranja',
  cyan: 'Cian',
  gold: 'Dorado',
  red: 'Rojo',
};

/** JR-18: la variable del tema de cada color de la paleta. */
export const COLOR_VARIABLES: Record<PaletteColor, string> = {
  gray: 'text-muted',
  blue: 'blue',
  green: 'green',
  violet: 'violet',
  orange: 'orange',
  cyan: 'cyan',
  gold: 'gold',
  red: 'error',
};

/** JR-18: lo que no es de la paleta se ve en gris. */
export function paletteColor(color: string | null | undefined): PaletteColor {
  return (PALETTE as readonly string[]).includes(color ?? '') ? (color as PaletteColor) : 'gray';
}

/** JR-33: el color inicial de un estado, por su categoría de Jira. */
export function categoryColor(category: string): PaletteColor {
  switch (category) {
    case 'new':
      return 'gray';
    case 'done':
      return 'green';
    default:
      return 'blue';
  }
}

/** JR-37: el orden en que las prioridades nuevas toman color. */
export const PRIORITY_COLORS: readonly PaletteColor[] = ['red', 'orange', 'gold', 'blue', 'cyan', 'violet', 'green', 'gray'];

/** JR-37: el primer color de PRIORITY_COLORS que no usa otra prioridad, o gris si se usan todos. */
export function nextPriorityColor(used: readonly string[]): PaletteColor {
  return PRIORITY_COLORS.find((c) => !used.includes(c)) ?? 'gray';
}

/** JR-14: un estado de un proyecto, por su identificador, con su color. */
export interface StatusRef {
  project: string;
  id: string;
  name: string;
  color: PaletteColor;
}

/** JR-19: una prioridad de Jira. */
export interface JiraPriority {
  id: string;
  name: string;
}

/** JR-17: una prioridad del tablero, con su color. */
export interface Priority extends JiraPriority {
  color: PaletteColor;
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
  priorities: Priority[];
}

/** Un tablero en el editor: sin identificador si es nuevo. */
export type Draft = Omit<Board, 'id'> & { id: number | null };

/** JR-20 */
export interface Issue {
  key: string;
  summary: string;
  project: string;
  status: string;
  statusColor: PaletteColor;
  assignee: string | null;
  /** JR-20: color null si el tablero no tiene esa prioridad. */
  priority: { id: string; name: string; color: PaletteColor | null } | null;
  /** JR-20: las fechas tal como las da Jira. */
  created: string | null;
  updated: string | null;
}

export interface MissingStatus extends Omit<StatusRef, 'color'> {
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
/** JR-17 */
export const MAX_PRIORITIES = 20;
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
    priorities: draft.priorities,
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
  priorities: [],
});

/** JR-45: las iniciales de una persona: la primera letra de sus dos primeras palabras, o sus dos primeras letras. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => [...w].filter((ch) => /\p{L}/u.test(ch)).join(''))
    .filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? [...words[0]].slice(0, 2) : [[...words[0]][0], [...words[1]][0]];
  return letters.join('').toLocaleUpperCase('es-ES');
}

/** JR-45: los tonos de los círculos. */
export const HUES = 18;
const HUE_STEP = 360 / HUES;
const SATURATION = 0.65;
const LIGHTNESS = 0.72;

/** JR-45: el tono que sale del nombre (FNV-1a), siempre el mismo para la misma persona. */
function hueSlot(name: string): number {
  let hash = 0x811c9dc5;
  for (const ch of name) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % HUES;
}

/** JR-45: un tono de la rueda como color hexadecimal, con la saturación y la luminosidad fijas. */
export function hueColor(slot: number): string {
  const h = (slot * HUE_STEP) / 60;
  const c = (1 - Math.abs(2 * LIGHTNESS - 1)) * SATURATION;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = LIGHTNESS - c / 2;
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * JR-45: el color de cada persona del tablero. Por orden alfabético, cada una toma el tono de su nombre o, si ya lo
 * tiene otra, el siguiente libre. Con más de HUES personas los tonos se repiten.
 */
export function assigneeColors(names: Iterable<string>): Map<string, string> {
  const ordered = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'es'));
  const taken = new Set<number>();
  const out = new Map<string, string>();
  for (const name of ordered) {
    let slot = hueSlot(name);
    if (taken.size < HUES) {
      while (taken.has(slot)) slot = (slot + 1) % HUES;
    }
    taken.add(slot);
    out.set(name, hueColor(slot));
  }
  return out;
}

/** JR-51: un ticket se compara con los de Gestask sin mayúsculas ni espacios de los extremos. */
export function ticketKey(ticket: string): string {
  return ticket.trim().toUpperCase();
}

/** JR-51: la mini app «Gestask» (GT-122, GT-123). */
export const GESTASK_APP = 'gestask';

/**
 * JR-51: la subruta de Gestask que abre el botón de un ticket: su tarea si ya existe (GT-123) o el formulario de
 * creación con la clave, el resumen y la prioridad (GT-122). Los valores van con encodeURIComponent (P-33).
 */
export function gestaskPath(issue: Issue, exists: boolean): string {
  if (exists) return `/ticket/${encodeURIComponent(issue.key)}`;
  const query = [
    ['ticket', issue.key],
    ['title', issue.summary],
    ...(issue.priority ? [['priority', issue.priority.name]] : []),
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `/new?${query}`;
}
