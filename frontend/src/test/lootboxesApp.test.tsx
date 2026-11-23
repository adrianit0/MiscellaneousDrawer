import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { LootboxesApp } from '../apps/lootboxes/LootboxesApp';
import { best, ITEM_MS, SHAKE_MS, summarize, SUMMARY_MS, type Chest, type Opened } from '../apps/lootboxes/types';
import { createAppApi } from '../platform/appApi';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** LB-20 a LB-27: la interfaz de «Lootboxes», con su API simulada. Datos inventados. */

const BASE = '/api/apps/lootboxes';
const WHITE = { id: 'orb-white', name: 'Orbe blanco', rarity: 'common' };
const GREEN = { id: 'orb-green', name: 'Orbe verde', rarity: 'uncommon' };
const GOLD = { id: 'orb-gold', name: 'Orbe dorado', rarity: 'legendary' };

interface Backend {
  chests: Chest[];
  rewards: Record<string, Opened['items']>;
  failOpen: boolean;
  failList: boolean;
}

let server: FakeServer;
let backend: Backend;
let notices: { text: string; kind: string | undefined }[];
let reduce: boolean;

function route(call: Call): { status?: number; body?: unknown } | undefined {
  const path = call.url.slice(BASE.length);
  if (path === '/chests' && call.method === 'GET') {
    if (backend.failList) return { status: 500, body: { code: 'internal_error', message: 'Error interno', details: null } };
    return { body: { chests: backend.chests } };
  }
  if (backend.failOpen && call.method === 'POST') {
    return { status: 409, body: { code: 'chest_opened', message: 'El cofre ya está abierto', details: null } };
  }
  if (path === '/chests/open-all' && call.method === 'POST') {
    const opened = backend.chests.map((c) => ({ chest: c.id, items: backend.rewards[c.id] ?? [WHITE] }));
    backend.chests = [];
    return { body: { opened } };
  }
  const match = /^\/chests\/([^/]+)\/open$/.exec(path);
  if (match && call.method === 'POST') {
    const id = decodeURIComponent(match[1]);
    backend.chests = backend.chests.filter((c) => c.id !== id);
    return { body: { chest: id, items: backend.rewards[id] ?? [WHITE] } };
  }
  return undefined;
}

const api = createAppApi('lootboxes');

function Harness({ active = true }: { active?: boolean }) {
  const value = useMemo(
    () => testContext({ id: 'lootboxes', api, active, notify: (text, kind) => notices.push({ text, kind }) }),
    [active],
  );
  return (
    <InApp value={value}>
      <LootboxesApp />
    </InApp>
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const rewards = (name = 'Recompensas') =>
  within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);
const opens = () => server.calls.filter((c) => c.method === 'POST');

beforeEach(() => {
  resetShell();
  notices = [];
  reduce = false;
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  backend = {
    chests: [
      { id: 'c1', earnedOn: '2026-11-20' },
      { id: 'c2', earnedOn: '2026-11-20' },
      { id: 'c3', earnedOn: '2026-11-21' },
    ],
    rewards: { c1: [WHITE, GOLD], c2: [GREEN], c3: [WHITE, WHITE, GREEN] },
    failOpen: false,
    failList: false,
  };
  server = installFakeServer({ appRoutes: route });
});

describe('LB-20 pantalla', () => {
  it('LB-20: dice cuántos cofres hay y ofrece «Abrir» y «Abrir todos (N)»', async () => {
    render(<Harness />);
    expect(await screen.findByRole('heading', { name: '3 cofres para abrir' })).toBeTruthy();
    expect(button('Abrir').disabled).toBe(false);
    expect(button('Abrir todos (3)').disabled).toBe(false);
  });

  it('LB-20: sin cofres, lo dice y desactiva los botones', async () => {
    backend.chests = [];
    render(<Harness />);
    expect(await screen.findByText(/No hay cofres para abrir\. Se consiguen con los PE cerrados en Gestask/)).toBeTruthy();
    expect(button('Abrir').disabled).toBe(true);
    expect(button('Abrir todos (0)').disabled).toBe(true);
  });

  it('LB-27: un fallo al cargar se dice con «Reintentar»', async () => {
    backend.failList = true;
    render(<Harness />);
    expect((await screen.findByRole('alert')).textContent).toContain('Error interno');
    backend.failList = false;
    fireEvent.click(button('Reintentar'));
    expect(await screen.findByRole('heading', { name: '3 cofres para abrir' })).toBeTruthy();
  });

  it('LB-27: vuelve a pedir los cofres al mostrarse de nuevo', async () => {
    const view = render(<Harness />);
    await screen.findByRole('heading', { name: '3 cofres para abrir' });
    view.rerender(<Harness active={false} />);
    backend.chests = [{ id: 'c9', earnedOn: '2026-11-22' }];
    view.rerender(<Harness active />);
    expect(await screen.findByRole('heading', { name: '1 cofre para abrir' })).toBeTruthy();
    expect(server.callsTo('GET', `${BASE}/chests`)).toHaveLength(2);
  });
});

describe('LB-21 y LB-22 abrir un cofre', () => {
  it('LB-21, LB-22: abre el más antiguo y las recompensas aparecen solas en menos de 3 s', async () => {
    render(<Harness />);
    await screen.findByRole('heading', { name: '3 cofres para abrir' });
    fireEvent.click(button('Abrir'));
    await waitFor(() => expect(opens()).toHaveLength(1));
    expect(opens()[0].url).toBe(`${BASE}/chests/c1/open`);
    // Mientras dura la animación, no se puede abrir otro.
    expect(await screen.findByText('Pulsa para saltar la animación')).toBeTruthy();
    expect(button('Abrir').disabled).toBe(true);

    await waitFor(() => expect(rewards()).toEqual(['Orbe blancoComún', 'Orbe doradoLegendario']), { timeout: 3000 });
    expect(screen.queryByText('Pulsa para saltar la animación')).toBeNull();
    expect(screen.getByRole('heading', { name: '2 cofres para abrir' })).toBeTruthy();
    expect(button('Abrir').disabled).toBe(false);
  });

  it('LB-22: pulsar el cofre salta al resultado', async () => {
    render(<Harness />);
    await screen.findByRole('heading', { name: '3 cofres para abrir' });
    fireEvent.click(button('Abrir'));
    await screen.findByText('Pulsa para saltar la animación');
    fireEvent.click(screen.getByTestId('stage'));
    expect(rewards()).toEqual(['Orbe blancoComún', 'Orbe doradoLegendario']);
  });

  it.each(['Enter', ' ', 'Escape'])('LB-22: la tecla «%s» salta al resultado', async (key) => {
    render(<Harness />);
    await screen.findByRole('heading', { name: '3 cofres para abrir' });
    fireEvent.click(button('Abrir'));
    await screen.findByText('Pulsa para saltar la animación');
    fireEvent.keyDown(document.body, { key });
    expect(rewards()).toEqual(['Orbe blancoComún', 'Orbe doradoLegendario']);
  });

  it('LB-22: la animación dura 3 s como mucho y el resumen 2 s', () => {
    expect(SHAKE_MS + 3 * ITEM_MS).toBeLessThanOrEqual(3000);
    expect(SUMMARY_MS).toBeLessThanOrEqual(2000);
  });

  it('LB-22: el destello toma el color de la mejor rareza', () => {
    expect(best([WHITE, GOLD, GREEN])).toBe('legendary');
    expect(best([WHITE])).toBe('common');
  });

  it('LB-24: con menos movimiento no hay animación', async () => {
    reduce = true;
    render(<Harness />);
    await screen.findByRole('heading', { name: '3 cofres para abrir' });
    fireEvent.click(button('Abrir'));
    await waitFor(() => expect(rewards()).toEqual(['Orbe blancoComún', 'Orbe doradoLegendario']));
    expect(screen.queryByText('Pulsa para saltar la animación')).toBeNull();
  });

  it('LB-21: si falla, avisa del error, recarga y no anima', async () => {
    render(<Harness />);
    await screen.findByRole('heading', { name: '3 cofres para abrir' });
    backend.failOpen = true;
    fireEvent.click(button('Abrir'));
    await waitFor(() => expect(notices).toEqual([{ text: 'El cofre ya está abierto', kind: 'error' }]));
    expect(screen.queryByText('Pulsa para saltar la animación')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Recompensas' })).toBeNull();
    await waitFor(() => expect(server.callsTo('GET', `${BASE}/chests`)).toHaveLength(2));
  });

  it('LB-25, LB-26: el resultado se queda, dice la rareza con texto y enlaza al inventario', async () => {
    reduce = true;
    render(<Harness />);
    await screen.findByRole('heading', { name: '3 cofres para abrir' });
    fireEvent.click(button('Abrir'));
    await waitFor(() => expect(rewards()).toHaveLength(2));
    expect(screen.getByText('Legendario')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver inventario' }).getAttribute('href')).toBe('#/apps/inventory');
  });
});

describe('LB-23 abrir todos', () => {
  it('LB-23: pide confirmación y Esc o «Cancelar» no abren nada', async () => {
    render(<Harness />);
    await screen.findByRole('heading', { name: '3 cofres para abrir' });
    fireEvent.click(button('Abrir todos (3)'));
    const dialog = screen.getByRole('alertdialog', { name: 'Abrir todos los cofres' });
    expect(dialog.textContent).toContain('Se abrirán 3 cofres.');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(button('Abrir todos (3)'));
    fireEvent.click(button('Cancelar'));
    expect(opens()).toHaveLength(0);
  });

  it('LB-23: los abre todos y resume cuántos de cada objeto, del mejor al peor', async () => {
    render(<Harness />);
    await screen.findByRole('heading', { name: '3 cofres para abrir' });
    fireEvent.click(button('Abrir todos (3)'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Abrir todos' }));
    await waitFor(() => expect(opens()).toHaveLength(1));
    expect(opens()[0].url).toBe(`${BASE}/chests/open-all`);
    await screen.findByText('Pulsa para saltar la animación');
    act(() => fireEvent.click(screen.getByTestId('stage')));
    expect(screen.getByRole('heading', { name: 'Has abierto 3 cofres' })).toBeTruthy();
    expect(rewards('Resumen')).toEqual(['Orbe doradoLegendario×1', 'Orbe verdePoco común×2', 'Orbe blancoComún×3']);
    expect(screen.getByRole('heading', { name: 'No hay cofres para abrir' })).toBeTruthy();
  });

  it('LB-23: el resumen ordena por rareza y nombre', () => {
    const list = summarize([
      { chest: 'a', items: [WHITE, GREEN] },
      { chest: 'b', items: [GREEN, GOLD] },
    ]);
    expect(list.map((e) => `${e.item.id}×${e.count}`)).toEqual(['orb-gold×1', 'orb-green×2', 'orb-white×1']);
  });
});
