import type { PortField, TextField } from './types';

/** BD-66: lectura de un .sh de configuración. No ejecuta ni interpreta la shell (ADR-0015). */

export type ImportField = TextField | PortField | 'rootPassword';

/** BD-66: el tamaño máximo del fichero. */
export const MAX_SH_BYTES = 1024 * 1024;

/** BD-66: la variable del .sh que rellena cada campo, en el orden de la tabla. */
const VARIABLES: [string, ImportField][] = [
  ['BASE_DIR', 'workDir'],
  ['S3_PATH', 's3Path'],
  ['DATABASE_PREFIX_FILE_S3', 's3Suffix'],
  ['DATABASE_PREFIX_FILE_LOCAL', 'localSuffix'],
  ['CONTAINER_NAME', 'containerName'],
  ['MYSQL_IMAGE', 'mysqlImage'],
  ['MYSQL_ROOT_PASSWORD', 'rootPassword'],
  ['LOCAL_PORT', 'hostPort'],
  ['MYSQL_PORT', 'containerPort'],
  ['TZ', 'timeZone'],
  ['INITDB_FILE', 'initSqlFile'],
  ['NAME_FILE', 'secondInitSqlFile'],
  ['DATABASE_NAME', 'databaseName'],
  ['SQL_FOLDER', 'pendingSqlDir'],
  ['SQL_FOLDER_EXECUTED', 'versionsSqlDir'],
];

const PATHS: ReadonlySet<ImportField> = new Set(['workDir', 'initSqlFile', 'secondInitSqlFile', 'pendingSqlDir', 'versionsSqlDir']);
const PORTS: ReadonlySet<ImportField> = new Set(['hostPort', 'containerPort']);

/** `NOMBRE=resto`, con `export` delante o sin él. */
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
/** Ruta absoluta en Ubuntu, o en Windows para el equipo de desarrollo. */
const ABSOLUTE = /^(\/|[A-Za-z]:[\\/])/;

export interface Skipped {
  field: ImportField;
  variable: string;
  reason: string;
}

export interface ShImport {
  /** Los valores que se pueden poner en el formulario, como texto. */
  values: Partial<Record<ImportField, string>>;
  /** Los que vienen en el fichero pero no se pueden importar, en el orden de la tabla. */
  skipped: Skipped[];
}

/** El valor de una asignación: una palabra de la shell. null si no se puede leer (una comilla sin cerrar). */
function word(text: string): { value: string; dynamic: boolean } | null {
  let value = '';
  let dynamic = text.startsWith('~');
  let i = 0;
  while (i < text.length && !/[\s;]/.test(text[i])) {
    const c = text[i];
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) return null;
      value += text.slice(i + 1, end);
      i = end + 1;
    } else if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && '$`"\\'.includes(text[i + 1] ?? '')) {
          value += text[i + 1];
          i += 2;
          continue;
        }
        if (text[i] === '$' || text[i] === '`') dynamic = true;
        value += text[i++];
      }
      if (i >= text.length) return null;
      i++;
    } else if (c === '\\') {
      value += text[i + 1] ?? '';
      i += 2;
    } else {
      if (c === '$' || c === '`') dynamic = true;
      value += c;
      i++;
    }
  }
  return { value, dynamic };
}

function withoutFinalSlash(value: string): string {
  let out = value;
  while (out.length > 1 && out.endsWith('/') && !out.endsWith('://')) out = out.slice(0, -1);
  return out;
}

/** BD-66: el valor para el formulario, o el motivo por el que se omite. */
function convert(field: ImportField, raw: ReturnType<typeof word>): { value: string } | { reason: string } {
  if (raw === null) return { reason: 'no se puede leer el valor' };
  if (raw.dynamic) return { reason: 'usa variables o comandos' };
  // La contraseña se toma tal cual; lo demás se guarda sin los espacios de los extremos (BD-01).
  const value = field === 'rootPassword' ? raw.value : raw.value.trim();
  if (value === '') return { reason: 'está vacío' };
  if (PORTS.has(field)) {
    const port = /^\d{1,5}$/.test(value) ? Number(value) : 0;
    return port >= 1 && port <= 65535 ? { value: String(port) } : { reason: 'no es un número entre 1 y 65535' };
  }
  if (PATHS.has(field)) {
    return ABSOLUTE.test(value) ? { value: withoutFinalSlash(value) } : { reason: 'no es una ruta absoluta' };
  }
  if (field === 's3Path') return { value: withoutFinalSlash(value) };
  return { value };
}

/** BD-66: los valores de las variables de la tabla que trae el texto de un .sh. Las demás no se leen. */
export function parseSh(text: string): ShImport {
  const found = new Map<string, ReturnType<typeof word>>();
  const known = new Set(VARIABLES.map(([variable]) => variable));
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const match = ASSIGNMENT.exec(line);
    // Si una variable se repite, vale la última.
    if (match && known.has(match[1])) found.set(match[1], word(match[2]));
  }
  const result: ShImport = { values: {}, skipped: [] };
  for (const [variable, field] of VARIABLES) {
    if (!found.has(variable)) continue;
    const converted = convert(field, found.get(variable)!);
    if ('value' in converted) result.values[field] = converted.value;
    else result.skipped.push({ field, variable, reason: converted.reason });
  }
  return result;
}
