import { fireEvent, render } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { InApp, testContext } from '../test/miniApp';
import { BROWSER_SHORTCUTS, comboFromEvent, isReserved, normalizeCombo, SHELL_SHORTCUTS } from './shortcuts';
import { useAppShortcut } from './index';

function key(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

describe('P-16 atajos', () => {
  it('normaliza los atajos', () => {
    expect(normalizeCombo('ctrl+shift+k')).toBe('Ctrl+Shift+K');
    expect(normalizeCombo('Shift+Alt+n')).toBe('Alt+Shift+N');
    expect(normalizeCombo('alt+pageup')).toBe('Alt+PageUp');
    expect(normalizeCombo('f2')).toBe('F2');
    expect(() => normalizeCombo('Hyper+K')).toThrow('Modificador desconocido');
    expect(() => normalizeCombo('Ctrl+Nada')).toThrow('Tecla desconocida');
  });

  it('lee la tecla física de letras y cifras', () => {
    expect(comboFromEvent(key({ key: 'k', code: 'KeyK', ctrlKey: true }))).toBe('Ctrl+K');
    expect(comboFromEvent(key({ key: '¡', code: 'Digit1', altKey: true }))).toBe('Alt+1');
    expect(comboFromEvent(key({ key: 'PageDown', code: 'PageDown', altKey: true }))).toBe('Alt+PageDown');
    expect(comboFromEvent(key({ key: 'Escape', code: 'Escape' }))).toBe('Escape');
  });

  it('N-10, U-04: los atajos del shell y del navegador están reservados; Esc no', () => {
    for (const combo of ['Ctrl+K', 'Alt+0', 'Alt+9', 'Alt+PageUp', 'Alt+PageDown', 'Alt+W', 'Alt+ArrowLeft', 'Alt+ArrowRight']) {
      expect(SHELL_SHORTCUTS).toContain(combo);
      expect(isReserved(combo)).toBe(true);
    }
    for (const combo of ['Ctrl+N', 'Ctrl+T', 'Ctrl+W', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+L', 'Ctrl+R', 'Ctrl+F', 'Ctrl+P', 'F5', 'F11']) {
      expect(BROWSER_SHORTCUTS).toContain(combo);
      expect(isReserved(combo)).toBe(true);
    }
    expect(isReserved('Escape')).toBe(false);
    expect(isReserved('Alt+N')).toBe(false);
  });

  function Shortcut({ combo, onFire }: { combo: string; onFire: () => void }) {
    useAppShortcut(combo, onFire);
    return null;
  }

  it('solo actúa mientras la mini app está visible', () => {
    const fired = vi.fn();
    const { rerender } = render(
      <InApp value={testContext({ active: true })}>
        <Shortcut combo="alt+n" onFire={fired} />
      </InApp>,
    );
    const event = key({ key: 'n', code: 'KeyN', altKey: true });
    window.dispatchEvent(event);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    rerender(
      <InApp value={testContext({ active: false })}>
        <Shortcut combo="alt+n" onFire={fired} />
      </InApp>,
    );
    fireEvent.keyDown(window, { key: 'n', code: 'KeyN', altKey: true });
    expect(fired).toHaveBeenCalledTimes(1);
  });

  class Catch extends Component<{ children: ReactNode }, { error: string | null }> {
    state = { error: null as string | null };
    static getDerivedStateFromError(e: Error) {
      return { error: e.message };
    }
    render() {
      return this.state.error ? <p>{this.state.error}</p> : this.props.children;
    }
  }

  it('un atajo reservado lanza un error al registrarse', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <Catch>
        <InApp value={testContext()}>
          <Shortcut combo="Ctrl+K" onFire={() => {}} />
        </InApp>
      </Catch>,
    );
    expect(container.textContent).toBe('El atajo Ctrl+K está reservado por el shell o por el navegador');
    vi.restoreAllMocks();
  });
});
