import type { AppCategory } from '../platform/types';
import type { CatalogApp } from '../api';

/** L-03, N-09: sin mayúsculas ni acentos. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** L-03, N-09: cada palabra de la búsqueda debe aparecer en el nombre, la descripción o las palabras clave. */
export function matchesApp(app: Pick<CatalogApp, 'name' | 'description' | 'keywords'>, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize([app.name, app.description, ...app.keywords].join(' '));
  return words.every((w) => haystack.includes(w));
}

export function matchesText(text: string, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize(text);
  return words.every((w) => haystack.includes(w));
}

const collator = new Intl.Collator('es', { sensitivity: 'base' });

/** L-01: orden alfabético en español. */
export function byName<T extends { name: string }>(apps: readonly T[]): T[] {
  return [...apps].sort((a, b) => collator.compare(a.name, b.name));
}

/** L-01: categorías en su orden, con su nombre visible. */
export const CATEGORIES: readonly { id: AppCategory; label: string }[] = [
  { id: 'data', label: 'Datos' },
  { id: 'productivity', label: 'Productividad' },
  { id: 'utilities', label: 'Utilidades' },
];
