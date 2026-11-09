import { act, fireEvent, render, screen } from '@testing-library/react';
import { installFakeServer, resetShell } from '../test/fakeServer';
import { InApp, testContext } from '../test/miniApp';
import { APP_STATE_DELAY, appStateDoc, flushAppStates } from './appState';
import { useAppState } from './index';

function Filter() {
  const [filter, setFilter, ready] = useAppState('filter', 'todas');
  return (
    <div>
      <output aria-label="filtro">{filter}</output>
      <output aria-label="cargado">{String(ready)}</output>
      <button type="button" onClick={() => setFilter('pendientes')}>
        Pendientes
      </button>
      <button type="button" onClick={() => setFilter((f) => `${f}+`)}>
        Más
      </button>
    </div>
  );
}

beforeEach(() => {
  resetShell();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('P-14 estado de interfaz de la mini app', () => {
  it('recupera lo guardado al abrirse', async () => {
    installFakeServer({ appStates: { demo: { filter: 'hechas' } } });
    render(
      <InApp value={testContext()}>
        <Filter />
      </InApp>,
    );
    expect(screen.getByLabelText('filtro').textContent).toBe('todas');
    expect(await screen.findByText('hechas')).toBeTruthy();
    expect(screen.getByLabelText('cargado').textContent).toBe('true');
  });

  it(`guarda ${APP_STATE_DELAY} ms después del último cambio, en un documento por mini app`, async () => {
    vi.useFakeTimers();
    const server = installFakeServer({ appStates: { demo: { otro: 1 } } });
    render(
      <InApp value={testContext()}>
        <Filter />
      </InApp>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    fireEvent.click(screen.getByText('Pendientes'));
    fireEvent.click(screen.getByText('Más'));
    expect(screen.getByLabelText('filtro').textContent).toBe('pendientes+');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_STATE_DELAY - 50);
    });
    expect(server.callsTo('PUT', '/api/app-state/')).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(server.callsTo('PUT', '/api/app-state/')).toHaveLength(1);
    expect(server.appStates.demo).toEqual({ otro: 1, filter: 'pendientes+' });
  });

  it('no guarda antes de haber cargado lo guardado, para no pisarlo', async () => {
    const server = installFakeServer({ appStates: { demo: { otro: 1 } } });
    const doc = appStateDoc('demo');
    doc.set('filter', 'x');
    await doc.flush();
    expect(server.callsTo('GET', '/api/app-state/demo')).toHaveLength(1);
    expect(server.appStates.demo).toEqual({ otro: 1, filter: 'x' });
  });

  it('al cerrar la ventana guarda lo pendiente de todas las mini apps con keepalive', async () => {
    const server = installFakeServer();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    appStateDoc('a').set('k', 1);
    appStateDoc('b').set('k', 2);
    await flushAppStates(true);
    expect(server.appStates).toEqual({ a: { k: 1 }, b: { k: 2 } });
    const puts = fetchSpy.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts.every(([, init]) => init?.keepalive === true)).toBe(true);
  });

  it('cada mini app tiene su propio documento', async () => {
    installFakeServer({ appStates: { demo: { filter: 'de demo' }, otra: { filter: 'de otra' } } });
    render(
      <>
        <InApp value={testContext({ id: 'demo' })}>
          <Filter />
        </InApp>
        <InApp value={testContext({ id: 'otra' })}>
          <Filter />
        </InApp>
      </>,
    );
    expect(await screen.findByText('de demo')).toBeTruthy();
    expect(await screen.findByText('de otra')).toBeTruthy();
  });
});
