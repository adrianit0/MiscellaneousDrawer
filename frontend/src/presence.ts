import { api, onNetworkFailure, sessionToken, TOKEN_HEADER, type ShellNotification } from './api';
import { useCatalog } from './shell/catalogStore';
import { useNotifications } from './shell/notificationStore';
import { useUi } from './shell/uiStore';

/** U-07: cadencia del reintento mientras no hay contacto. */
export const RETRY_DELAY = 3000;

/** R-45: aviso si se pidió actualizar y el servidor vuelve con el mismo build. */
export const UPDATE_FAILED = 'No se pudo aplicar la actualización: sigue la versión anterior. El detalle está en update.log.';

/** Un evento del canal /api/events: su nombre y sus datos, sin interpretar. */
export interface ServerEvent {
  event: string;
  data: string;
}

/**
 * P-23: separa los eventos completos de un trozo del canal (text/event-stream) y devuelve lo que sobra, que es un
 * evento a medias. Los comentarios, como los latidos, se ignoran.
 */
export function takeEvents(chunk: string): { events: ServerEvent[]; rest: string } {
  const blocks = chunk.replace(/\r\n?/g, '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: ServerEvent[] = [];
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length > 0) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

/** P-23: un evento que no se entiende se ignora. */
function dispatch({ event, data }: ServerEvent) {
  if (event !== 'notification') return;
  try {
    useNotifications.getState().add(JSON.parse(data) as ShellNotification);
  } catch {
    // Datos que no son JSON.
  }
}

/**
 * C-04, C-05: la ventana mantiene abierto /api/events y se despide al cerrarse. U-07: si el canal o una petición
 * fallan, aparece la banda y se reintenta; al recuperar el contacto se relee el token y se recarga el catálogo, y si
 * el servidor es otro build, la ventana se recarga para tomar su interfaz (R-45).
 */
export function startPresence(): () => void {
  let stopped = false;
  let leaving = false;
  let retrying = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  // R-45: la interfaz cargada es la de este build.
  let loadedBuild: number | null = null;
  void api.appBuild().then((build) => (loadedBuild = build));

  const listen = async () => {
    controller = new AbortController();
    try {
      const res = await fetch('/api/events', {
        headers: { [TOKEN_HEADER]: sessionToken(), Accept: 'text/event-stream' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok || !res.body) throw new Error(`Error ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Que el canal siga abierto es la presencia; además de latidos trae los eventos del shell (P-23).
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const taken = takeEvents(buffer + decoder.decode(value, { stream: true }));
        buffer = taken.rest;
        taken.events.forEach(dispatch);
      }
    } catch {
      // El servidor se ha ido o la ventana se cierra.
    }
    if (!stopped && !leaving) lost();
  };

  const lost = () => {
    if (stopped || leaving) return;
    useUi.getState().setContactLost(true);
    if (retrying) return;
    retrying = true;
    retryTimer = setTimeout(retry, RETRY_DELAY);
  };

  const retry = async () => {
    if (stopped) return;
    if (!(await api.health())) {
      retryTimer = setTimeout(retry, RETRY_DELAY);
      return;
    }
    retrying = false;
    await api.refreshToken();
    useUi.getState().setContactLost(false);
    void listen();
    if (await reloadedForNewBuild()) return;
    void useCatalog.getState().load();
    // Las notificaciones emitidas mientras no había contacto.
    void useNotifications.getState().load();
  };

  /** R-45: el estado pendiente se guarda al descargar la página (pagehide), ya con el token nuevo. */
  const reloadedForNewBuild = async (): Promise<boolean> => {
    const build = await api.appBuild();
    const ui = useUi.getState();
    if (build !== null && loadedBuild !== null && build !== loadedBuild) {
      window.location.reload();
      return true;
    }
    if (ui.updating) {
      ui.setUpdating(false);
      ui.notify(UPDATE_FAILED, 'error');
    }
    return false;
  };

  const onPageHide = () => {
    leaving = true;
    void api.bye();
  };
  // Al volver de la caché del navegador la ventana vuelve a contar.
  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    leaving = false;
    void listen();
  };

  onNetworkFailure(lost);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  void listen();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    controller?.abort();
    onNetworkFailure(null);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
}
