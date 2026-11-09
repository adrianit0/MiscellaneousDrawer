import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api } from '../api';
import { useMiniApp } from './context';

/** P-14 */
export const APP_STATE_DELAY = 400;

/**
 * P-14: documento de estado de interfaz de una mini app, guardado en la base del shell. Se carga una vez, se guarda
 * 400 ms después del último cambio y no se guarda nunca antes de haberse cargado, para no pisar lo guardado.
 */
export class AppStateDoc {
  private doc: Record<string, unknown> = {};
  private loaded = false;
  private loading: Promise<boolean> | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private version = 0;
  private readonly listeners = new Set<() => void>();
  readonly appId: string;

  constructor(appId: string) {
    this.appId = appId;
  }

  /** true si quedó cargado. Lo cambiado antes de cargar gana a lo guardado. */
  load(): Promise<boolean> {
    if (this.loaded) return Promise.resolve(true);
    if (!this.loading) {
      this.loading = api
        .appState(this.appId)
        .then((saved) => {
          this.doc = { ...saved, ...this.doc };
          this.loaded = true;
          this.emit();
          if (this.dirty) this.schedule();
          return true;
        })
        .catch(() => {
          // Se reintenta en el próximo uso.
          this.loading = null;
          return false;
        });
    }
    return this.loading;
  }

  get ready(): boolean {
    return this.loaded;
  }

  get(key: string): unknown {
    return this.doc[key];
  }

  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.doc, key);
  }

  set(key: string, value: unknown) {
    this.doc = { ...this.doc, [key]: value };
    this.dirty = true;
    this.emit();
    this.schedule();
  }

  /** Guarda ya lo pendiente; al cerrar la ventana, con keepalive. */
  async flush(keepalive = false): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.dirty) return;
    if (!(await this.load())) return;
    this.dirty = false;
    try {
      await api.saveAppState(this.appId, this.doc, { keepalive });
    } catch {
      this.dirty = true;
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  snapshot = () => this.version;

  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), APP_STATE_DELAY);
  }

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
}

const docs = new Map<string, AppStateDoc>();

export function appStateDoc(appId: string): AppStateDoc {
  let doc = docs.get(appId);
  if (!doc) {
    doc = new AppStateDoc(appId);
    docs.set(appId, doc);
  }
  return doc;
}

/** P-14: al cerrar la ventana se guarda lo pendiente de todas las mini apps. */
export function flushAppStates(keepalive = true): Promise<void[]> {
  return Promise.all([...docs.values()].map((d) => d.flush(keepalive)));
}

/** Solo para las pruebas. */
export function resetAppStates() {
  docs.clear();
}

type Updater<T> = T | ((previous: T) => T);

/**
 * P-14: estado de interfaz de la mini app que se conserva entre sesiones (filtros, anchos, la última vista). Devuelve
 * el valor, la función para cambiarlo y si ya se ha cargado lo guardado.
 */
export function useAppState<T>(key: string, initial: T): [T, (value: Updater<T>) => void, boolean] {
  const { id } = useMiniApp();
  const doc = appStateDoc(id);
  useSyncExternalStore(doc.subscribe, doc.snapshot);
  useEffect(() => {
    void doc.load();
  }, [doc]);
  const value = doc.has(key) ? (doc.get(key) as T) : initial;
  const setValue = useCallback(
    (next: Updater<T>) => {
      const previous = doc.has(key) ? (doc.get(key) as T) : initial;
      doc.set(key, typeof next === 'function' ? (next as (p: T) => T)(previous) : next);
    },
    // initial solo se usa si aún no hay valor: no forma parte de las dependencias.
    [doc, key],
  );
  return [value, setValue, doc.ready];
}
