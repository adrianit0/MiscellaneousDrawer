import type { AppConfig, CatalogApp, ShellConsole, ShellNotification, UpdateCheck, UpdateStatus } from '../api';
import { resetAppStates } from '../platform/appState';
import { useCatalog } from '../shell/catalogStore';
import { resetConsoles } from '../shell/consoleStore';
import { resetNav } from '../shell/navStore';
import { useNotifications } from '../shell/notificationStore';
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
  config: AppConfig;
  /** R-06, R-45: build que devuelve /api/health. */
  build: number;
  /** R-10 a R-14, R-40: lo que responden las rutas de actualización y los builds pedidos. busy: P-20, R-41. */
  update: { status: UpdateStatus; check: UpdateCheck | { error: string }; applied: number[]; busy?: string };
  appStates: Record<string, Record<string, unknown>>;
  /** P-22: lo que devuelve GET /api/notifications, la más reciente primero. */
  notifications: ShellNotification[];
  /** P-27: lo que devuelve GET /api/consoles, la más reciente primero, y las líneas de cada una por su identificador. */
  consoles: ShellConsole[];
  consoleLines: Record<number, string[]>;
  /** P-23: envía un evento por /api/events a las ventanas conectadas. */
  emit: (event: string, data: unknown) => void;
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
export function installFakeServer(init: Partial<Omit<FakeServer, 'calls' | 'callsTo' | 'emit'>> = {}): FakeServer {
  const windows: ReadableStreamDefaultController<Uint8Array>[] = [];
  const server: FakeServer = {
    calls: [],
    catalog: [],
    settings: {},
    config: { port: 47800, autoShutdownMinutes: null, updateRepository: null, notificationSound: true, desktopNotifications: true },
    notifications: [],
    consoles: [],
    consoleLines: {},
    emit: (event, data) => {
      const bytes = new TextEncoder().encode(`: latido\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      windows.forEach((w) => w.enqueue(bytes));
    },
    build: 0,
    update: {
      status: { version: '0.1.0', build: 0, commit: '', available: false, reason: 'Las actualizaciones solo funcionan en la instalación de Ubuntu.' },
      check: { error: 'No hay ninguna versión publicada en ese repositorio' },
      applied: [],
    },
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

    if (url === '/api/health') return json(200, { app: 'CajonSastre', version: 'test', build: server.build });
    if (url === '/api/events') {
      return new Response(new ReadableStream<Uint8Array>({ start: (controller) => void windows.push(controller) }), { status: 200 });
    }
    if (url === '/api/notifications') {
      if (method === 'DELETE') server.notifications = [];
      return json(200, { notifications: server.notifications });
    }
    if (url === '/api/consoles') {
      if (method === 'DELETE') server.consoles = server.consoles.filter((c) => c.state === 'running');
      return json(200, { consoles: server.consoles });
    }
    const lines = /^\/api\/consoles\/(\d+)\?after=(\d+)$/.exec(url);
    if (lines) {
      const found = server.consoles.find((c) => c.id === Number(lines[1]));
      if (!found) return json(404, { code: 'console_not_found', message: 'La consola no existe', details: null });
      const all = server.consoleLines[found.id] ?? [];
      const from = Math.min(Number(lines[2]), all.length);
      return json(200, { console: found, from, next: all.length, lines: all.slice(from) });
    }
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
          if (config.updateRepository !== null && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(config.updateRepository)) {
            return json(400, {
              code: 'invalid_settings',
              message: 'La URL del repositorio debe ser https://github.com/<propietario>/<repositorio>',
              details: null,
            });
          }
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
    if (url === '/api/update') return json(200, server.update.status);
    if (url === '/api/update/check') {
      const check = server.update.check;
      return 'error' in check ? json(502, { code: 'update_http', message: check.error, details: null }) : json(200, check);
    }
    if (url === '/api/update/apply') {
      if (server.update.busy) {
        return json(409, { code: 'app_busy', message: `No se puede actualizar ahora: ${server.update.busy}`, details: null });
      }
      server.update.applied.push((body as { build: number }).build);
      return json(200, { restarting: true });
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
  useUi.setState({ notices: [], paletteOpen: false, settingsOpen: false, contactLost: false, updating: false });
  useNotifications.setState({ items: [], seen: 0 });
  resetConsoles();
  useRouter.setState({ route: HOME });
  document.title = '';
}
