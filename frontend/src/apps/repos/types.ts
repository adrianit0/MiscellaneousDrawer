/** Tipos de la API de «Repositorios» (specs/requisitos/repos.md). */

/** RG-01 */
export interface Repo {
  id: number;
  name: string;
  dir: string;
  remoteUrl: string;
  defaultBranch: string;
}

/** RG-02: los campos del formulario, en su orden. */
export const FIELDS = ['name', 'dir', 'remoteUrl', 'defaultBranch'] as const;
export type Field = (typeof FIELDS)[number];

export const LABELS: Record<Field, string> = {
  name: 'Nombre',
  dir: 'Carpeta',
  remoteUrl: 'URL del remoto',
  defaultBranch: 'Rama por defecto',
};

/** RG-11 a RG-14 */
export interface Status {
  id: number;
  state: 'ok' | 'missing' | 'not_git' | 'error';
  /** null: cabecera suelta. */
  branch: string | null;
  head: string | null;
  changes: number | null;
  untracked: number | null;
  /** null: sin rama remota. */
  ahead: number | null;
  behind: number | null;
  branches: string[];
  remoteMatches: boolean | null;
  error: string | null;
}

/** RG-10, RG-15 */
export interface Statuses {
  statuses: Status[];
  warning: string | null;
}

/** RG-20 */
export type Action = 'fetch' | 'pull' | 'switch' | 'discard' | 'set-remote' | 'clone' | 'fetch-all' | 'update-all';

export const ACTIONS: Record<Action, string> = {
  fetch: 'Consultar el remoto',
  pull: 'Actualizar',
  switch: 'Cambiar de rama',
  discard: 'Descartar cambios',
  'set-remote': 'Usar el remoto configurado',
  clone: 'Clonar',
  'fetch-all': 'Consultar todas',
  'update-all': 'Actualizar todas',
};

export type Result = 'pending' | 'running' | 'updated' | 'unchanged' | 'done' | 'skipped' | 'failed';

/** RG-31 */
export interface RepoResult {
  repoId: number;
  name: string;
  result: Result;
  detail: string | null;
}

export interface Job {
  id: number;
  action: Action;
  state: 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  /** RG-28 */
  consoleId: number;
  repos: RepoResult[];
}

export const isMulti = (job: Job) => job.action.endsWith('-all');

/** RG-41: el estado de un repositorio como se ve. */
export function stateLabel(status: Status): string {
  switch (status.state) {
    case 'missing':
      return 'Sin clonar';
    case 'not_git':
      return 'No es un repositorio';
    case 'error':
      return status.error ?? 'Error';
    case 'ok': {
      const changes = status.changes ?? 0;
      const untracked = status.untracked ?? 0;
      const parts: string[] = [];
      if (changes > 0) parts.push(changes === 1 ? '1 cambio' : `${changes} cambios`);
      if (untracked > 0) parts.push(`${untracked} sin seguimiento`);
      return parts.length === 0 ? 'Limpio' : parts.join(', ');
    }
  }
}

/** RG-41: los commits pendientes según la última consulta al remoto. */
export function pendingLabel(status: Status): string {
  if (status.state !== 'ok' || status.ahead === null || status.behind === null) return '—';
  if (status.ahead === 0 && status.behind === 0) return 'Al día';
  const parts: string[] = [];
  if (status.behind > 0) parts.push(`↓ ${status.behind}`);
  if (status.ahead > 0) parts.push(`↑ ${status.ahead}`);
  return parts.join(' ');
}

/** RG-43: el resultado de un repositorio en un trabajo. */
export function resultLabel(result: Result): string {
  switch (result) {
    case 'pending':
      return 'Pendiente';
    case 'running':
      return 'En marcha';
    case 'updated':
      return 'Actualizado';
    case 'unchanged':
      return 'Sin cambios';
    case 'done':
      return 'Hecho';
    case 'skipped':
      return 'Omitido';
    case 'failed':
      return 'Error';
  }
}

/** RG-43: el nombre de un trabajo: su acción y, si es de un repositorio, el suyo. */
export function jobName(job: Job): string {
  return isMulti(job) || job.repos.length === 0 ? ACTIONS[job.action] : `${ACTIONS[job.action]} · ${job.repos[0].name}`;
}

/** RG-43: lo que se ve arriba de un trabajo. */
export function jobSummary(job: Job): string {
  const name = jobName(job);
  if (job.state !== 'running') return job.message ? `${name}: ${job.message}` : name;
  if (!isMulti(job)) return `${name}: en marcha`;
  const done = job.repos.filter((r) => r.result !== 'pending' && r.result !== 'running').length;
  return `${name}: ${done} de ${job.repos.length}`;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error inesperado';
}
