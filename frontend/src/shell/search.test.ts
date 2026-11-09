import { byName, CATEGORIES, matchesApp, matchesText, normalize } from './search';

const tasks = { name: 'Tareas', description: 'Gestor de tareas', keywords: ['pendientes', 'por hacer'] };
const db = { name: 'Base de datos', description: 'Gestor de bases de datos', keywords: ['sql', 'tablas'] };

describe('L-03, N-09 búsqueda sin mayúsculas ni acentos', () => {
  it('normaliza', () => {
    expect(normalize('  Árbol ÑANDÚ ')).toBe('arbol nandu');
  });

  it.each([
    ['tareas', tasks, true],
    ['TAREAS', tasks, true],
    ['pendient', tasks, true],
    ['gestor tareas', tasks, true],
    ['gestor sql', db, true],
    ['tablas', db, true],
    ['bases', tasks, false],
    ['', tasks, true],
  ])('«%s»', (query, app, expected) => {
    expect(matchesApp(app, query)).toBe(expected);
  });

  it('busca en textos con acentos', () => {
    expect(matchesText('Configuración general', 'configuracion')).toBe(true);
    expect(matchesText('Inicio', 'ajustes')).toBe(false);
  });
});

describe('L-01 orden', () => {
  it('ordena por nombre en español', () => {
    expect(byName([{ name: 'Tareas' }, { name: 'árbol' }, { name: 'Base de datos' }]).map((a) => a.name)).toEqual([
      'árbol',
      'Base de datos',
      'Tareas',
    ]);
  });

  it('las categorías van en el orden Datos, Productividad, Utilidades', () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual(['Datos', 'Productividad', 'Utilidades']);
  });
});
