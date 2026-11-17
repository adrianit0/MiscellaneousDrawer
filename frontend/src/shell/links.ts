import { api, ApiError } from '../api';
import { useUi } from './uiStore';

/**
 * C-16: la URL de un enlace que sale de la aplicación (http o https de otro origen), ya normalizada; null si se queda
 * en la ventana, como las rutas `#/…`, los enlaces del mismo origen o `mailto:`.
 */
export function externalUrl(href: string, origin: string = window.location.origin): string | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.origin === origin ? null : url.href;
}

/**
 * C-16: la ventana es un Chrome con perfil propio (C-03) y no puede abrir nada fuera de él, así que un enlace externo
 * se pide al servidor, que lo abre en el Chrome habitual. Se escucha en captura sobre todo el documento para que valga
 * en cualquier mini app, aunque detenga la propagación del clic. El clic central llega como auxclick.
 */
export function startExternalLinks(): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const url = externalUrl(anchor.href);
    if (!url) return;
    e.preventDefault();
    api.openLink(url).catch((err: unknown) => {
      // Sin contacto con el servidor ya aparece la banda (U-07).
      if (err instanceof ApiError && err.status === 0) return;
      useUi.getState().notify(err instanceof Error ? err.message : 'No se pudo abrir el enlace', 'error');
    });
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('auxclick', onClick, true);
  };
}
