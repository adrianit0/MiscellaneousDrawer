/** Tipos de la API de «Cerrar procesos» (specs/requisitos/processes.md). */

/** CP-01: un valor null es un campo vacío. */
export interface Profile {
  id: number;
  name: string;
  processPattern: string | null;
  portFrom: number | null;
  portTo: number | null;
}

/** CP-03: los campos del formulario, en su orden. */
export const FIELDS = ['name', 'processPattern', 'portFrom', 'portTo'] as const;
export type Field = (typeof FIELDS)[number];

export const LABELS: Record<Field, string> = {
  name: 'Nombre',
  processPattern: 'Patrón de procesos',
  portFrom: 'Puerto inicial',
  portTo: 'Puerto final',
};

/** CP-13 */
export interface FoundProcess {
  pid: number;
  command: string;
  ports: number[];
  byPattern: boolean;
}

/** CP-10, CP-15 */
export interface Scan {
  processes: FoundProcess[];
  blockedPorts: number[];
  warning: string | null;
}

/** CP-21, CP-22 */
export interface CloseResult {
  closed: number[];
  failed: { pid: number; command: string }[];
  gone: number[];
}

/** CP-31: los puertos de un perfil como se ven. */
export function portsLabel(profile: Profile): string | null {
  if (profile.portFrom === null || profile.portTo === null) return null;
  return profile.portFrom === profile.portTo ? String(profile.portFrom) : `${profile.portFrom} a ${profile.portTo}`;
}

/** CP-33: lo que se avisa después de un cierre. */
export function closeNotice(result: CloseResult): { text: string; kind: 'info' | 'error' } {
  const closed = result.closed.length;
  const failed = result.failed.length;
  if (failed > 0) return { text: `No se han podido cerrar ${failed} de ${closed + failed} procesos`, kind: 'error' };
  if (closed === 0) return { text: 'Los procesos ya no estaban', kind: 'info' };
  return { text: closed === 1 ? 'Se ha cerrado 1 proceso' : `Se han cerrado ${closed} procesos`, kind: 'info' };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error inesperado';
}
