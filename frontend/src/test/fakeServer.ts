import type { CatalogApp } from '../api';
import { resetAppStates } from '../platform/appState';
import { useCatalog } from '../shell/catalogStore';
import { resetNav } from '../shell/navStore';
import { HOME, useRouter } from '../shell/router';
import { useUi } from '../shell/uiStore';

export interface Call {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

type Handler = (call: Call) => { status?: number; body?: unknown } | undefined;

export interface FakeServer {
  calls: Call[];
  catalog: CatalogApp[] | { error: string };
  settings: Record<string, unknown>;
  config: { port: number; autoShutdownMinutes: number | null };
  appStates: Record<string, Record<string, unknown>>;
  /** Rutas de las mini apps: /api/apps/... */
  appRoutes: Handler;
  callsTo: (method: string, prefix: string) => Call[];
}

export function app(partial: Partial<CatalogApp> & { id: string }): CatalogApp {
  return {
    name: partial.id,
    description: `Descripción de ${partial.id}`,
    icon: 'app',
    color: 'blue',
    category: 'utilities',
    keywords: [],
    status: 'available',
    error: null,
    ...partial,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Sustituye fetch por un servidor en memoria con la API de api.md. */
export function installFakeServer(init: Partial<Omit<FakeServer, 'calls' | 'callsTo'>> = {}): FakeServer {
  const server: FakeServer = {
    calls: [],
    catalog: [],
    settings: {},
    config: { port: 47800, autoShutdownMinutes: null },
    appStates: {},
    appRoutes: () => undefined,
    ...init,
    callsTo: (method, prefix) => server.calls.filter((c) => c.method === method && c.url.startsWith(prefix)),
  };
  const fetchMock = async (input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url;
    const method = (options.method ?? 'GET').toUpperCase();
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined;
    const headers = Object.fromEntries(Object.entries((options.headers ?? {}) as Record<string, string>));
    const call = { method, url, body, headers };
    server.calls.push(call);

    if (url === '/api/health') return json(200, { app: 'CajonSastre', version: 'test', build: 0 });
    if (url === '/api/events') return new Response(new ReadableStream({ start() {} }), { status: 200 });
    if (url === '/api/presence/bye') return json(200, { ok: true });
    if (url === '/api/catalog') {
      return 'error' in server.catalog
        ? json(500, { code: 'internal_error', message: server.catalog.error, details: null })
        : json(200, { apps: server.catalog });
    }
    if (url === '/api/settings') {
      if (method === 'PUT') {
        const changes = { ...(body as Record<string, unknown>) };
        if (changes.config) {
          const config = changes.config as FakeServer['config'];
          if (config.port < 1024) return json(400, { code: 'invalid_settings', message: 'El puerto debe estar entre 1024 y 65535', details: null });
          server.config = config;
          delete changes.config;
        }
        server.settings = { ...server.settings, ...changes };
      }
      return json(200, { ...server.settings, config: server.config });
    }
    const state = /^\/api\/app-state\/([^/]+)$/.exec(url);
    if (state) {
      if (method === 'PUT') server.appStates[state[1]] = body as Record<string, unknown>;
      return json(200, server.appStates[state[1]] ?? {});
    }
    if (url.startsWith('/api/apps/')) {
      const r = server.appRoutes(call);
      if (r) return json(r.status ?? 200, r.body);
    }
    return json(404, { code: 'http_404', message: 'La ruta no existe', details: null });
  };
  globalThis.fetch = fetchMock as typeof fetch;
  return server;
}

/** Deja el shell como recién abierto. */
export function resetShell() {
  window.history.replaceState(null, '', '/');
  resetNav();
  resetAppStates();
  useCatalog.setState({ apps: [], status: 'loading', error: null });
  useUi.setState({ notices: [], paletteOpen: false, settingsOpen: false, contactLost: false });
  useRouter.setState({ route: HOME });
  document.title = '';
}
