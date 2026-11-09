import { useEffect, useRef } from 'react';
import { useMiniApp } from './context';

/** N-10: atajos del shell. Esc no está: cada mini app puede usarlo para cerrar lo suyo. */
export const SHELL_SHORTCUTS: readonly string[] = [
  'Ctrl+K',
  ...Array.from({ length: 10 }, (_, i) => `Alt+${i}`),
  'Alt+PageUp',
  'Alt+PageDown',
  'Alt+W',
  // N-02: «Atrás» y «Adelante» del navegador.
  'Alt+ArrowLeft',
  'Alt+ArrowRight',
];

/** U-04: atajos reservados por el navegador. */
export const BROWSER_SHORTCUTS: readonly string[] = [
  'Ctrl+N',
  'Ctrl+T',
  'Ctrl+W',
  'Ctrl+Tab',
  'Ctrl+Shift+Tab',
  'Ctrl+L',
  'Ctrl+R',
  'Ctrl+F',
  'Ctrl+P',
  'Ctrl+Shift+N',
  'Ctrl+Shift+T',
  'F5',
  'F11',
];

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const NAMED_KEYS = new Map(
  [
    'PageUp',
    'PageDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Enter',
    'Escape',
    'Tab',
    'Home',
    'End',
    'Delete',
    'Backspace',
    'Insert',
    'Space',
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ].map((k) => [k.toLowerCase(), k]),
);

/** «ctrl+shift+k» → «Ctrl+Shift+K»; lanza si no es un atajo válido. */
export function normalizeCombo(combo: string): string {
  const parts = combo.split('+').map((p) => p.trim());
  const key = parts.pop() ?? '';
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  for (const m of mods) {
    if (!MODIFIERS.some((known) => known.toLowerCase() === m)) throw new Error(`Modificador desconocido en el atajo ${combo}`);
  }
  const normalizedKey = key.length === 1 ? key.toUpperCase() : NAMED_KEYS.get(key.toLowerCase());
  if (!normalizedKey) throw new Error(`Tecla desconocida en el atajo ${combo}`);
  return [...MODIFIERS.filter((m) => mods.has(m.toLowerCase())), normalizedKey].join('+');
}

/** El atajo de una pulsación, con la tecla física para letras y cifras (independiente de la distribución). */
export function comboFromEvent(e: KeyboardEvent): string {
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad[0-9]$/.test(e.code)) key = e.code.slice(6);
  else if (e.key === ' ') key = 'Space';
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean);
  return [...mods, key].join('+');
}

export function isReserved(combo: string): boolean {
  const normalized = normalizeCombo(combo);
  return SHELL_SHORTCUTS.includes(normalized) || BROWSER_SHORTCUTS.includes(normalized);
}

/**
 * P-16: atajo de la mini app; solo actúa mientras está visible. Un atajo reservado por el shell (N-10) o por el
 * navegador (U-04) lanza un error, que el marco de la mini app muestra (P-15).
 */
export function useAppShortcut(combo: string, handler: (e: KeyboardEvent) => void): void {
  const { active } = useMiniApp();
  const normalized = normalizeCombo(combo);
  if (isReserved(normalized)) {
    throw new Error(`El atajo ${normalized} está reservado por el shell o por el navegador`);
  }
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || comboFromEvent(e) !== normalized) return;
      e.preventDefault();
      handlerRef.current(e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, normalized]);
}
