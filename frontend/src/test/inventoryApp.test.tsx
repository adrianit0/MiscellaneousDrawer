import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { formatDate, InventoryApp, type InventoryItem } from '../apps/inventory/InventoryApp';
import { createAppApi } from '../platform/appApi';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** IN-10 a IN-21: la interfaz de «Inventario», con su API simulada. Datos inventados. */

const BASE = '/api/apps/inventory';

const GOLD: InventoryItem = {
  id: 'orb-gold',
  name: 'Orbe dorado',
  rarity: 'legendary',
  count: 1,
  firstAt: '2026-11-21T07:10:00Z',
  lastAt: '2026-11-21T07:10:00Z',
};
const WHITE: InventoryItem = {
  id: 'orb-white',
  name: 'Orbe blanco',
  rarity: 'common',
  count: 12,
  firstAt: '2026-11-20T07:00:00Z',
  lastAt: '2026-11-22T07:05:00Z',
};

let server: FakeServer;
let items: InventoryItem[];
let fail: boolean;

function route(call: Call): { status?: number; body?: unknown } | undefined {
  if (call.url === `${BASE}/items` && call.method === 'GET') {
    if (fail) return { status: 500, body: { code: 'internal_error', message: 'Error interno', details: null } };
    return { body: { items } };
  }
  return undefined;
}

const api = createAppApi('inventory');

function Harness({ active = true }: { active?: boolean }) {
  const value = useMemo(() => testContext({ id: 'inventory', api, active }), [active]);
  return (
    <InApp value={value}>
      <InventoryApp />
    </InApp>
  );
}

beforeEach(() => {
  resetShell();
  items = [GOLD, WHITE];
  fail = false;
  server = installFakeServer({ appRoutes: route });
});

describe('IN-10 a IN-21 inventario', () => {
  it('IN-10: muestra el total y una tarjeta por objeto, en el orden del servidor, con su rareza y su cantidad', async () => {
    render(<Harness />);
    expect(await screen.findByRole('heading', { name: '13 objetos' })).toBeTruthy();
    const cards = within(screen.getByRole('list', { name: 'Objetos' })).getAllByRole('listitem');
    expect(cards.map((c) => c.textContent?.split('Primero')[0])).toEqual(['Orbe doradoLegendario×1', 'Orbe blancoComún×12']);
  });

  it('IN-12: cada tarjeta lleva la fecha del primero y del último', async () => {
    render(<Harness />);
    await screen.findByRole('heading', { name: '13 objetos' });
    const card = within(screen.getByRole('list', { name: 'Objetos' })).getAllByRole('listitem')[1];
    const expected = `Primero: ${formatDate(WHITE.firstAt)} · Último: ${formatDate(WHITE.lastAt)}`;
    expect(card.getAttribute('title')).toBe(expected);
    expect(card.tabIndex).toBe(0);
    expect(formatDate('2026-01-05T09:07:00')).toBe('05/01/2026 09:07');
  });

  it('IN-11: sin objetos, lo dice y enlaza a «Lootboxes»', async () => {
    items = [];
    render(<Harness />);
    expect(await screen.findByText('Todavía no tienes objetos. Se consiguen abriendo cofres en Lootboxes.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Lootboxes' }).getAttribute('href')).toBe('#/apps/lootboxes');
  });

  it('IN-20: un fallo al cargar se dice con «Reintentar»', async () => {
    fail = true;
    render(<Harness />);
    expect((await screen.findByRole('alert')).textContent).toContain('Error interno');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: '13 objetos' })).toBeTruthy();
  });

  it('IN-21: vuelve a pedir los objetos al mostrarse de nuevo', async () => {
    const view = render(<Harness />);
    await screen.findByRole('heading', { name: '13 objetos' });
    view.rerender(<Harness active={false} />);
    items = [{ ...WHITE, count: 1 }];
    view.rerender(<Harness active />);
    expect(await screen.findByRole('heading', { name: '1 objeto' })).toBeTruthy();
    await waitFor(() => expect(server.callsTo('GET', `${BASE}/items`)).toHaveLength(2));
  });
});
