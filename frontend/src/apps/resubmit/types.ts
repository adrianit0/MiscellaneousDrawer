/** Tipos de la API de «Reenviar PR» (specs/requisitos/resubmit.md). */

/** RP-01 a RP-04: la conexión sin el token. */
export interface ConfigView {
  baseUrl: string | null;
  projectKey: string | null;
  repoSlug: string | null;
  username: string | null;
  dir: string | null;
  targetBranch: string | null;
  branchPrefix: string | null;
  tokenSet: boolean;
  missing: string[];
}

/** RP-02: los campos del formulario, en su orden. */
export const FIELDS = ['baseUrl', 'token', 'projectKey', 'repoSlug', 'username', 'dir', 'targetBranch', 'branchPrefix'] as const;
export type Field = (typeof FIELDS)[number];

export const LABELS: Record<Field, string> = {
  baseUrl: 'URL de Bitbucket',
  token: 'Token',
  projectKey: 'Proyecto',
  repoSlug: 'Repositorio',
  username: 'Usuario',
  dir: 'Carpeta',
  targetBranch: 'Rama destino',
  branchPrefix: 'Prefijo de rama',
};

/** RP-13 */
export interface Candidate {
  id: number;
  title: string;
  branch: string;
  ticket: string | null;
  link: string | null;
  declinedAt: string | null;
  reviewers: string[];
  newBranch: string | null;
  selectable: boolean;
  reason: string | null;
}

export type Result = 'pending' | 'running' | 'created' | 'conflict' | 'skipped' | 'failed';

/** RP-34 */
export interface PrResult {
  id: number;
  title: string | null;
  branch: string | null;
  newBranch: string | null;
  result: Result;
  detail: string | null;
  link: string | null;
  /** RP-36: si se anotó el PR anterior; null si no se creó el nuevo. */
  annotated: boolean | null;
}

export interface Job {
  id: number;
  state: 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  /** RP-31 */
  consoleId: number;
  prs: PrResult[];
}

/** RP-44 */
export function resultLabel(result: Result): string {
  switch (result) {
    case 'pending':
      return 'Pendiente';
    case 'running':
      return 'En marcha';
    case 'created':
      return 'Recreado';
    case 'conflict':
      return 'Con conflictos';
    case 'skipped':
      return 'Omitido';
    case 'failed':
      return 'Error';
  }
}

/** RP-44: lo que se ve arriba de un trabajo. */
export function jobSummary(job: Job): string {
  if (job.state !== 'running') return job.message ? `Reenviar PR: ${job.message}` : 'Reenviar PR';
  const done = job.prs.filter((p) => p.result !== 'pending' && p.result !== 'running').length;
  return `Reenviar PR: ${done} de ${job.prs.length}`;
}

/** RP-42: la fecha de rechazo, en la zona del equipo. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error inesperado';
}
