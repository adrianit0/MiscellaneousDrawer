import { ApiError } from '../../platform';

/** Un cofre desbloqueado sin abrir (GET /chests). */
export interface Chest {
  id: string;
  earnedOn: string;
}

/** Un objeto de la tabla de botín (LB-12). */
export interface Item {
  id: string;
  name: string;
  rarity: string;
}

/** Un cofre abierto (LB-10). */
export interface Opened {
  chest: string;
  items: Item[];
}

/** LB-26: de la peor rareza a la mejor, con su nombre y su color del tema. */
export const RARITIES: readonly { id: string; label: string; color: string }[] = [
  { id: 'common', label: 'Común', color: 'var(--text)' },
  { id: 'uncommon', label: 'Poco común', color: 'var(--green)' },
  { id: 'rare', label: 'Raro', color: 'var(--blue)' },
  { id: 'epic', label: 'Épico', color: 'var(--violet)' },
  { id: 'legendary', label: 'Legendario', color: 'var(--gold)' },
];

/** LB-26: una rareza desconocida se muestra como común. */
export function rarity(id: string): { id: string; label: string; color: string } {
  return RARITIES.find((r) => r.id === id) ?? RARITIES[0];
}

function rank(id: string): number {
  return Math.max(0, RARITIES.findIndex((r) => r.id === id));
}

/** LB-22: la mejor rareza de unos objetos, para el destello. */
export function best(items: readonly Item[]): string {
  return items.reduce((top, i) => (rank(i.rarity) > rank(top) ? i.rarity : top), 'common');
}

/** LB-23: cuántos de cada objeto, de la mejor rareza a la peor y, dentro, por nombre. */
export function summarize(opened: readonly Opened[]): { item: Item; count: number }[] {
  const byId = new Map<string, { item: Item; count: number }>();
  for (const o of opened) {
    for (const item of o.items) {
      const entry = byId.get(item.id);
      if (entry) entry.count += 1;
      else byId.set(item.id, { item, count: 1 });
    }
  }
  return [...byId.values()].sort(
    (a, b) => rank(b.item.rarity) - rank(a.item.rarity) || a.item.name.localeCompare(b.item.name, 'es'),
  );
}

/** LB-20 */
export function chestsLabel(n: number): string {
  return n === 1 ? '1 cofre para abrir' : `${n} cofres para abrir`;
}

/** LB-22: temblor, apertura y cada recompensa; con 3 recompensas, 2 s. */
export const SHAKE_MS = 900;
export const ITEM_MS = 350;
/** LB-23 */
export const SUMMARY_MS = 900;

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : 'Ha fallado la operación';
}
