import { TOKEN_HEADER } from '../api';
import { installFakeServer, resetShell } from '../test/fakeServer';
import { appApiPath, createAppApi } from './appApi';
import { ApiError } from './index';

beforeEach(() => {
  resetShell();
  document.head.innerHTML = '<meta name="cajonsastre-token" content="token-de-prueba">';
});

describe('P-13 cliente de API acotado', () => {
  it('llama solo al espacio de la mini app, con el token', async () => {
    const server = installFakeServer({
      appRoutes: (call) => ({ body: call.url === '/api/apps/tasks/items?done=true' ? [{ title: 'Primera' }] : {} }),
    });
    const api = createAppApi('tasks');
    await expect(api.get('/items?done=true')).resolves.toEqual([{ title: 'Primera' }]);
    await api.post('/items', { title: 'Segunda' });
    await api.put('/items/1', { title: 'x' });
    await api.patch('/items/1', { done: true });
    await api.delete('/items/1');
    expect(server.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/apps/tasks/items?done=true',
      'POST /api/apps/tasks/items',
      'PUT /api/apps/tasks/items/1',
      'PATCH /api/apps/tasks/items/1',
      'DELETE /api/apps/tasks/items/1',
    ]);
    expect(server.calls.every((c) => c.headers[TOKEN_HEADER] === 'token-de-prueba')).toBe(true);
    expect(server.calls[1].body).toEqual({ title: 'Segunda' });
  });

  it.each(['items', '//evil.example/x', '/../catalog', '/a/../../app-state/x', '/a/%2E%2E/b', '/a\\b', '/a#b', '/a b', '/./a'])(
    'rechaza «%s» sin llegar al servidor',
    async (path) => {
      const server = installFakeServer();
      expect(() => appApiPath('tasks', path)).toThrow(ApiError);
      await expect(createAppApi('tasks').get(path)).rejects.toMatchObject({ code: 'invalid_path' });
      expect(server.calls).toHaveLength(0);
    },
  );

  it('los errores de la mini app llegan con el formato de A-02', async () => {
    installFakeServer({
      appRoutes: () => ({ status: 409, body: { code: 'conflict', message: 'Ya existe', details: { id: 1 } } }),
    });
    await expect(createAppApi('tasks').post('/items', {})).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
      message: 'Ya existe',
      details: { id: 1 },
    });
  });
});
