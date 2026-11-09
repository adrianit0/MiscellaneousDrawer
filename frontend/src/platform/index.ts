/**
 * API pública de la plataforma para las mini apps: lo único del proyecto que pueden importar (P-18). El diseño está en
 * specs/diseno/mini-apps.md.
 */
export type {
  AppApi,
  AppCategory,
  AppColor,
  AppManifest,
  MiniAppContextValue,
  MiniAppModule,
  NavigateOptions,
  NoticeKind,
} from './types';
export { useMiniApp } from './context';
export { useAppState } from './appState';
export { useAppShortcut } from './shortcuts';
export { ApiError } from '../api';
