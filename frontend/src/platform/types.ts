import type { ComponentType } from 'react';

/** P-02, U-01: colores de mini app; cada uno es una variable del tema. */
export type AppColor = 'blue' | 'green' | 'violet' | 'orange' | 'cyan' | 'gold';

/** P-02, L-01: categorías del lanzador. */
export type AppCategory = 'data' | 'productivity' | 'utilities';

/** P-02: identidad de una mini app, declarada en el catálogo del servidor. */
export interface AppManifest {
  id: string;
  name: string;
  description: string;
  /** Nombre de un icono de src/shell/icons/. */
  icon: string;
  color: AppColor;
  category: AppCategory;
  keywords: string[];
}

export type NoticeKind = 'info' | 'error';

export interface NavigateOptions {
  /** Sustituye la entrada actual del historial en lugar de añadir una (N-02). */
  replace?: boolean;
}

/** P-13: cliente acotado a /api/apps/<id>. Las rutas son relativas y empiezan por «/». */
export interface AppApi {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

/** P-12: lo que el shell da a una mini app. */
export interface MiniAppContextValue {
  id: string;
  manifest: AppManifest;
  /** N-05: false mientras está oculta pero montada. */
  active: boolean;
  /** Su subruta: '' o '/lista/42'. */
  path: string;
  navigate: (path: string, options?: NavigateOptions) => void;
  api: AppApi;
  /** U-05 */
  notify: (text: string, kind?: NoticeKind) => void;
  /** N-07: la sección actual en la miga de pan; null la quita. */
  setSubtitle: (text: string | null) => void;
  /** N-15: despliega el panel de consolas del shell con esa consola elegida; el identificador lo da su servidor (P-25). */
  showConsole: (id: number) => void;
}

/** P-11: lo que exporta por defecto frontend/src/apps/<id>/index.tsx. */
export interface MiniAppModule {
  Root: ComponentType;
}
