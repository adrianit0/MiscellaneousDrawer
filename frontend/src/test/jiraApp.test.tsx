import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { JiraApp } from '../apps/jira/JiraApp';
import themeCss from '../theme.css?raw';
import {
  assigneeColors,
  categoryColor,
  COLOR_VARIABLES,
  HUES,
  hueColor,
  initials,
  matches,
  nextPriorityColor,
  normalize,
  PALETTE,
  rows,
  type Board,
  type BoardIssues,
  type ConfigView,
  type Issue,
  type JiraPriority,
  type JiraStatus,
  type PaletteColor,
} from '../apps/jira/types';
import { createAppApi } from '../platform/appApi';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** JR-30 a JR-45: la interfaz de «Tableros Jira», con su API simulada. No contacta con Jira. Datos inventados (S-31). */

const BASE = '/api/apps/jira';
const SITE = 'https://empresa-inventada.atlassian.net';

const CONFIG: ConfigView = { siteUrl: SITE, email: 'persona@example.test', tokenSet: true, missing: [] };
const EMPTY: ConfigView = { siteUrl: null, email: null, tokenSet: false, missing: ['siteUrl', 'email', 'token'] };

const STATUSES: Record<string, JiraStatus[]> = {
  PA: [
    { id: '10001', name: 'start', category: 'new' },
    { id: '10002', name: 'doing', category: 'indeterminate' },
    { id: '10003', name: 'testing', category: 'indeterminate' },
    { id: '10004', name: 'finished', category: 'done' },
  ],
  PB: [
    { id: '20001', name: 'created', category: 'new' },
    { id: '20002', name: 'analized', category: 'new' },
    { id: '20003', name: 'inprogress', category: 'indeterminate' },
    { id: '10003', name: 'testing', category: 'indeterminate' },
    { id: '20005', name: 'closed', category: 'done' },
  ],
};

/** JR-33: sin color dado, el de su categoría. */
const ref = (project: string, id: string, color?: PaletteColor) => {
  const status = STATUSES[project].find((s) => s.id === id)!;
  return { project, id, name: status.name, color: color ?? categoryColor(status.category) };
};

/** JR-19: las prioridades del ejemplo del usuario (ADR-0028). */
const PRIORITIES: JiraPriority[] = [
  { id: '1', name: 'Supone un impedimento' },
  { id: '2', name: 'Crítica' },
  { id: '3', name: 'Importante' },
  { id: '4', name: 'Trivial' },
];

/** El ejemplo del usuario (ADR-0027). */
const EXAMPLE: Board = {
  id: 1,
  name: 'Equipo',
  projects: ['PA', 'PB'],
  columns: [
    { name: 'To do', statuses: [ref('PA', '10001'), ref('PB', '20001'), ref('PB', '20002')] },
    { name: 'In progress', statuses: [ref('PA', '10002'), ref('PB', '20003')] },
    { name: 'Testing', statuses: [ref('PA', '10003', 'violet'), ref('PB', '10003', 'violet')] },
    { name: 'Closed', statuses: [ref('PA', '10004'), ref('PB', '20005')] },
  ],
  priorities: [
    { id: '1', name: 'Supone un impedimento', color: 'red' },
    { id: '3', name: 'Importante', color: 'gold' },
  ],
};
const SUPPORT: Board = {
  ...EXAMPLE,
  id: 2,
  name: 'Soporte',
  projects: ['PB'],
  columns: [{ name: 'Abiertos', statuses: [ref('PB', '20001')] }],
  priorities: [],
};

const issue = (key: string, status: string, summary: string, assignee: string | null, extra: Partial<Issue> = {}): Issue => ({
  key,
  summary,
  project: key.split('-')[0],
  status,
  statusColor: 'blue',
  assignee,
  priority: null,
  updated: '2026-11-23T09:00:00Z',
  ...extra,
});

const ISSUES: BoardIssues = {
  board: { id: 1, name: 'Equipo' },
  columns: [
    { name: 'To do', issues: [issue('PB-3', 'analized', 'Informe mensual', null), issue('PA-5', 'start', 'Nuevo filtro', 'Luis')] },
    { name: 'In progress', issues: [issue('PA-7', 'doing', 'Pantalla de alta', 'Ana')] },
    {
      name: 'Testing',
      issues: [
        issue('PA-6', 'testing', 'Validar importación', 'Luis', {
          statusColor: 'violet',
          priority: { id: '3', name: 'Importante', color: 'gold' },
        }),
        issue('PB-2', 'testing', 'Exportar a CSV', 'Ana', { statusColor: 'violet', priority: { id: '4', name: 'Trivial', color: null } }),
      ],
    },
    { name: 'Closed', issues: [issue('PB-1', 'closed', 'Cerrado hace poco', 'Ana')] },
  ],
  fetchedAt: '2026-11-23T10:00:00Z',
  truncated: false,
  missingStatuses: [],
};

interface Backend {
  config: ConfigView;
  boards: Board[];
  issues: Record<number, BoardIssues>;
  fail: { status: number; code: string; message: string; details?: unknown } | null;
}

let server: FakeServer;
let backend: Backend;
let notices: string[];

function route(call: Call): { status?: number; body?: unknown } | undefined {
  const path = call.url.slice(BASE.length);
  if (backend.fail && !(path === '/config' && call.method === 'GET') && path !== '/boards') {
    const f = backend.fail;
    backend.fail = null;
    return { status: f.status, body: { code: f.code, message: f.message, details: f.details ?? null } };
  }
  if (path === '/config' && call.method === 'GET') return { body: backend.config };
  if (path === '/config' && call.method === 'PUT') {
    const body = call.body as Record<string, string | null>;
    const tokenSet = backend.config.tokenSet || typeof body.token === 'string';
    const next: ConfigView = { siteUrl: body.siteUrl, email: body.email, tokenSet, missing: [] };
    if (!next.siteUrl) next.missing.push('siteUrl');
    if (!next.email) next.missing.push('email');
    if (!tokenSet) next.missing.push('token');
    backend.config = next;
    return { body: next };
  }
  if (path === '/connection/test') return { body: { ok: true, user: 'Persona Inventada' } };
  if (path.startsWith('/projects?')) {
    return { body: { projects: [{ key: 'PA', name: 'Proyecto A' }, { key: 'PB', name: 'Proyecto B' }] } };
  }
  const st = /^\/projects\/([^/]+)\/statuses$/.exec(path);
  if (st) return { body: { statuses: STATUSES[st[1]] ?? [] } };
  if (path === '/priorities') return { body: { priorities: PRIORITIES } };
  if (path === '/boards' && call.method === 'GET') return { body: { boards: backend.boards } };
  if (path === '/boards' && call.method === 'POST') {
    const created = { id: 9, ...(call.body as Omit<Board, 'id'>) };
    backend.boards = [...backend.boards, created];
    return { status: 201, body: created };
  }
  const one = /^\/boards\/(\d+)$/.exec(path);
  if (one && call.method === 'PUT') {
    const saved = { id: Number(one[1]), ...(call.body as Omit<Board, 'id'>) };
    backend.boards = backend.boards.map((b) => (b.id === saved.id ? saved : b));
    return { body: saved };
  }
  if (one && call.method === 'DELETE') {
    backend.boards = backend.boards.filter((b) => b.id !== Number(one[1]));
    // El servidor responde 204; el fetch simulado no admite un 204 con cuerpo.
    return { status: 200, body: {} };
  }
  const iss = /^\/boards\/(\d+)\/issues$/.exec(path);
  if (iss) {
    const id = Number(iss[1]);
    return { body: backend.issues[id] ?? { ...ISSUES, board: { id, name: 'x' }, columns: [] } };
  }
  return undefined;
}

const api = createAppApi('jira');

function Harness({ active = true, start = '' }: { active?: boolean; start?: string }) {
  const [path, setPath] = useState(start);
  const value = useMemo(
    () =>
      testContext({
        id: 'jira',
        api,
        active,
        path,
        navigate: (next) => setPath(next),
        notify: (text) => notices.push(text),
      }),
    [active, path],
  );
  return (
    <InApp value={value}>
      <div data-testid="path">{path}</div>
      <JiraApp />
    </InApp>
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const issueCalls = () => server.callsTo('GET', `${BASE}/boards/`).filter((c) => c.url.endsWith('/issues'));
const column = (name: string) => screen.getByRole('list', { name });
const keysIn = (el: HTMLElement) => within(el).queryAllByRole('listitem').map((li) => li.getAttribute('aria-label'));
const currentPath = () => screen.getByTestId('path').textContent;

async function openBoard(start = '') {
  const view = render(<Harness start={start} />);
  await screen.findByText('Pantalla de alta');
  return view;
}

beforeEach(() => {
  resetShell();
  notices = [];
  backend = { config: CONFIG, boards: [EXAMPLE, SUPPORT], issues: { 1: ISSUES }, fail: null };
  server = installFakeServer({ appRoutes: route });
});

describe('JR-30 JR-31 conexión', () => {
  it('JR-30: sin conexión completa abre en «Conexión», lo dice y no consulta tableros', async () => {
    backend.config = EMPTY;
    render(<Harness />);
    expect(await screen.findByRole('form', { name: 'Conexión' })).toBeTruthy();
    expect(screen.getByText(/Falta configurar: Sitio, Email, Token/)).toBeTruthy();
    expect(button('Probar conexión').disabled).toBe(true);
    expect(currentPath()).toBe('/connection');
    expect(issueCalls()).toHaveLength(0);
  });

  it('JR-30: con la conexión y sin tableros abre en «Configurar tableros»', async () => {
    backend.boards = [];
    render(<Harness />);
    expect(await screen.findByText(/Crea tu primer tablero/)).toBeTruthy();
    expect(currentPath()).toBe('/boards');
  });

  it('JR-31: guarda los campos, solo envía el token si se escribe y no lo muestra', async () => {
    backend.config = EMPTY;
    render(<Harness />);
    await screen.findByRole('form', { name: 'Conexión' });
    expect(screen.getByText(/id\.atlassian\.com/)).toBeTruthy();
    fireEvent.change(field('Sitio'), { target: { value: ` ${SITE} ` } });
    fireEvent.change(field('Email'), { target: { value: 'persona@example.test' } });
    fireEvent.change(field('Token'), { target: { value: 'token-inventado' } });
    expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    const [put] = server.callsTo('PUT', `${BASE}/config`);
    expect(put.body).toEqual({ siteUrl: SITE, email: 'persona@example.test', token: 'token-inventado' });
    expect(field('Token').value).toBe('');
    expect(screen.getByText(/Hay un token guardado/)).toBeTruthy();
    expect(notices).toContain('Conexión guardada.');

    // Sin escribirlo, no se envía.
    fireEvent.change(field('Email'), { target: { value: 'otra@example.test' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('PUT', `${BASE}/config`)[1].body).toEqual({ siteUrl: SITE, email: 'otra@example.test' });

    await act(async () => {
      fireEvent.click(button('Probar conexión'));
    });
    expect(screen.getByText('Conexión correcta como Persona Inventada.')).toBeTruthy();
  });

  it('JR-31: un error de formato se muestra junto a su campo', async () => {
    render(<Harness start="/connection" />);
    await screen.findByRole('form', { name: 'Conexión' });
    backend.fail = { status: 400, code: 'invalid_config', message: '«Sitio» debe ser https://<sitio>.atlassian.net', details: { field: 'siteUrl' } };
    fireEvent.change(field('Sitio'), { target: { value: 'https://evil.example.test' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(field('Sitio').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('«Sitio»');
  });
});

describe('JR-40 JR-41 tablero', () => {
  it('JR-41: el ejemplo reparte los tickets en sus columnas con clave, resumen, asignado y estado', async () => {
    await openBoard();
    expect(keysIn(column('To do'))).toEqual(['PB-3', 'PA-5']);
    expect(keysIn(column('In progress'))).toEqual(['PA-7']);
    expect(keysIn(column('Testing'))).toEqual(['PA-6', 'PB-2']);
    expect(keysIn(column('Closed'))).toEqual(['PB-1']);

    const card = within(column('To do')).getByRole('listitem', { name: 'PB-3' });
    const link = within(card).getByRole('link', { name: 'PB-3' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`${SITE}/browse/PB-3`);
    expect(within(card).getByText('Informe mensual')).toBeTruthy();
    expect(within(card).getByText('Sin asignar')).toBeTruthy();
    expect(within(card).getByText('analized')).toBeTruthy();
    expect(within(column('In progress')).getByText('Ana')).toBeTruthy();
    expect(screen.getByText(/Actualizado a las/)).toBeTruthy();
    expect(issueCalls()).toHaveLength(1);
  });

  it('JR-40: consulta al pulsar «Actualizar» y al cambiar de tablero, no oculta', async () => {
    const view = await openBoard();
    await act(async () => {
      fireEvent.click(button('Actualizar'));
    });
    expect(issueCalls()).toHaveLength(2);
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Tablero' }), { target: { value: '2' } });
    });
    expect(issueCalls().at(-1)!.url).toBe(`${BASE}/boards/2/issues`);
    view.unmount();

    const before = issueCalls().length;
    render(<Harness active={false} />);
    await waitFor(() => expect(server.callsTo('GET', `${BASE}/boards`).length).toBeGreaterThan(1));
    expect(issueCalls()).toHaveLength(before);
  });
});

function themeVariable(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(themeCss);
  if (!match) throw new Error(`Falta --${name}`);
  return match[1].trim();
}

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('JR-18 JR-41 JR-45 colores de la tarjeta', () => {
  it('JR-41: la tarjeta del ejemplo de ADR-0028: estado en su color, asignado con su círculo y prioridad', async () => {
    await openBoard();
    const card = within(column('Testing')).getByRole('listitem', { name: 'PA-6' });
    const label = within(card).getByText('testing');
    expect(label.getAttribute('data-paint')).toBe('violet');
    // El círculo va en la misma línea que el asignado.
    const avatar = within(card).getByRole('img', { name: 'Luis' });
    expect(avatar.textContent).toBe('LU');
    expect(avatar.parentElement!.textContent).toContain('Luis');
    const priority = within(card).getByLabelText('Prioridad Importante');
    expect(priority.textContent).toBe('⌃ Importante');
    expect(priority.getAttribute('data-paint')).toBe('gold');
    // La prioridad es la última línea.
    expect(card.lastElementChild).toBe(priority);
  });

  it('JR-41: una prioridad que el tablero no tiene se ve en gris, y sin prioridad no hay línea', async () => {
    await openBoard();
    const trivial = within(within(column('Testing')).getByRole('listitem', { name: 'PB-2' })).getByLabelText('Prioridad Trivial');
    expect(trivial.getAttribute('data-paint')).toBe('gray');
    const none = within(column('To do')).getByRole('listitem', { name: 'PB-3' });
    expect(within(none).queryByLabelText(/^Prioridad/)).toBeNull();
    expect(within(none).getByRole('img', { name: 'Sin asignar' }).textContent).toBe('?');
  });

  it('JR-45: cada persona tiene su color, el mismo en todas sus tarjetas', async () => {
    await openBoard();
    const colorOf = (key: string, name: string) =>
      (within(screen.getByRole('listitem', { name: key })).getByRole('img', { name }) as HTMLElement).style.background;
    expect(colorOf('PA-7', 'Ana')).not.toBe('');
    expect(colorOf('PA-7', 'Ana')).toBe(colorOf('PB-2', 'Ana'));
    expect(colorOf('PA-5', 'Luis')).toBe(colorOf('PA-6', 'Luis'));
    expect(colorOf('PA-7', 'Ana')).not.toBe(colorOf('PA-5', 'Luis'));
  });

  it('JR-45: las iniciales', () => {
    expect(initials('John Doe')).toBe('JD');
    expect(initials('Ana')).toBe('AN');
    expect(initials('  josé   álvarez pérez ')).toBe('JÁ');
    expect(initials('(Ext) María López')).toBe('EM');
    expect(initials('')).toBe('?');
  });

  it('JR-45: colores distintos hasta 18 personas, estables y que no dependen del orden', () => {
    const people = Array.from({ length: HUES }, (_, i) => `Persona ${i}`);
    const colors = assigneeColors(people);
    expect(new Set(colors.values()).size).toBe(HUES);
    const reversed = assigneeColors([...people].reverse());
    for (const name of people) expect(reversed.get(name)).toBe(colors.get(name));
    expect(assigneeColors(['Ana', 'Luis', 'Ana']).size).toBe(2);
    expect(assigneeColors([...people, 'Una más']).size).toBe(HUES + 1);
  });

  it('JR-18 JR-45: el texto oscuro del tema se lee sobre cada color de la paleta y cada tono (AA)', () => {
    const dark = themeVariable('accent-text');
    for (const color of PALETTE) {
      expect(contrast(dark, themeVariable(COLOR_VARIABLES[color])), color).toBeGreaterThanOrEqual(4.5);
    }
    for (let slot = 0; slot < HUES; slot++) {
      expect(contrast(dark, hueColor(slot)), `tono ${slot}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('JR-33 JR-37: colores iniciales de los estados y de las prioridades', () => {
    expect(categoryColor('new')).toBe('gray');
    expect(categoryColor('indeterminate')).toBe('blue');
    expect(categoryColor('done')).toBe('green');
    expect(nextPriorityColor([])).toBe('red');
    expect(nextPriorityColor(['red', 'orange'])).toBe('gold');
    expect(nextPriorityColor([...PALETTE])).toBe('gray');
  });
});

describe('JR-42 JR-43 filas y filtro', () => {
  it('JR-42: agrupar por proyecto y por asignado, con «Sin asignar» la última', async () => {
    await openBoard();
    const grouping = screen.getByRole('combobox', { name: 'Agrupar por' });
    await act(async () => {
      fireEvent.change(grouping, { target: { value: 'project' } });
    });
    const lanes = screen.getAllByRole('region').filter((r) => ['PA', 'PB'].includes(r.getAttribute('aria-label') ?? ''));
    expect(lanes.map((l) => l.getAttribute('aria-label'))).toEqual(['PA', 'PB']);
    expect(within(lanes[0]).getByRole('heading').textContent).toBe('PA 3');
    expect(keysIn(within(lanes[1]).getByRole('list', { name: 'Testing' }))).toEqual(['PB-2']);

    await act(async () => {
      fireEvent.change(grouping, { target: { value: 'assignee' } });
    });
    const people = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(people).toEqual(['Ana 3', 'Luis 2', 'Sin asignar 1']);
  });

  it('JR-42: el reparto en filas', () => {
    const cols = ISSUES.columns.map((c) => c.issues);
    expect(rows(cols, 'none', [])).toHaveLength(1);
    expect(rows(cols, 'project', ['PB', 'PA']).map((r) => r.name)).toEqual(['PB', 'PA']);
    expect(rows(cols, 'assignee', []).map((r) => r.name)).toEqual(['Ana', 'Luis', 'Sin asignar']);
  });

  it('JR-43: el filtro no distingue mayúsculas ni acentos y no consulta Jira', async () => {
    await openBoard();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar tickets' }), { target: { value: 'IMPORTACION' } });
    expect(keysIn(column('Testing'))).toEqual(['PA-6']);
    expect(keysIn(column('To do'))).toEqual([]);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar tickets' }), { target: { value: 'sin asignar' } });
    expect(keysIn(column('To do'))).toEqual(['PB-3']);
    expect(issueCalls()).toHaveLength(1);
    expect(normalize('Validación')).toBe('validacion');
    expect(matches(ISSUES.columns[0].issues[1], 'luis')).toBe(true);
  });
});

describe('JR-44 estados de carga y error', () => {
  it('JR-44: un error se muestra con «Reintentar»', async () => {
    backend.fail = { status: 502, code: 'jira_error', message: 'El email o el token no son válidos' };
    render(<Harness />);
    expect(await screen.findByText('El email o el token no son válidos')).toBeTruthy();
    await act(async () => {
      fireEvent.click(button('Reintentar'));
    });
    expect(await screen.findByText('Pantalla de alta')).toBeTruthy();
  });

  it('JR-44: avisa de los tickets recortados y de los estados que ya no existen', async () => {
    backend.issues[1] = {
      ...ISSUES,
      truncated: true,
      missingStatuses: [{ project: 'PB', id: '29999', name: 'borrado', column: 'To do' }],
    };
    await openBoard();
    expect(screen.getByText('Se muestran los 1000 tickets más recientes.')).toBeTruthy();
    expect(screen.getByText(/borrado \(PB, en To do\)/)).toBeTruthy();
    fireEvent.click(button('Revisar el tablero'));
    expect(currentPath()).toBe('/boards/1');
  });
});

describe('JR-32 a JR-36 configurar tableros', () => {
  it('JR-32 JR-33 JR-34 JR-35: crea un tablero con proyectos, columnas y estados', async () => {
    render(<Harness start="/boards/new" />);
    await screen.findByRole('form', { name: 'Nuevo tablero' });
    expect(screen.getByText(/La última columna es la de cerrados/)).toBeTruthy();
    fireEvent.change(field('Nombre'), { target: { value: ' Nuevo ' } });
    fireEvent.change(field('Buscar proyectos'), { target: { value: 'P' } });
    await act(async () => {
      fireEvent.click(button('Buscar'));
    });
    await act(async () => {
      fireEvent.click(button('Añadir PA'));
    });
    await act(async () => {
      fireEvent.click(button('Añadir PB'));
    });
    await screen.findAllByRole('option', { name: 'start (PA)' });

    // JR-34: todos sin columna al empezar.
    const pending = screen.getByRole('region', { name: 'Estados sin columna' });
    expect(pending.textContent).toContain('start, doing, testing, finished');

    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir estado a Por hacer' }), { target: { value: 'PA/10001' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir estado a Por hacer' }), { target: { value: 'PB/20001' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir estado a Hecho' }), { target: { value: 'PB/20005' } });
    // JR-33: un estado elegido ya no se ofrece en otra columna.
    expect(within(screen.getByRole('combobox', { name: 'Añadir estado a En curso' })).queryByRole('option', { name: 'start (PA)' })).toBeNull();
    expect(pending.textContent).not.toContain('start,');

    // Columnas: añadir antes de la final, renombrar y subir.
    fireEvent.click(button('Añadir columna'));
    fireEvent.change(field('Nombre de la columna 3'), { target: { value: 'Testing' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir estado a Testing' }), { target: { value: 'PA/10003' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir estado a Testing' }), { target: { value: 'PB/10003' } });
    fireEvent.click(button('Subir Testing'));

    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    const [post] = server.callsTo('POST', `${BASE}/boards`);
    expect(post.body).toEqual({
      name: 'Nuevo',
      projects: ['PA', 'PB'],
      columns: [
        { name: 'Por hacer', statuses: [ref('PA', '10001'), ref('PB', '20001')] },
        { name: 'Testing', statuses: [ref('PA', '10003'), ref('PB', '10003')] },
        { name: 'En curso', statuses: [] },
        { name: 'Hecho', statuses: [ref('PB', '20005')] },
      ],
      priorities: [],
    });
    expect(currentPath()).toBe('/boards');
    expect(notices).toContain('Tablero «Nuevo» guardado.');
  });

  it('JR-15 JR-34: quitar un proyecto quita sus estados, y un estado que Jira ya no tiene se marca', async () => {
    backend.boards = [{ ...EXAMPLE, columns: [...EXAMPLE.columns.slice(0, 3), { name: 'Closed', statuses: [{ project: 'PB', id: '29999', name: 'borrado', color: 'gray' }] }] }];
    render(<Harness start="/boards/1" />);
    await screen.findByRole('form', { name: 'Editar Equipo' });
    expect(await screen.findByText(/Ya no existe en Jira/)).toBeTruthy();
    fireEvent.click(button('Quitar PB'));
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    const [put] = server.callsTo('PUT', `${BASE}/boards/1`);
    const body = put.body as Omit<Board, 'id'>;
    expect(body.projects).toEqual(['PA']);
    expect(body.columns.flatMap((c) => c.statuses).every((s) => s.project === 'PA')).toBe(true);
  });

  it('JR-33 JR-37: elige el color de cada estado y las prioridades del tablero con su color', async () => {
    render(<Harness start="/boards/new" />);
    await screen.findByRole('form', { name: 'Nuevo tablero' });
    fireEvent.change(field('Nombre'), { target: { value: 'Colores' } });
    fireEvent.change(field('Buscar proyectos'), { target: { value: 'PA' } });
    await act(async () => {
      fireEvent.click(button('Buscar'));
    });
    await act(async () => {
      fireEvent.click(button('Añadir PA'));
    });
    await screen.findAllByRole('option', { name: 'start (PA)' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir estado a Por hacer' }), { target: { value: 'PA/10001' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir estado a En curso' }), { target: { value: 'PA/10002' } });
    // JR-33: toman el color de su categoría.
    const startColor = screen.getByRole('combobox', { name: 'Color de start de PA' }) as HTMLSelectElement;
    expect(startColor.value).toBe('gray');
    expect((screen.getByRole('combobox', { name: 'Color de doing de PA' }) as HTMLSelectElement).value).toBe('blue');
    fireEvent.change(startColor, { target: { value: 'red' } });
    expect(screen.getByText('start', { selector: 'span' }).getAttribute('data-paint')).toBe('red');

    // JR-37: las prioridades nuevas toman rojo, naranja… y su color se cambia.
    const add = await screen.findByRole('combobox', { name: 'Añadir prioridad' });
    fireEvent.change(add, { target: { value: '1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir prioridad' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir prioridad' }), { target: { value: '4' } });
    expect(within(screen.getByRole('combobox', { name: 'Añadir prioridad' })).queryByRole('option', { name: 'Crítica' })).toBeNull();
    expect((screen.getByRole('combobox', { name: 'Color de Crítica' }) as HTMLSelectElement).value).toBe('orange');
    fireEvent.change(screen.getByRole('combobox', { name: 'Color de Crítica' }), { target: { value: 'violet' } });
    fireEvent.click(button('Quitar la prioridad Supone un impedimento'));

    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    const [post] = server.callsTo('POST', `${BASE}/boards`);
    expect(post.body).toEqual({
      name: 'Colores',
      projects: ['PA'],
      columns: [
        { name: 'Por hacer', statuses: [ref('PA', '10001', 'red')] },
        { name: 'En curso', statuses: [ref('PA', '10002', 'blue')] },
        { name: 'Hecho', statuses: [] },
      ],
      priorities: [
        { id: '2', name: 'Crítica', color: 'violet' },
        { id: '4', name: 'Trivial', color: 'gold' },
      ],
    });
  });

  it('JR-37: una prioridad guardada que Jira ya no tiene se marca', async () => {
    backend.boards = [{ ...EXAMPLE, priorities: [{ id: '99', name: 'Borrada', color: 'red' }] }];
    render(<Harness start="/boards/1" />);
    const list = await screen.findByRole('list', { name: 'Prioridades del tablero' });
    expect(await within(list).findByText('Ya no existe en Jira')).toBeTruthy();
  });

  it('JR-36: salir del editor con cambios sin guardar pide confirmación', async () => {
    render(<Harness start="/boards/1" />);
    await screen.findByRole('form', { name: 'Editar Equipo' });
    fireEvent.change(field('Nombre'), { target: { value: 'Equipo cambiado' } });
    fireEvent.click(button('Tableros'));
    expect(screen.getByRole('alertdialog', { name: 'Cambios sin guardar' })).toBeTruthy();
    fireEvent.click(button('Seguir editando'));
    expect(currentPath()).toBe('/boards/1');
    expect(field('Nombre').value).toBe('Equipo cambiado');

    fireEvent.click(button('Cancelar'));
    fireEvent.click(button('Salir sin guardar'));
    expect(currentPath()).toBe('/boards');
    expect(server.callsTo('PUT', `${BASE}/boards/1`)).toHaveLength(0);

    // Sin cambios, no pregunta.
    fireEvent.click(button('Editar Equipo'));
    fireEvent.click(button('Cancelar'));
    expect(currentPath()).toBe('/boards');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('JR-16: borrar un tablero pide confirmación', async () => {
    render(<Harness start="/boards" />);
    await screen.findByRole('region', { name: 'Tableros configurados' });
    fireEvent.click(button('Borrar Soporte'));
    expect(screen.getByRole('alertdialog', { name: 'Borrar tablero' }).textContent).toContain('No se puede deshacer');
    fireEvent.click(button('Cancelar'));
    expect(server.callsTo('DELETE', `${BASE}/boards`)).toHaveLength(0);
    fireEvent.click(button('Borrar Soporte'));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Borrar' }));
    });
    expect(server.callsTo('DELETE', `${BASE}/boards/2`)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Borrar Soporte' })).toBeNull());
  });
});
