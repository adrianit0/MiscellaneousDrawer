import { api, onNetworkFailure, sessionToken, TOKEN_HEADER } from './api';
import { useCatalog } from './shell/catalogStore';
import { useUi } from './shell/uiStore';

/** U-07: cadencia del reintento mientras no hay contacto. */
export const RETRY_DELAY = 3000;

/**
 * C-04, C-05: la ventana mantiene abierto /api/events y se despide al cerrarse. U-07: si el canal o una petición
 * fallan, aparece la banda y se reintenta; al recuperar el contacto se relee el token y se recarga el catálogo.
 */
export function startPresence(): () => void {
  let stopped = false;
  let leaving = false;
  let retrying = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

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
      // Que el canal siga abierto es la presencia; solo trae latidos.
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
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
    void useCatalog.getState().load();
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
