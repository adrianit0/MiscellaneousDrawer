import { appIdFromModulePath, appModules, registryFrom } from './registry';

describe('P-11 interfaz por convención', () => {
  it('el identificador sale de la carpeta', () => {
    expect(appIdFromModulePath('../apps/tasks/index.tsx')).toBe('tasks');
    expect(appIdFromModulePath('../apps/json-tools/index.tsx')).toBe('json-tools');
    expect(appIdFromModulePath('../apps/tasks/Other.tsx')).toBeNull();
  });

  it('solo registra los index.tsx de las carpetas de apps', () => {
    const loader = async () => ({ default: { Root: () => null } });
    expect(Object.keys(registryFrom({ '../apps/a/index.tsx': loader, '../apps/b/index.tsx': loader, '../x.tsx': loader }))).toEqual([
      'a',
      'b',
    ]);
  });

  it('las carpetas reales de src/apps tienen identificadores válidos (P-01)', () => {
    for (const id of Object.keys(appModules)) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
      expect(id.length).toBeLessThanOrEqual(32);
    }
  });
});
