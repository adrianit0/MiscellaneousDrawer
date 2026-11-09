import { cssViolations, importViolations } from './boundaries';

const sources = import.meta.glob<string>('./apps/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
const styles = Object.keys(import.meta.glob('./apps/**/*.css', { query: '?raw', eager: true }));
const relative = (path: string) => path.replace(/^\.\//, '');

describe('P-18 las mini apps solo importan la plataforma y su carpeta', () => {
  it('en el código real de src/apps', () => {
    const violations = Object.entries(sources).flatMap(([path, source]) => importViolations(relative(path), source));
    expect(violations).toEqual([]);
  });

  it('detecta importaciones del shell, de otras mini apps y rutas absolutas', () => {
    const source = `
      import { useMiniApp } from '../../platform';
      import type { AppApi } from '../../platform/types';
      import { Lista } from './Lista';
      import { util } from '../tasks/util/fechas';
      import { create } from 'zustand';
      import './Tareas.module.css';
      import { useNav } from '../../shell/navStore';
      import { api } from '../../api';
      import { Otra } from '../notes/Otra';
      export { x } from '../../App';
      const lazy = import('../notes/lazy');
      import abs from '/src/shell/router';
      import alias from 'src/shell/router';
    `;
    expect(importViolations('apps/tasks/Tareas.tsx', source)).toEqual([
      'apps/tasks/Tareas.tsx: importa ../../shell/navStore',
      'apps/tasks/Tareas.tsx: importa ../../api',
      'apps/tasks/Tareas.tsx: importa ../notes/Otra',
      'apps/tasks/Tareas.tsx: importa ../../App',
      'apps/tasks/Tareas.tsx: importa ../notes/lazy',
      'apps/tasks/Tareas.tsx: importa /src/shell/router',
      'apps/tasks/Tareas.tsx: importa src/shell/router',
    ]);
  });

  it('resuelve las rutas relativas desde subcarpetas', () => {
    const source = `
      import { useMiniApp } from '../../../platform';
      import { Lista } from '../Lista';
      import { mal } from '../../../shell/router';
      import { otra } from '../../notes/x';
    `;
    expect(importViolations('apps/tasks/sub/Detalle.tsx', source)).toEqual([
      'apps/tasks/sub/Detalle.tsx: importa ../../../shell/router',
      'apps/tasks/sub/Detalle.tsx: importa ../../notes/x',
    ]);
  });

  it('una carpeta con un nombre que empieza como otra no es la suya', () => {
    expect(importViolations('apps/task/index.tsx', "import x from '../tasks/x';")).toEqual(['apps/task/index.tsx: importa ../tasks/x']);
  });
});

describe('P-17 sin estilos globales en las mini apps', () => {
  it('en el código real de src/apps', () => {
    expect(cssViolations(styles.map(relative))).toEqual([]);
  });

  it('detecta hojas que no son CSS Modules', () => {
    expect(cssViolations(['apps/tasks/Tareas.module.css', 'apps/tasks/global.css', 'shell/x.css'])).toEqual([
      'apps/tasks/global.css: no es un CSS Module',
    ]);
  });
});
