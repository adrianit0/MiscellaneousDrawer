import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ApiError, useMiniApp } from '../../platform';
import styles from './inventory.module.css';

/** Un objeto del inventario (GET /items). */
export interface InventoryItem {
  id: string;
  name: string;
  rarity: string;
  count: number;
  firstAt: string;
  lastAt: string;
}

/** IN-10, LB-26: los colores y nombres de las rarezas. */
const RARITIES: Record<string, { label: string; color: string }> = {
  common: { label: 'Común', color: 'var(--text)' },
  uncommon: { label: 'Poco común', color: 'var(--green)' },
  rare: { label: 'Raro', color: 'var(--blue)' },
  epic: { label: 'Épico', color: 'var(--violet)' },
  legendary: { label: 'Legendario', color: 'var(--gold)' },
};

function rarity(id: string) {
  return RARITIES[id] ?? RARITIES.common;
}

/** U-02: dd/MM/yyyy HH:mm en hora local. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : 'Ha fallado la operación';
}

/** «Inventario» (IN-10 a IN-21): los objetos conseguidos en los cofres, de un vistazo. */
export function InventoryApp() {
  const { api, active } = useMiniApp();
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ items: InventoryItem[] }>('/items');
      setItems(r.items);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api]);

  // IN-21: al abrirse y cada vez que vuelve a mostrarse.
  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const total = items?.reduce((sum, i) => sum + i.count, 0) ?? 0;

  return (
    <div className={styles.app}>
      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {!items && !error && <p className={styles.muted}>Cargando…</p>}
      {items && items.length === 0 && (
        <div className={styles.empty}>
          <p>Todavía no tienes objetos. Se consiguen abriendo cofres en Lootboxes.</p>
          <a href="#/apps/lootboxes">Ir a Lootboxes</a>
        </div>
      )}
      {items && items.length > 0 && (
        <>
          <h2 className={styles.total}>{total === 1 ? '1 objeto' : `${total} objetos`}</h2>
          <ul className={styles.grid} aria-label="Objetos">
            {items.map((item) => {
              const r = rarity(item.rarity);
              const dates = `Primero: ${formatDate(item.firstAt)} · Último: ${formatDate(item.lastAt)}`;
              return (
                <li key={item.id} className={styles.card} tabIndex={0} title={dates}>
                  <span className={styles.orb} style={{ '--rarity': r.color } as CSSProperties} aria-hidden="true" />
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.rarity} style={{ color: r.color }}>
                    {r.label}
                  </span>
                  <span className={styles.count}>×{item.count}</span>
                  <span className={styles.dates}>{dates}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
