import type { AppManifest } from './platform/types';

/** S-12, C-08: cabecera propia, distinta de la de LiteDD. */
export const TOKEN_HEADER = 'X-CajonSastre-Token';

/** Error de la API con el cuerpo de A-02. status 0 = sin contacto con el servidor. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** U-07: aviso cuando una petición no llega al servidor. */
let networkFailureListener: (() => void) | null = null;

export function onNetworkFailure(listener: (() => void) | null) {
  networkFailureListener = listener;
}

function networkError(): ApiError {
  networkFailureListener?.();
  return new ApiError(0, 'network', 'No hay contacto con el servidor', null);
}

/** S-12: el token llega en el HTML inicial. */
export function sessionToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="cajonsastre-token"]')?.content ?? '';
}

export interface RequestOptions {
  keepalive?: boolean;
}

export async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { [TOKEN_HEADER]: sessionToken() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive: options.keepalive,
    });
  } catch {
    throw networkError();
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Error ${res.status}`, err.details ?? null);
  }
  return data as T;
}

/** P-04 */
export type AppStatus = 'planned' | 'available' | 'failed';

/** Una mini app de GET /api/catalog. */
export interface CatalogApp extends AppManifest {
  status: AppStatus;
  /** L-06: mensaje del fallo al arrancar. */
  error: string | null;
}

/** D-05, U-06 */
export interface AppConfig {
  port: number;
  autoShutdownMinutes: number | null;
}

export type Settings = Record<string, unknown> & { config?: AppConfig };

export const api = {
  /** C-01, U-07: ¿responde CajonSastre? */
  async health(): Promise<boolean> {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) return false;
      const body = (await res.json()) as { app?: string };
      return body.app === 'CajonSastre';
    } catch {
      return false;
    }
  },

  /** U-07: un servidor reiniciado tiene token nuevo; se relee de la página inicial, que es del mismo origen. */
  async refreshToken(): Promise<void> {
    try {
      const res = await fetch('/', { cache: 'no-store' });
      const html = await res.text();
      const token = /<meta name="cajonsastre-token" content="([^"]*)"/.exec(html)?.[1];
      const meta = document.querySelector<HTMLMetaElement>('meta[name="cajonsastre-token"]');
      if (token && meta) meta.content = token;
    } catch {
      // Se reintentará en la próxima pérdida de contacto.
    }
  },

  /** C-05 */
  bye(): Promise<unknown> {
    return request('POST', '/api/presence/bye', undefined, { keepalive: true }).catch(() => null);
  },

  /** P-04 */
  async catalog(): Promise<CatalogApp[]> {
    const body = await request<{ apps: CatalogApp[] }>('GET', '/api/catalog');
    return body.apps;
  },

  /** D-04, D-05 */
  settings(): Promise<Settings> {
    return request<Settings>('GET', '/api/settings');
  },

  saveSettings(changes: Settings, options: RequestOptions = {}): Promise<Settings> {
    return request<Settings>('PUT', '/api/settings', changes, options);
  },

  /** P-14 */
  appState(appId: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('GET', `/api/app-state/${encodeURIComponent(appId)}`);
  },

  saveAppState(appId: string, doc: Record<string, unknown>, options: RequestOptions = {}): Promise<unknown> {
    return request('PUT', `/api/app-state/${encodeURIComponent(appId)}`, doc, options);
  },
};
