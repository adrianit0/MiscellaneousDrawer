/** Tipos de la API de «Base de datos» (specs/requisitos/database.md) y formatos comunes. */

export type Branch = 'hotfix' | 'develop';
export type JobBranch = Branch | 'both';
export type StepKind = 'download' | 'import' | 'scripts';

/** BD-01: los campos de texto de la configuración, en el orden del formulario. */
export const TEXT_FIELDS = [
  'workDir',
  's3Path',
  's3Suffix',
  'localSuffix',
  'containerName',
  'mysqlImage',
  'timeZone',
  'initSqlFile',
  'secondInitSqlFile',
  'databaseName',
  'pendingSqlDir',
  'versionsSqlDir',
] as const;

export type TextField = (typeof TEXT_FIELDS)[number];
export type PortField = 'hostPort' | 'containerPort';

/** BD-02: GET /config. La contraseña nunca viene. */
export type ConfigView = Record<TextField, string | null> &
  Record<PortField, number | null> & {
    rootPasswordSet: boolean;
    /** BD-03: lo que le falta a cada paso. */
    missing: Record<StepKind | 'dumps', string[]>;
  };

export const LABELS: Record<string, string> = {
  workDir: 'Carpeta de trabajo',
  s3Path: 'Ruta de S3',
  s3Suffix: 'Sufijo del fichero en S3',
  localSuffix: 'Sufijo del fichero local',
  containerName: 'Contenedor',
  mysqlImage: 'Imagen de MySQL',
  rootPassword: 'Contraseña de root',
  hostPort: 'Puerto en la máquina',
  containerPort: 'Puerto del contenedor',
  timeZone: 'Zona horaria',
  initSqlFile: 'Script inicial',
  secondInitSqlFile: 'Segundo script inicial',
  databaseName: 'Base de datos',
  pendingSqlDir: 'Carpeta de scripts pendientes',
  versionsSqlDir: 'Carpeta de versiones',
};

export const BRANCH_LABELS: Record<JobBranch, string> = { hotfix: 'Hotfix', develop: 'Develop', both: 'Ambas' };

/** BD-35 */
export interface Dump {
  kind: 'current' | 'previous' | 'kept';
  file: string;
  name: string | null;
  size: number;
  modified: string;
}

export interface BranchDumps {
  branch: Branch;
  current: Dump | null;
  previous: Dump | null;
  kept: Dump[];
  partial: { done: number; total: number | null } | null;
}

/** BD-50 */
export interface ScriptListing {
  versions: string[];
  version: string | null;
  folder: string;
  exists: boolean;
  files: string[];
}

export interface ScriptResult {
  file: string;
  state: 'pending' | 'running' | 'ok' | 'error';
  error: string | null;
}

export interface JobStep {
  kind: StepKind;
  state: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  message: string | null;
  progress: { done: number; total: number } | null;
  scripts: ScriptResult[] | null;
}

/** BD-13, BD-14 */
export interface Job {
  id: number;
  state: 'running' | 'succeeded' | 'failed' | 'cancelled';
  branch: JobBranch;
  startedAt: string;
  finishedAt: string | null;
  steps: JobStep[];
  /** BD-14: la consola del shell con su registro. */
  consoleId: number;
}

/** Cuerpo de POST /job. */
export interface JobRequest {
  branch: JobBranch;
  download: { mode: 'chunked' | 'direct'; force: boolean } | null;
  import: { dump: string } | null;
  scripts: { version: string | null; files: string[] | null } | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** U-02: dd/MM/yyyy HH:mm, en la hora local. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** U-02: tamaño con coma decimal: «1,5 GiB». */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 ? String(value) : value.toFixed(1).replace('.', ',');
  return `${text} ${units[unit]}`;
}

/** El nombre con que se muestra un volcado. */
export function dumpLabel(dump: Dump): string {
  const date = formatDateTime(dump.modified);
  if (dump.kind === 'current') return `Actual (${date})`;
  if (dump.kind === 'previous') return `Anterior (${date})`;
  return `${dump.name} (${date})`;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error inesperado';
}
