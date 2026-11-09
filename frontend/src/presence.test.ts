import type { Mock } from 'vitest';
import { api } from './api';
import { RETRY_DELAY, startPresence, UPDATE_FAILED } from './presence';
import { useUi } from './shell/uiStore';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    api: {
      health: vi.fn(),
      bye: vi.fn(),
      refreshToken: vi.fn().mockResolvedValue(undefined),
      appBuild: vi.fn().mockResolvedValue(5),
      catalog: vi.fn().mockResolvedValue([]),
    },
  };
});

const mocked = vi.mocked(api);

/** Canal de eventos simulado: sigue abierto hasta que se llama a end(). */
function eventStream() {
  let end: () => void = () => {};
  const done = new Promise<void>((resolve) => (end = resolve));
  const reader = { read: vi.fn(async () => (await done, { done: true, value: undefined })) };
  return { response: { ok: true, status: 200, body: { getReader: () => reader } }, end };
}

let streams: ReturnType<typeof eventStream>[];
let stop: (() => void) | undefined;
let reload: Mock<() => void>;

/** La ventana arranca con el build 5; el canal se corta y el servidor vuelve con ese build. */
async function restartWith(build: number | null) {
  mocked.health.mockResolvedValue(true);
  stop = startPresence();
  await vi.advanceTimersByTimeAsync(0);
  mocked.appBuild.mockResolvedValue(build);
  streams[0].end();
  await vi.advanceTimersByTimeAsync(RETRY_DELAY);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  streams = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const s = eventStream();
      streams.push(s);
      return s.response;
    }),
  );
  mocked.appBuild.mockResolvedValue(5);
  reload = vi.fn<() => void>();
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
  useUi.setState({ contactLost: false, updating: false, notices: [] });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('R-45 tras reiniciarse el servidor', () => {
  it('U-07 R-45: con otro build relee el token y recarga la ventana', async () => {
    await restartWith(6);
    expect(mocked.refreshToken).toHaveBeenCalledTimes(1);
    expect(useUi.getState().contactLost).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('U-07 R-45: con el mismo build no recarga y vuelve a cargar el catálogo', async () => {
    await restartWith(5);
    expect(reload).not.toHaveBeenCalled();
    expect(mocked.catalog).toHaveBeenCalledTimes(1);
    expect(useUi.getState().notices).toEqual([]);
  });

  it('R-45: si se pidió actualizar y vuelve el mismo build, avisa de que sigue la versión anterior', async () => {
    useUi.setState({ updating: true });
    await restartWith(5);
    expect(reload).not.toHaveBeenCalled();
    expect(useUi.getState().updating).toBe(false);
    expect(useUi.getState().notices.at(-1)).toMatchObject({ kind: 'error', text: UPDATE_FAILED });
  });

  it('R-45: sin saber el build no recarga', async () => {
    await restartWith(null);
    expect(reload).not.toHaveBeenCalled();
  });
});
