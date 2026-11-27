import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { passes, type Criteria, type SavedFilter } from '../apps/jira/filters';
import { JiraApp } from '../apps/jira/JiraApp';
import themeCss from '../theme.css?raw';
import {
  assigneeColors,
  categoryColor,
  gestaskPath,
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
  type JiraField,
  type JiraPriority,
  type JiraStatus,
  type PaletteColor,
} from '../apps/jira/types';
import { createAppApi } from '../platform/appApi';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** JR-30 a JR-49: la interfaz de «Tableros Jira», con su API simulada. No contacta con Jira. Datos inventados (S-31). */

const BASE = '/api/apps/jira';
const SITE = 'https://empresa-inventada.atlassian.net';

const CONFIG: ConfigView = { siteUrl: SITE, email: 'persona@example.test', tokenSet: true, customerField: null, missing: [] };
const EMPTY: ConfigView = {
  siteUrl: null,
  email: null,
  tokenSet: false,
  customerField: null,
  missing: ['siteUrl', 'email', 'token'],
};
/** JR-08: campos personalizados inventados, en el orden en que los da el servidor. */
const FIELDS: JiraField[] = [
  { id: 'customfield_10011', name: 'Ambito' },
  { id: 'customfield_10050', name: 'Cliente Portal' },
];

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
  customer: null,
  priority: null,
  created: '2026-11-01T09:00:00Z',
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
  filters: SavedFilter[];
  /** JR-50: lo que responde /gestask/tickets. */
  gestaskTickets: string[];
  /** JR-08: lo que responde /fields, o un error si es null. */
  fields: JiraField[] | null;
  fail: { status: number; code: string; message: string; details?: unknown } | null;
}

let server: FakeServer;
let backend: Backend;
let notices: string[];
/** P-33: lo que la mini app pidió abrir con openApp. */
let opened: { id: string; path: string }[];

function route(call: Call): { status?: number; body?: unknown } | undefined {
  const path = call.url.slice(BASE.length);
  if (path === '/gestask/tickets') return { body: { tickets: backend.gestaskTickets } };
  if (backend.fail && !(path === '/config' && call.method === 'GET') && path !== '/boards' && path !== '/filters') {
    const f = backend.fail;
    backend.fail = null;
    return { status: f.status, body: { code: f.code, message: f.message, details: f.details ?? null } };
  }
  if (path === '/config' && call.method === 'GET') return { body: backend.config };
  if (path === '/config' && call.method === 'PUT') {
    const body = call.body as Record<string, string | null>;
    const tokenSet = backend.config.tokenSet || typeof body.token === 'string';
    const next: ConfigView = { siteUrl: body.siteUrl, email: body.email, tokenSet, customerField: body.customerField ?? null, missing: [] };
    if (!next.siteUrl) next.missing.push('siteUrl');
    if (!next.email) next.missing.push('email');
    if (!tokenSet) next.missing.push('token');
    backend.config = next;
    return { body: next };
  }
  if (path === '/connection/test') return { body: { ok: true, user: 'Persona Inventada' } };
  if (path === '/fields') {
    return backend.fields
      ? { body: { fields: backend.fields } }
      : { status: 502, body: { code: 'jira_error', message: 'El email o el token no son válidos', details: null } };
  }
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
  if (path === '/filters' && call.method === 'GET') return { body: { filters: backend.filters } };
  if (path === '/filters' && call.method === 'POST') {
    const created = { id: 20, ...(call.body as Omit<SavedFilter, 'id'>) };
    backend.filters = [...backend.filters, created];
    return { status: 201, body: created };
  }
  const oneFilter = /^\/filters\/(\d+)$/.exec(path);
  if (oneFilter && call.method === 'PUT') {
    const saved = { id: Number(oneFilter[1]), ...(call.body as Omit<SavedFilter, 'id'>) };
    backend.filters = backend.filters.map((f) => (f.id === saved.id ? saved : f));
    return { body: saved };
  }
  if (oneFilter && call.method === 'DELETE') {
    backend.filters = backend.filters.filter((f) => f.id !== Number(oneFilter[1]));
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
        openApp: (id, to = '') => opened.push({ id, path: to }),
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
  opened = [];
  backend = { config: CONFIG, boards: [EXAMPLE, SUPPORT], issues: { 1: ISSUES }, filters: [], gestaskTickets: [], fields: FIELDS, fail: null };
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
    expect(put.body).toEqual({ siteUrl: SITE, email: 'persona@example.test', customerField: null, token: 'token-inventado' });
    expect(field('Token').value).toBe('');
    expect(screen.getByText(/Hay un token guardado/)).toBeTruthy();
    expect(notices).toContain('Conexión guardada.');

    // Sin escribirlo, no se envía.
    fireEvent.change(field('Email'), { target: { value: 'otra@example.test' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('PUT', `${BASE}/config`)[1].body).toEqual({ siteUrl: SITE, email: 'otra@example.test', customerField: null });

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

describe('JR-08 JR-31 campo del cliente', () => {
  const select = () => screen.getByLabelText('Campo del cliente') as HTMLSelectElement;
  const options = () => [...select().options].map((o) => o.textContent);

  it('JR-31: se elige entre «Ninguno» y los campos de Jira, y se guarda', async () => {
    render(<Harness start="/connection" />);
    await screen.findByRole('option', { name: 'Cliente Portal (customfield_10050)' });
    expect(options()).toEqual(['Ninguno', 'Ambito (customfield_10011)', 'Cliente Portal (customfield_10050)']);
    expect(select().value).toBe('');
    expect(screen.getByText(/persona que pide el ticket desde el portal/)).toBeTruthy();
    expect(server.callsTo('GET', `${BASE}/fields`)).toHaveLength(1);

    fireEvent.change(select(), { target: { value: 'customfield_10050' } });
    expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('PUT', `${BASE}/config`)[0].body).toEqual({
      siteUrl: SITE,
      email: 'persona@example.test',
      customerField: 'customfield_10050',
    });
    expect(select().value).toBe('customfield_10050');
    expect(screen.queryByText('Hay cambios sin guardar.')).toBeNull();

    // «Ninguno» lo quita.
    fireEvent.change(select(), { target: { value: '' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('PUT', `${BASE}/config`)[1].body).toMatchObject({ customerField: null });
  });

  it('JR-31: sin la conexión completa no pide la lista y lo dice', async () => {
    backend.config = { ...EMPTY, customerField: 'customfield_10050' };
    render(<Harness />);
    await screen.findByRole('form', { name: 'Conexión' });
    expect(screen.getByText('Guarda la conexión para elegirlo entre los campos de Jira.')).toBeTruthy();
    expect(options()).toEqual(['Ninguno', 'customfield_10050']);
    expect(server.callsTo('GET', `${BASE}/fields`)).toHaveLength(0);
  });

  it('JR-31: un valor guardado que Jira ya no tiene se sigue viendo', async () => {
    backend.config = { ...CONFIG, customerField: 'customfield_99' };
    render(<Harness start="/connection" />);
    await screen.findByRole('option', { name: 'customfield_99 (no está en Jira)' });
    expect(select().value).toBe('customfield_99');
    expect(options()).toHaveLength(4);
  });

  it('JR-31: si la lista falla, se dice junto al selector', async () => {
    backend.fields = null;
    render(<Harness start="/connection" />);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No se pudieron cargar los campos de Jira: El email o el token no son válidos',
    );
    expect(options()).toEqual(['Ninguno']);
  });

  it('JR-31: un error de formato del campo se muestra junto a él', async () => {
    render(<Harness start="/connection" />);
    await screen.findByRole('option', { name: 'Ambito (customfield_10011)' });
    backend.fail = {
      status: 400,
      code: 'invalid_config',
      message: '«Campo del cliente» debe ser customfield_ seguido de cifras',
      details: { field: 'customerField' },
    };
    fireEvent.change(select(), { target: { value: 'customfield_10011' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(select().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('«Campo del cliente»');
  });
});

describe('JR-41 cliente y fechas en la tarjeta', () => {
  const local = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();
  const withTicket = (key: string, extra: Partial<Issue>): BoardIssues => ({
    ...ISSUES,
    columns: ISSUES.columns.map((c) => ({ ...c, issues: c.issues.map((i) => (i.key === key ? { ...i, ...extra } : i)) })),
  });

  it('JR-41: clave, resumen, cliente, creado, actualizado, prioridad y asignado, en este orden', async () => {
    backend.issues = {
      1: withTicket('PA-6', { customer: 'Persona Cliente', created: local(2026, 11, 1, 9, 5), updated: local(2026, 11, 23, 17, 2) }),
    };
    await openBoard();
    const card = within(column('Testing')).getByRole('listitem', { name: 'PA-6' });
    const lines = [...card.children].map((el) => el.textContent);
    expect(lines[0]).toContain('PA-6');
    expect(lines.slice(1)).toEqual([
      'Validar importación',
      'Persona Cliente',
      'Creado 01/11/2026 09:05',
      'Actualizado 23/11/2026 17:02',
      'Importante',
      'LuisLU',
    ]);
    expect(within(card).getByLabelText('Cliente Persona Cliente')).toBeTruthy();
  });

  it('JR-41: sin cliente o sin una fecha, esa línea no está', async () => {
    backend.issues = { 1: withTicket('PB-3', { created: null, updated: 'no es una fecha' }) };
    await openBoard();
    const card = within(column('To do')).getByRole('listitem', { name: 'PB-3' });
    expect(within(card).queryByLabelText(/^Cliente/)).toBeNull();
    expect(card.textContent).not.toMatch(/Creado|Actualizado/);
    expect([...card.children].map((el) => el.textContent).slice(1)).toEqual(['Informe mensual', 'Sin asignar?']);
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

});

describe('JR-40 JR-46 pestañas y caché', () => {
  it('JR-40: los tableros son pestañas en una línea, con la elegida marcada y recordada', async () => {
    const view = await openBoard();
    const tabs = within(screen.getByRole('navigation', { name: 'Tableros' })).getAllByRole('button');
    expect(tabs.map((t) => t.textContent)).toEqual(['Equipo', 'Soporte']);
    expect(tabs[0].getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('combobox', { name: 'Tablero' })).toBeNull();
    await act(async () => {
      fireEvent.click(button('Soporte'));
    });
    expect(button('Soporte').getAttribute('aria-current')).toBe('page');
    expect(issueCalls().at(-1)!.url).toBe(`${BASE}/boards/2/issues`);
    view.unmount();
    render(<Harness />);
    expect((await screen.findByRole('button', { name: 'Soporte' })).getAttribute('aria-current')).toBe('page');
  });

  it('JR-46: volver a un tablero, a la sección o a la mini app no consulta; «Actualizar» sí', async () => {
    const view = await openBoard();
    expect(issueCalls()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(button('Soporte'));
    });
    expect(issueCalls()).toHaveLength(2);
    await act(async () => {
      fireEvent.click(button('Equipo'));
    });
    // Se ve lo de antes, con su hora, sin otra consulta.
    expect(screen.getByText('Pantalla de alta')).toBeTruthy();
    expect(screen.getByText(/Actualizado a las/)).toBeTruthy();
    expect(issueCalls()).toHaveLength(2);

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones' })).getByRole('button', { name: 'Filtros' }));
    await screen.findByRole('button', { name: 'Nuevo filtro' });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones' })).getByRole('button', { name: 'Tableros' }));
    expect(await screen.findByText('Pantalla de alta')).toBeTruthy();
    expect(issueCalls()).toHaveLength(2);

    // N-05: oculta y vuelta a mostrar, sigue montada.
    view.rerender(<Harness active={false} />);
    view.rerender(<Harness active />);
    await act(async () => {});
    expect(issueCalls()).toHaveLength(2);

    await act(async () => {
      fireEvent.click(button('Actualizar'));
    });
    expect(issueCalls()).toHaveLength(3);
    expect(issueCalls().at(-1)!.url).toBe(`${BASE}/boards/1/issues`);
  });

  it('JR-46: oculta no consulta, y al mostrarse consulta lo que nunca consultó', async () => {
    const view = render(<Harness active={false} />);
    await waitFor(() => expect(server.callsTo('GET', `${BASE}/filters`)).toHaveLength(1));
    await act(async () => {});
    expect(issueCalls()).toHaveLength(0);
    view.rerender(<Harness active />);
    expect(await screen.findByText('Pantalla de alta')).toBeTruthy();
    expect(issueCalls()).toHaveLength(1);
  });

  it('JR-46: cambiar el tablero en el editor vuelve a consultarlo al mostrarlo', async () => {
    await openBoard();
    expect(issueCalls()).toHaveLength(1);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones' })).getByRole('button', { name: 'Configurar tableros' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Equipo' }));
    const name = (await screen.findByRole('form', { name: 'Editar Equipo' })).querySelector('input')!;
    fireEvent.change(name, { target: { value: 'Equipo nuevo' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    await waitFor(() => expect(server.callsTo('GET', `${BASE}/boards`).length).toBeGreaterThan(1));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones' })).getByRole('button', { name: 'Tableros' }));
    await waitFor(() => expect(issueCalls()).toHaveLength(2));
    expect(await screen.findByText('Pantalla de alta')).toBeTruthy();
  });
});

describe('JR-48 JR-49 filtros guardados', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const ticket = (extra: Partial<Issue>) => issue('PA-1', 'doing', 'Algo', 'Ana', extra);
  const only = (criteria: Partial<Criteria>): Criteria => ({
    statuses: null,
    priorities: null,
    assignees: null,
    created: null,
    updated: null,
    ...criteria,
  });

  it('JR-49: estados, prioridades y asignados, con «Es uno de», «No es ninguno de» y «Sin…»', () => {
    const doing = only({ statuses: { mode: 'include', values: ['DOING ', 'testing'], none: false } });
    expect(passes(ticket({}), doing, now)).toBe(true);
    expect(passes(ticket({ status: 'start' }), doing, now)).toBe(false);
    const notDoing = only({ statuses: { mode: 'exclude', values: ['doing'], none: false } });
    expect(passes(ticket({}), notDoing, now)).toBe(false);
    expect(passes(ticket({ status: 'start' }), notDoing, now)).toBe(true);

    const critical = only({ priorities: { mode: 'include', values: ['critica'], none: true } });
    expect(passes(ticket({ priority: { id: '2', name: 'Crítica', color: 'red' } }), critical, now)).toBe(true);
    expect(passes(ticket({ priority: null }), critical, now)).toBe(true);
    expect(passes(ticket({ priority: { id: '4', name: 'Trivial', color: null } }), critical, now)).toBe(false);

    const notMine = only({ assignees: { mode: 'exclude', values: ['ana'], none: true } });
    expect(passes(ticket({}), notMine, now)).toBe(false);
    expect(passes(ticket({ assignee: null }), notMine, now)).toBe(false);
    expect(passes(ticket({ assignee: 'Luis' }), notMine, now)).toBe(true);
  });

  it('JR-49: antigüedad y días desde la actualización, de 24 horas hacia atrás', () => {
    const old = only({ created: { moreThanDays: 30, lessThanDays: null, from: null, to: null } });
    expect(passes(ticket({ created: '2026-10-24T11:59:59Z' }), old, now)).toBe(true);
    expect(passes(ticket({ created: '2026-10-24T12:00:00Z' }), old, now)).toBe(false);
    const recent = only({ updated: { moreThanDays: null, lessThanDays: 7, from: null, to: null } });
    expect(passes(ticket({ updated: '2026-11-16T12:00:00Z' }), recent, now)).toBe(true);
    expect(passes(ticket({ updated: '2026-11-16T11:59:59Z' }), recent, now)).toBe(false);
    const between = only({ created: { moreThanDays: 10, lessThanDays: 20, from: null, to: null } });
    expect(passes(ticket({ created: '2026-11-08T12:00:00Z' }), between, now)).toBe(true);
    expect(passes(ticket({ created: '2026-11-20T12:00:00Z' }), between, now)).toBe(false);
    // Sin fecha, no pasa un criterio de fechas.
    expect(passes(ticket({ created: null }), old, now)).toBe(false);
  });

  it('JR-49: desde y hasta comparan el día local e incluyen los extremos', () => {
    const november = only({ created: { moreThanDays: null, lessThanDays: null, from: '2026-11-01', to: '2026-11-15' } });
    const local = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).toISOString();
    expect(passes(ticket({ created: local(2026, 11, 1, 0) }), november, now)).toBe(true);
    expect(passes(ticket({ created: local(2026, 11, 15, 23) }), november, now)).toBe(true);
    expect(passes(ticket({ created: local(2026, 10, 31, 23) }), november, now)).toBe(false);
    expect(passes(ticket({ created: local(2026, 11, 16, 0) }), november, now)).toBe(false);
  });

  it('JR-48: la línea de filtros bajo las pestañas, uno activo, recordado y sin consultar Jira', async () => {
    backend.filters = [
      { id: 1, ...only({ assignees: { mode: 'include', values: ['Ana'], none: false } }), name: 'De Ana' },
      { id: 2, ...only({ priorities: { mode: 'include', values: ['Importante'], none: false } }), name: 'Importantes' },
    ];
    const view = await openBoard();
    const line = screen.getByRole('group', { name: 'Filtros guardados' });
    expect(within(line).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todos', 'De Ana', 'Importantes']);
    expect(within(line).getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(line).getByRole('button', { name: 'De Ana' }));
    expect(within(line).getByRole('button', { name: 'De Ana' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(line).getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('false');
    expect(keysIn(column('To do'))).toEqual([]);
    expect(keysIn(column('In progress'))).toEqual(['PA-7']);
    expect(keysIn(column('Testing'))).toEqual(['PB-2']);
    // JR-43: los números cuentan solo lo visible.
    expect(screen.getByText('To do').parentElement!.textContent).toContain('0');

    fireEvent.click(within(line).getByRole('button', { name: 'Importantes' }));
    expect(keysIn(column('Testing'))).toEqual(['PA-6']);
    // JR-43: el texto se aplica a la vez.
    fireEvent.change(field('Filtrar tickets'), { target: { value: 'csv' } });
    expect(keysIn(column('Testing'))).toEqual([]);
    expect(issueCalls()).toHaveLength(1);

    view.unmount();
    render(<Harness />);
    await screen.findByText('Validar importación');
    const again = screen.getByRole('group', { name: 'Filtros guardados' });
    expect(within(again).getByRole('button', { name: 'Importantes' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('JR-48: sin filtros hay «Todos» y «Crear un filtro», y un filtro recordado que ya no existe es «Todos»', async () => {
    backend.filters = [{ id: 7, ...only({ assignees: { mode: 'include', values: ['Ana'], none: false } }), name: 'Borrado luego' }];
    const view = await openBoard();
    fireEvent.click(button('Borrado luego'));
    view.unmount();
    backend.filters = [];
    await openBoard();
    const line = screen.getByRole('group', { name: 'Filtros guardados' });
    expect(within(line).getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(line).getByRole('button', { name: 'Crear un filtro' }));
    expect(currentPath()).toBe('/filters');
  });
});

describe('JR-47 sección «Filtros»', () => {
  it('JR-47 JR-27: crea un filtro con todos los criterios', async () => {
    await openBoard();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones' })).getByRole('button', { name: 'Filtros' }));
    expect(await screen.findByText(/Crea un filtro para ver solo/)).toBeTruthy();
    fireEvent.click(button('Nuevo filtro'));
    await screen.findByRole('form', { name: 'Nuevo filtro' });
    fireEvent.change(field('Nombre'), { target: { value: 'Míos y viejos' } });

    // Estados: los nombres de todos los tableros, sin repetir.
    fireEvent.change(screen.getByRole('combobox', { name: 'Condición de Estados' }), { target: { value: 'exclude' } });
    const addStatus = screen.getByRole('combobox', { name: 'Añadir a Estados' });
    expect(within(addStatus).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Añadir…',
      'analized',
      'closed',
      'created',
      'doing',
      'finished',
      'inprogress',
      'start',
      'testing',
    ]);
    fireEvent.change(addStatus, { target: { value: 'closed' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir a Estados' }), { target: { value: 'finished' } });

    // Prioridades: las de Jira y «Sin prioridad».
    fireEvent.change(screen.getByRole('combobox', { name: 'Condición de Prioridades' }), { target: { value: 'include' } });
    const addPriority = await screen.findByRole('option', { name: 'Crítica' });
    fireEvent.change(addPriority.parentElement!, { target: { value: 'Crítica' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir a Prioridades' }), { target: { value: 'Sin prioridad' } });

    // Asignados: las personas ya vistas, «Sin asignar» o un nombre escrito.
    fireEvent.change(screen.getByRole('combobox', { name: 'Condición de Asignados' }), { target: { value: 'include' } });
    expect(within(screen.getByRole('combobox', { name: 'Añadir a Asignados' })).getByRole('option', { name: 'Luis' })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir a Asignados' }), { target: { value: 'Ana' } });
    fireEvent.change(field('Escribir un nombre'), { target: { value: 'Persona Nueva' } });
    fireEvent.click(button('Añadir nombre'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Añadir a Asignados' }), { target: { value: 'Sin asignar' } });
    fireEvent.click(button('Quitar Sin asignar de Asignados'));

    fireEvent.change(field('Antigüedad: Más de'), { target: { value: '30' } });
    fireEvent.change(field('Creado: Desde'), { target: { value: '2026-01-01' } });
    fireEvent.change(field('Actualizado: Hace menos de'), { target: { value: '7' } });
    fireEvent.change(field('Actualizado: Hasta'), { target: { value: '2026-11-30' } });

    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    const [post] = server.callsTo('POST', `${BASE}/filters`);
    expect(post.body).toEqual({
      name: 'Míos y viejos',
      statuses: { mode: 'exclude', values: ['closed', 'finished'], none: false },
      priorities: { mode: 'include', values: ['Crítica'], none: true },
      assignees: { mode: 'include', values: ['Ana', 'Persona Nueva'], none: false },
      created: { moreThanDays: 30, lessThanDays: null, from: '2026-01-01', to: null },
      updated: { moreThanDays: null, lessThanDays: 7, from: null, to: '2026-11-30' },
    });
    expect(currentPath()).toBe('/filters');
    expect(await screen.findByText('Míos y viejos')).toBeTruthy();
    expect(screen.getByText(/Estado no es closed, finished · Prioridad es Crítica, Sin prioridad/)).toBeTruthy();
    expect(issueCalls()).toHaveLength(1);
  });

  it('JR-47: edita un filtro, muestra el error junto a su criterio y borra con confirmación', async () => {
    backend.filters = [
      {
        id: 4,
        name: 'Viejos',
        statuses: { mode: 'include', values: ['estado-que-ya-no-esta'], none: false },
        priorities: null,
        assignees: null,
        created: { moreThanDays: 90, lessThanDays: null, from: null, to: null },
        updated: null,
      },
    ];
    render(<Harness start="/filters/4" />);
    await screen.findByRole('form', { name: 'Editar Viejos' });
    // Un valor guardado que ya no está entre las opciones se sigue viendo.
    expect(within(screen.getByRole('list', { name: 'Estados elegidos' })).getByText('estado-que-ya-no-esta')).toBeTruthy();
    expect(field('Antigüedad: Más de').value).toBe('90');

    backend.fail = { status: 400, code: 'invalid_filter', message: '«Más de» debe ser menor que «Menos de»', details: { field: 'created' } };
    fireEvent.change(field('Antigüedad: Menos de'), { target: { value: '10' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('«Más de» debe ser menor que «Menos de»');
    expect(alert.closest('fieldset')!.querySelector('legend')!.textContent).toBe('Creado');

    fireEvent.change(field('Antigüedad: Menos de'), { target: { value: '' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('PUT', `${BASE}/filters/4`).at(-1)!.body).toMatchObject({ name: 'Viejos', statuses: { mode: 'include' } });
    await screen.findByRole('button', { name: 'Borrar Viejos' });

    fireEvent.click(button('Borrar Viejos'));
    const dialog = screen.getByRole('alertdialog', { name: 'Borrar filtro' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Borrar' }));
    });
    expect(server.callsTo('DELETE', `${BASE}/filters/4`)).toHaveLength(1);
    expect(await screen.findByText(/Crea un filtro para ver solo/)).toBeTruthy();
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
    // JR-41: solo el nombre, sin icono.
    expect(priority.textContent).toBe('Importante');
    expect(priority.getAttribute('data-paint')).toBe('gold');
    // JR-41: la prioridad va justo antes del asignado, que es la última línea.
    expect(card.lastElementChild).toBe(avatar.parentElement);
    expect(priority.nextElementSibling).toBe(avatar.parentElement);
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

describe('JR-50 a JR-53 Gestask y cabecera fija', () => {
  const card = (key: string) => screen.getByRole('listitem', { name: key });
  const gestaskCalls = () => server.callsTo('GET', `${BASE}/gestask/tickets`);

  it('JR-51: «+» si el ticket no es una tarea de Gestask y «>» si ya lo es, sin distinguir mayúsculas ni espacios', async () => {
    backend.gestaskTickets = [' pa-7 ', 'PB-1'];
    await openBoard();
    await waitFor(() => expect(within(card('PA-7')).getByRole('button', { name: 'Abrir en Gestask: PA-7' }).textContent).toBe('>'));
    expect(within(card('PB-1')).getByRole('button', { name: 'Abrir en Gestask: PB-1' })).toBeTruthy();
    const create = within(card('PA-5')).getByRole('button', { name: 'Crear en Gestask: PA-5' });
    expect(create.textContent).toBe('+');
    expect(create.getAttribute('title')).toBe('Crear en Gestask');
  });

  it('JR-51 P-33: «+» abre Gestask con el formulario relleno y «>» con la tarea', async () => {
    backend.gestaskTickets = ['PA-7'];
    await openBoard();
    await waitFor(() => expect(within(card('PA-7')).getByRole('button', { name: /^Abrir en Gestask/ })).toBeTruthy());

    fireEvent.click(within(card('PA-5')).getByRole('button', { name: /^Crear en Gestask/ }));
    fireEvent.click(within(card('PA-6')).getByRole('button', { name: /^Crear en Gestask/ }));
    fireEvent.click(within(card('PA-7')).getByRole('button', { name: /^Abrir en Gestask/ }));
    expect(opened).toEqual([
      { id: 'gestask', path: '/new?ticket=PA-5&title=Nuevo%20filtro' },
      { id: 'gestask', path: '/new?ticket=PA-6&title=Validar%20importaci%C3%B3n&priority=Importante' },
      { id: 'gestask', path: '/ticket/PA-7' },
    ]);
    // Abrir Gestask no consulta Jira.
    expect(issueCalls()).toHaveLength(1);
  });

  it('JR-51: los valores van codificados para que Gestask los lea tal cual (P-33)', () => {
    const tricky = issue('PA-9', 'start', 'Fallo / 50% ¿#? & más', null, { priority: { id: '1', name: 'Crítica', color: 'red' } });
    const path = gestaskPath(tricky, false);
    expect(path.startsWith('/new?')).toBe(true);
    const query = new URLSearchParams(path.slice('/new?'.length));
    expect(query.get('ticket')).toBe('PA-9');
    expect(query.get('title')).toBe('Fallo / 50% ¿#? & más');
    expect(query.get('priority')).toBe('Crítica');
    expect(path.includes('/', 1)).toBe(false);
  });

  it('JR-52: la lista se pide al abrir y al volver a mostrarse, sin consultar Jira ni vaciar la caché', async () => {
    const view = await openBoard();
    await waitFor(() => expect(gestaskCalls()).toHaveLength(1));
    expect(within(card('PA-5')).getByRole('button', { name: /^Crear en Gestask/ })).toBeTruthy();

    // Mientras está oculta se crea la tarea en Gestask.
    view.rerender(<Harness active={false} />);
    backend.gestaskTickets = ['PA-5'];
    await act(async () => {});
    expect(gestaskCalls()).toHaveLength(1);

    view.rerender(<Harness active />);
    await waitFor(() => expect(within(card('PA-5')).getByRole('button', { name: /^Abrir en Gestask/ })).toBeTruthy());
    expect(gestaskCalls()).toHaveLength(2);
    expect(issueCalls()).toHaveLength(1);
  });

  it('JR-52: si falla, se conserva la última lista y no se avisa', async () => {
    backend.gestaskTickets = ['PA-5'];
    const view = await openBoard();
    await waitFor(() => expect(within(card('PA-5')).getByRole('button', { name: /^Abrir en Gestask/ })).toBeTruthy());
    view.rerender(<Harness active={false} />);
    const ok = server.appRoutes;
    server.appRoutes = (call) =>
      call.url.endsWith('/gestask/tickets') ? { status: 500, body: { code: 'internal', message: 'Fallo', details: null } } : ok(call);
    view.rerender(<Harness active />);
    await waitFor(() => expect(gestaskCalls()).toHaveLength(2));
    await act(async () => {});
    expect(within(card('PA-5')).getByRole('button', { name: /^Abrir en Gestask/ })).toBeTruthy();
    expect(notices).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('JR-53 P-17: la mini app ocupa el alto de su área y solo el tablero se desplaza, con las columnas fijas', async () => {
    await openBoard();
    const scroll = screen.getByRole('list', { name: 'To do' }).closest('[class*="boardScroll"]');
    expect(scroll).not.toBeNull();
    // La cabecera del tablero queda fuera de lo que se desplaza.
    expect(scroll!.contains(screen.getByRole('navigation', { name: 'Tableros' }))).toBe(false);
    expect(scroll!.contains(screen.getByRole('button', { name: 'Actualizar' }))).toBe(false);
    expect(scroll!.firstElementChild!.className).toMatch(/heads/);

    // P-17: el marco tiene el alto del área (los CSS Modules se simulan en las pruebas; el resto se ve arrancada).
    expect(/\.app-frame \{[^}]*height: 100%/.exec(themeCss)).not.toBeNull();
  });
});
