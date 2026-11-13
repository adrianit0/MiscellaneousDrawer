/** Tipos de la API de «Calidad del dato» (specs/requisitos/quality.md). */

/** CD-01: los campos de texto de la configuración, en el orden del formulario. */
export const TEXT_FIELDS = ['containerName', 'databaseName', 'qualitySqlDir'] as const;
export type TextField = (typeof TEXT_FIELDS)[number];
export type Field = TextField | 'rootPassword';

/** CD-02: GET /config. La contraseña nunca viene. */
export type ConfigView = Record<TextField, string | null> & {
  rootPasswordSet: boolean;
  /** CD-03: lo que falta para comprobar. */
  missing: Field[];
};

export const LABELS: Record<Field, string> = {
  containerName: 'Contenedor',
  rootPassword: 'Contraseña de root',
  databaseName: 'Base de datos',
  qualitySqlDir: 'Carpeta de scripts de calidad',
};

/** CD-10 */
export interface ScriptListing {
  folder: string;
  exists: boolean;
  files: string[];
}

export type ScriptState = 'pending' | 'running' | 'clean' | 'rows' | 'error';

/** CD-28 */
export interface ScriptResult {
  file: string;
  state: ScriptState;
  rowCount: number;
  complete: boolean;
  error: string | null;
}

export interface Run {
  id: number;
  state: 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  /** CD-25 */
  consoleId: number;
  scripts: ScriptResult[];
}

/** CD-24, CD-29: un valor null es NULL. */
export interface ResultTable {
  columns: string[];
  rows: (string | null)[][];
}

export interface ScriptTables {
  file: string;
  tables: ResultTable[];
  rowCount: number;
  complete: boolean;
}

/** CD-42: el resultado de un script como se ve. */
export function resultLabel(result: ScriptResult): string {
  switch (result.state) {
    case 'pending':
      return 'Pendiente';
    case 'running':
      return 'En marcha';
    case 'clean':
      return 'Correcto';
    case 'error':
      return 'Error';
    case 'rows': {
      const rows = result.rowCount === 1 ? '1 fila' : `${result.rowCount} filas`;
      return result.complete ? rows : `Más de ${rows}`;
    }
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error inesperado';
}
