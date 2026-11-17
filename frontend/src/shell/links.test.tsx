import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import { app, installFakeServer, resetShell, type FakeServer } from '../test/fakeServer';
import { externalUrl } from './links';
import { ModuleRegistryContext, type ModuleRegistry } from './registry';

const TICKET = 'https://tickets.example.com/browse/ABC-1';

/** Una mini app con enlaces como los de «Gestask»: el externo detiene la propagación del clic. */
function Links() {
  return (
    <div>
      <a href={TICKET} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        Ticket <strong>ABC-1</strong>
      </a>
      <a href="https://pr.example.com/42">PR</a>
      <a href="#/apps/links/otra">Sección</a>
    </div>
  );
}

const registry: ModuleRegistry = { links: async () => ({ default: { Root: Links } }) };

let server: FakeServer;

async function renderApp() {
  window.location.hash = '#/apps/links';
  render(
    <ModuleRegistryContext.Provider value={registry}>
      <App />
    </ModuleRegistryContext.Provider>,
  );
  await screen.findByRole('link', { name: 'Ticket ABC-1' });
}

beforeEach(() => {
  resetShell();
  server = installFakeServer({ catalog: [app({ id: 'links', name: 'Enlaces' })] });
});

describe('C-16 los enlaces externos se abren en el Chrome habitual', () => {
  it('C-16: solo salen de la ventana los enlaces http o https de otro origen', () => {
    const origin = 'http://127.0.0.1:47800';
    expect(externalUrl('https://example.com/a b?q=año', origin)).toBe('https://example.com/a%20b?q=a%C3%B1o');
    expect(externalUrl('http://localhost:47800/', origin)).toBe('http://localhost:47800/');
    expect(externalUrl('#/apps/gestask', origin)).toBeNull();
    expect(externalUrl('/api/apps/demo/report', origin)).toBeNull();
    expect(externalUrl('http://127.0.0.1:47800/#/', origin)).toBeNull();
    expect(externalUrl('mailto:alguien@example.com', origin)).toBeNull();
    expect(externalUrl('javascript:void(0)', origin)).toBeNull();
    expect(externalUrl('file:///tmp/informe.html', origin)).toBeNull();
  });

  it('C-16: un clic en un enlace de una mini app lo abre fuera, aunque detenga la propagación', async () => {
    await renderApp();
    const ticket = screen.getByText('ABC-1');
    // false: la ventana no lo abre.
    expect(fireEvent.click(ticket)).toBe(false);
    await waitFor(() => expect(server.links.opened).toEqual([TICKET]));
    expect(server.callsTo('POST', '/api/open-link')[0].body).toEqual({ url: TICKET });
  });

  it('C-16: también con Ctrl, Mayúsculas o el botón central; el derecho no', async () => {
    await renderApp();
    const pr = screen.getByRole('link', { name: 'PR' });
    expect(fireEvent.click(pr, { ctrlKey: true })).toBe(false);
    expect(fireEvent.click(pr, { shiftKey: true })).toBe(false);
    expect(fireEvent(pr, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))).toBe(false);
    expect(fireEvent(pr, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 }))).toBe(true);
    await waitFor(() => expect(server.links.opened).toHaveLength(3));
    expect(new Set(server.links.opened)).toEqual(new Set(['https://pr.example.com/42']));
  });

  it('C-16: las rutas de la aplicación siguen en la ventana', async () => {
    await renderApp();
    expect(fireEvent.click(screen.getByRole('link', { name: 'Sección' }))).toBe(true);
    expect(server.callsTo('POST', '/api/open-link')).toEqual([]);
  });

  it('C-16 U-05: si no se puede abrir, lo avisa', async () => {
    server.links.error = 'No se pudo abrir el enlace: no se encontró Chrome ni xdg-open';
    await renderApp();
    fireEvent.click(screen.getByRole('link', { name: 'PR' }));
    expect(await screen.findByText('No se pudo abrir el enlace: no se encontró Chrome ni xdg-open')).toBeTruthy();
  });
});
