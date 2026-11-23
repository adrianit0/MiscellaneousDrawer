/** Filtros guardados de «Tableros Jira» (JR-26, JR-27, JR-47 a JR-49): sus tipos y cómo se aplican. */
import { normalize, UNASSIGNED, type Issue } from './types';

/** JR-27: «Es uno de» o «No es ninguno de». */
export type Mode = 'include' | 'exclude';

export interface Values {
  mode: Mode;
  values: string[];
  /** «Sin prioridad» o «Sin asignar»; en los estados siempre false. */
  none: boolean;
}

export interface Dates {
  moreThanDays: number | null;
  lessThanDays: number | null;
  /** AAAA-MM-DD, incluido. */
  from: string | null;
  to: string | null;
}

export interface Criteria {
  statuses: Values | null;
  priorities: Values | null;
  assignees: Values | null;
  created: Dates | null;
  updated: Dates | null;
}

/** JR-26 */
export interface SavedFilter extends Criteria {
  id: number;
  name: string;
}

/** JR-26 */
export const MAX_FILTERS = 30;
/** JR-27 */
export const MAX_FILTER_NAME = 40;
export const MAX_DAYS = 3650;
export const NO_PRIORITY = 'Sin prioridad';

export const MODE_LABELS: Record<Mode, string> = {
  include: 'Es uno de',
  exclude: 'No es ninguno de',
};

const DAY = 24 * 60 * 60 * 1000;

/** JR-49: sin mayúsculas, acentos ni espacios de los extremos. */
const same = (a: string, b: string) => normalize(a.trim()) === normalize(b.trim());

/** JR-49: una lista; value null es «Sin prioridad» o «Sin asignar». */
function passesValues(criterion: Values | null, value: string | null): boolean {
  if (!criterion) return true;
  const hit = value === null ? criterion.none : criterion.values.some((v) => same(v, value));
  return criterion.mode === 'include' ? hit : !hit;
}

/** El día local de una fecha, AAAA-MM-DD. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** JR-49: días de 24 horas hacia atrás desde now; desde y hasta, por el día local e incluidos. Sin fecha, no pasa. */
function passesDates(criterion: Dates | null, iso: string | null, now: Date): boolean {
  if (!criterion) return true;
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return false;
  const time = date.getTime();
  if (criterion.moreThanDays !== null && !(time < now.getTime() - criterion.moreThanDays * DAY)) return false;
  if (criterion.lessThanDays !== null && !(time >= now.getTime() - criterion.lessThanDays * DAY)) return false;
  const day = localDay(date);
  if (criterion.from !== null && day < criterion.from) return false;
  if (criterion.to !== null && day > criterion.to) return false;
  return true;
}

/** JR-49: si el ticket cumple todos los criterios del filtro. */
export function passes(issue: Issue, filter: Criteria, now: Date): boolean {
  return (
    passesValues(filter.statuses, issue.status) &&
    passesValues(filter.priorities, issue.priority?.name ?? null) &&
    passesValues(filter.assignees, issue.assignee) &&
    passesDates(filter.created, issue.created, now) &&
    passesDates(filter.updated, issue.updated, now)
  );
}

function describeValues(label: string, criterion: Values | null, noneLabel: string): string | null {
  if (!criterion) return null;
  const all = [...criterion.values, ...(criterion.none ? [noneLabel] : [])].join(', ');
  return `${label} ${criterion.mode === 'include' ? 'es' : 'no es'} ${all}`;
}

function describeDates(label: string, criterion: Dates | null, ago: boolean): string | null {
  if (!criterion) return null;
  const parts: string[] = [];
  const prefix = ago ? 'hace ' : '';
  if (criterion.moreThanDays !== null) parts.push(`${prefix}más de ${criterion.moreThanDays} días`);
  if (criterion.lessThanDays !== null) parts.push(`${prefix}menos de ${criterion.lessThanDays} días`);
  if (criterion.from !== null) parts.push(`desde ${criterion.from}`);
  if (criterion.to !== null) parts.push(`hasta ${criterion.to}`);
  return `${label} ${parts.join(' y ')}`;
}

/** JR-47: el resumen de los criterios en la lista de filtros. */
export function describe(filter: Criteria): string {
  const created = filter.created;
  return [
    describeValues('Estado', filter.statuses, ''),
    describeValues('Prioridad', filter.priorities, NO_PRIORITY),
    describeValues('Asignado', filter.assignees, UNASSIGNED),
    created && (created.moreThanDays !== null || created.lessThanDays !== null)
      ? describeDates('Antigüedad', { ...created, from: null, to: null }, false)
      : null,
    created && (created.from !== null || created.to !== null)
      ? describeDates('Creado', { ...created, moreThanDays: null, lessThanDays: null }, false)
      : null,
    describeDates('Actualizado', filter.updated, true),
  ]
    .filter((p): p is string => p !== null)
    .join(' · ');
}

/** Un filtro en el editor: sin identificador si es nuevo. */
export type FilterDraft = Criteria & { id: number | null; name: string };

export const emptyFilter = (): FilterDraft => ({
  id: null,
  name: '',
  statuses: null,
  priorities: null,
  assignees: null,
  created: null,
  updated: null,
});
