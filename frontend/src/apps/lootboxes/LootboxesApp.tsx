import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMiniApp } from '../../platform';
import styles from './lootboxes.module.css';
import {
  best,
  chestsLabel,
  errorMessage,
  ITEM_MS,
  rarity,
  SHAKE_MS,
  summarize,
  SUMMARY_MS,
  type Chest,
  type Item,
  type Opened,
} from './types';

/** Lo que se está mostrando: un cofre abierto (LB-22) o el resumen de «Abrir todos» (LB-23). */
type Shown = { kind: 'one'; opened: Opened } | { kind: 'all'; opened: Opened[] };

/** LB-24 */
function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** El paso final: tras el temblor, uno por recompensa en un cofre; uno solo en el resumen. */
function lastStep(shown: Shown): number {
  return shown.kind === 'one' ? 1 + shown.opened.items.length : 1;
}

function Orb({ item }: { item: Item }) {
  const r = rarity(item.rarity);
  return <span className={styles.orb} style={{ '--rarity': r.color } as CSSProperties} aria-hidden="true" />;
}

/** «Lootboxes» (LB-20 a LB-27): abrir los cofres desbloqueados, con una animación breve que se puede saltar. */
export function LootboxesApp() {
  const { api, active, notify } = useMiniApp();
  const [chests, setChests] = useState<Chest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [step, setStep] = useState(0);
  const confirmRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ chests: Chest[] }>('/chests');
      setChests(r.chests);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api]);

  // LB-27: al abrirse y cada vez que vuelve a mostrarse.
  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const final = shown ? lastStep(shown) : 0;
  const animating = shown !== null && step < final;
  const skip = useCallback(() => setStep(final), [final]);

  // LB-22, LB-23: cada paso de la animación; LB-24: sin animación si se pide menos movimiento o está oculta.
  useEffect(() => {
    if (!shown || step >= final) return;
    if (!active || reducedMotion()) {
      setStep(final);
      return;
    }
    const delay = step === 0 ? (shown.kind === 'one' ? SHAKE_MS : SUMMARY_MS) : ITEM_MS;
    const timer = window.setTimeout(() => setStep((s) => s + 1), delay);
    return () => window.clearTimeout(timer);
  }, [shown, step, final, active]);

  // LB-22: Enter, Espacio o Esc saltan al resultado.
  useEffect(() => {
    if (!animating || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        skip();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [animating, active, skip]);

  useEffect(() => {
    if (confirmAll) confirmRef.current?.querySelector<HTMLElement>('button[data-primary]')?.focus();
  }, [confirmAll]);

  const show = (next: Shown) => {
    setStep(0);
    setShown(next);
  };

  /** LB-21: el más antiguo. */
  const openNext = async () => {
    const next = chests?.[0];
    if (!next) return;
    setOpening(true);
    try {
      const opened = await api.post<Opened>(`/chests/${encodeURIComponent(next.id)}/open`);
      setChests((list) => (list ?? []).filter((c) => c.id !== next.id));
      show({ kind: 'one', opened });
    } catch (e) {
      notify(errorMessage(e), 'error');
      void load();
    } finally {
      setOpening(false);
    }
  };

  /** LB-23 */
  const openAll = async () => {
    setConfirmAll(false);
    setOpening(true);
    try {
      const r = await api.post<{ opened: Opened[] }>('/chests/open-all');
      setChests([]);
      show({ kind: 'all', opened: r.opened });
    } catch (e) {
      notify(errorMessage(e), 'error');
      void load();
    } finally {
      setOpening(false);
    }
  };

  const count = chests?.length ?? 0;
  const disabled = opening || animating || count === 0;
  const opened = step >= 1;
  const glow = shown ? rarity(best(shown.kind === 'one' ? shown.opened.items : shown.opened.flatMap((o) => o.items))) : null;
  const revealed = shown?.kind === 'one' ? shown.opened.items.slice(0, Math.max(0, step - 1)) : [];

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
      {!chests && !error && <p className={styles.muted}>Cargando…</p>}
      {chests && (
        <>
          <h2 className={styles.count}>{count > 0 ? chestsLabel(count) : 'No hay cofres para abrir'}</h2>

          <div
            className={styles.stage}
            data-testid="stage"
            aria-live="polite"
            onClick={animating ? skip : undefined}
            style={glow ? ({ '--rarity': glow.color } as CSSProperties) : undefined}
          >
            <div
              className={[styles.chest, animating && step === 0 ? styles.shaking : '', shown && opened ? styles.open : '']
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            >
              <span className={styles.lid} />
              <span className={styles.base} />
              {shown && opened && <span className={styles.flash} />}
            </div>
            {animating && <p className={styles.hint}>Pulsa para saltar la animación</p>}
          </div>

          {shown?.kind === 'one' && revealed.length > 0 && (
            <ul className={styles.rewards} aria-label="Recompensas">
              {revealed.map((item, i) => (
                <li key={i} className={styles.reward}>
                  <Orb item={item} />
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.rarity} style={{ color: rarity(item.rarity).color }}>
                    {rarity(item.rarity).label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {shown?.kind === 'all' && opened && (
            <div className={styles.summary}>
              <h3>
                {shown.opened.length === 1 ? 'Has abierto 1 cofre' : `Has abierto ${shown.opened.length} cofres`}
              </h3>
              <ul className={styles.rewards} aria-label="Resumen">
                {summarize(shown.opened).map(({ item, count: n }) => (
                  <li key={item.id} className={styles.reward}>
                    <Orb item={item} />
                    <span className={styles.name}>{item.name}</span>
                    <span className={styles.rarity} style={{ color: rarity(item.rarity).color }}>
                      {rarity(item.rarity).label}
                    </span>
                    <span className={styles.amount}>×{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {shown && !animating && (
            <p>
              <a href="#/apps/inventory">Ver inventario</a>
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={disabled} onClick={() => void openNext()}>
              Abrir
            </button>
            <button type="button" disabled={disabled} onClick={() => setConfirmAll(true)}>
              Abrir todos ({count})
            </button>
          </div>

          {count === 0 && (
            <p className={styles.muted}>
              No hay cofres para abrir. Se consiguen con los PE cerrados en Gestask y se abren desde las 8:00 del día
              siguiente.
            </p>
          )}
        </>
      )}

      {confirmAll && (
        <div className={styles.overlay}>
          <div
            ref={confirmRef}
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-label="Abrir todos los cofres"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setConfirmAll(false);
              }
            }}
          >
            <h2>Abrir todos los cofres</h2>
            <div className={styles.dialogBody}>
              <p>{count === 1 ? 'Se abrirá 1 cofre.' : `Se abrirán ${count} cofres.`}</p>
              <div className={styles.dialogActions}>
                <button type="button" onClick={() => setConfirmAll(false)}>
                  Cancelar
                </button>
                <button type="button" data-primary className={styles.primary} onClick={() => void openAll()}>
                  Abrir todos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
