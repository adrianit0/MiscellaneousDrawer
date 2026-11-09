import { comboFromEvent } from '../platform/shortcuts';

/** N-10: acciones de los atajos del shell. Alt+← y Alt+→ son del navegador (N-02). */
export type ShellAction =
  | { kind: 'palette' }
  | { kind: 'home' }
  | { kind: 'pinned'; index: number }
  | { kind: 'cycle'; step: 1 | -1 }
  | { kind: 'close' };

export function matchShellShortcut(e: KeyboardEvent): ShellAction | null {
  const combo = comboFromEvent(e);
  if (combo === 'Ctrl+K') return { kind: 'palette' };
  if (combo === 'Alt+0') return { kind: 'home' };
  const pinned = /^Alt\+([1-9])$/.exec(combo);
  if (pinned) return { kind: 'pinned', index: Number(pinned[1]) - 1 };
  if (combo === 'Alt+PageUp') return { kind: 'cycle', step: -1 };
  if (combo === 'Alt+PageDown') return { kind: 'cycle', step: 1 };
  if (combo === 'Alt+W') return { kind: 'close' };
  return null;
}
