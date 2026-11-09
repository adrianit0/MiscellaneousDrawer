import { ApiError, request } from '../api';
import type { AppApi } from './types';

/**
 * P-13: ruta completa de una llamada de la mini app. Rechaza, sin llegar al servidor, las rutas que no empiezan por
 * «/» o que podrían salir de su espacio.
 */
export function appApiPath(appId: string, path: string): string {
  const pathOnly = path.split('?')[0];
  const segments = pathOnly.split('/');
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    path.includes('#') ||
    segments.some((s) => s === '..' || s === '.' || /%2e%2e/i.test(s)) ||
    /[\s\u0000-\u001f]/.test(path)
  ) {
    throw new ApiError(0, 'invalid_path', `Ruta no válida para la mini app: ${path}`, null);
  }
  return `/api/apps/${appId}${path}`;
}

/** P-13: cliente con el token, acotado a /api/apps/<id>. */
export function createAppApi(appId: string): AppApi {
  const call = <T>(method: string, path: string, body?: unknown) => {
    let url: string;
    try {
      url = appApiPath(appId, path);
    } catch (e) {
      return Promise.reject(e);
    }
    return request<T>(method, url, body);
  };
  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    put: (path, body) => call('PUT', path, body),
    patch: (path, body) => call('PATCH', path, body),
    delete: (path) => call('DELETE', path),
  };
}
