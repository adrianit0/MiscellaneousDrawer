import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { Adf, MAX_DEPTH } from '../apps/jira/adf';
import { JiraApp } from '../apps/jira/JiraApp';
import {
  attachmentUrl,
  formatSize,
  ticketOfPath,
  type AdfNode,
  type Board,
  type BoardIssues,
  type BriefIssue,
  type ConfigView,
  type IssueDetail,
} from '../apps/jira/types';
import { createAppApi } from '../platform/appApi';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** JR-60 a JR-75: el detalle del ticket en «Tableros Jira», con su API simulada. No contacta con Jira. Datos inventados (S-31). */

const BASE = '/api/apps/jira';
const SITE = 'https://empresa-inventada.atlassian.net';
const CONFIG: ConfigView = { siteUrl: SITE, email: 'persona@example.test', tokenSet: true, customerField: null, missing: [] };

const BOARD: Board = {
  id: 1,
  name: 'Equipo',
  projects: ['PA'],
  columns: [
    { name: 'En curso', statuses: [{ project: 'PA', id: '10002', name: 'doing', color: 'blue' }] },
    { name: 'Hecho', statuses: [{ project: 'PA', id: '10004', name: 'finished', color: 'green' }] },
  ],
  priorities: [],
};

const UPDATED = '2026-11-23T09:30:00.000+0100';

function boardIssues(updated = UPDATED): BoardIssues {
  return {
    board: { id: 1, name: 'Equipo' },
    columns: [
      {
        name: 'En curso',
        issues: [
          {
            key: 'PA-7',
            summary: 'Pantalla de alta',
            project: 'PA',
            status: 'doing',
            statusColor: 'blue',
            assignee: 'Ana Inventada',
            customer: null,
            priority: null,
            created: '2026-11-01T09:00:00.000+0100',
            updated,
          },
        ],
      },
      { name: 'Hecho', issues: [] },
    ],
    fetchedAt: '2026-11-23T10:00:00Z',
    truncated: false,
    missingStatuses: [],
  };
}

const doc = (...content: AdfNode[]): AdfNode => ({ type: 'doc', content });
const p = (...content: AdfNode[]): AdfNode => ({ type: 'paragraph', content });
const t = (text: string, marks?: AdfNode['marks']): AdfNode => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const brief = (key: string, summary: string, category = 'new', type = 'Subtarea'): BriefIssue => ({
  key,
  summary,
  status: { name: category === 'done' ? 'finished' : 'start', category },
  type,
});

function detailOf(key: string, extra: Partial<IssueDetail> = {}): IssueDetail {
  return {
    key,
    summary: `Resumen de ${key}`,
    project: key.split('-')[0],
    status: { name: 'doing', category: 'indeterminate' },
    type: 'Historia',
    priority: { id: '3', name: 'Importante' },
    assignee: 'Ana Inventada',
    reporter: 'Luis Inventado',
    created: '2026-11-01T09:00:00.000+0100',
    updated: UPDATED,
    description: doc(p(t('Hay que dar de alta <script>alert(1)</script>'))),
    parent: brief('PA-1', 'Épica de altas', 'indeterminate', 'Epic'),
    subtasks: [brief('PA-8', 'Validar campos'), brief('PA-9', 'Mensajes de error', 'done')],
    links: [
      { relation: 'bloquea', issue: brief('PB-2', 'Exportar a CSV', 'indeterminate', 'Error') },
      { relation: 'es bloqueado por', issue: brief('PB-3', 'Informe mensual', 'new', 'Tarea') },
      { relation: 'bloquea', issue: brief('PB-4', 'Importar', 'new', 'Tarea') },
    ],
    attachments: [
      { id: '10100', filename: 'captura.png', mimeType: 'image/png', size: 20480, author: 'Ana Inventada', created: '2026-11-20T10:00:00.000+0100' },
    ],
    labels: ['frontend', 'altas'],
    components: ['Web'],
    comments: [
      { id: '2', author: 'Luis Inventado', created: '2026-11-22T10:00:00.000+0100', updated: '2026-11-22T11:00:00.000+0100', body: doc(p(t('Segundo'))) },
      { id: '1', author: 'Ana Inventada', created: '2026-11-21T10:00:00.000+0100', updated: '2026-11-21T10:00:00.000+0100', body: doc(p(t('Primero'))) },
    ],
    commentsTruncated: false,
    fetchedAt: '2026-11-23T10:00:00Z',
    ...extra,
  };
}

let server: FakeServer;
let details: Record<string, IssueDetail>;
let issues: BoardIssues;
let failNext: boolean;
let navigations: { path: string; replace: boolean }[];

function route(call: Call): { status?: number; body?: unknown } | undefined {
  const path = call.url.slice(BASE.length);
  if (path === '/config') return { body: CONFIG };
  if (path === '/boards') return { body: { boards: [BOARD] } };
  if (path === '/filters') return { body: { filters: [] } };
  if (path === '/gestask/tickets') return { body: { tickets: [] } };
  if (path === '/boards/1/issues') return { body: issues };
  const m = /^\/issues\/(.+)$/.exec(path);
  if (m) {
    if (failNext) {
      failNext = false;
      return { status: 502, body: { code: 'jira_error', message: 'No existe en Jira', details: null } };
    }
    const d = details[decodeURIComponent(m[1])];
    return d ? { body: d } : { status: 502, body: { code: 'jira_error', message: 'No existe en Jira', details: null } };
  }
  return undefined;
}

const api = createAppApi('jira');

function Harness({ start = '' }: { start?: string }) {
  const [path, setPath] = useState(start);
  const value = useMemo(
    () =>
      testContext({
        id: 'jira',
        api,
        path,
        navigate: (next, options) => {
          navigations.push({ path: next, replace: options?.replace ?? false });
          setPath(next);
        },
      }),
    [path],
  );
  return (
    <InApp value={value}>
      <div data-testid="path">{path}</div>
      <JiraApp />
    </InApp>
  );
}

const currentPath = () => screen.getByTestId('path').textContent;
const detailCalls = () => server.callsTo('GET', `${BASE}/issues/`);
const panel = (key: string) => screen.getByRole('complementary', { name: `Detalle de ${key}` });

async function openBoard(start = '') {
  const view = render(<Harness start={start} />);
  await screen.findByText('Pantalla de alta');
  return view;
}

async function openCard() {
  await openBoard();
  fireEvent.click(screen.getByRole('listitem', { name: 'PA-7' }));
  await screen.findByRole('heading', { name: 'Resumen de PA-7' });
  return panel('PA-7');
}

beforeEach(() => {
  resetShell();
  details = { 'PA-7': detailOf('PA-7'), 'PA-8': detailOf('PA-8', { subtasks: [], parent: brief('PA-7', 'Pantalla de alta') }), 'PB-99': detailOf('PB-99') };
  issues = boardIssues();
  failNext = false;
  navigations = [];
  server = installFakeServer({ appRoutes: route });
});

describe('JR-74 ADF', () => {
  const renderAdf = (node: AdfNode) => render(<Adf doc={node} />).container;

  it('JR-74: párrafos, saltos de línea y marcas', () => {
    const c = renderAdf(
      doc(
        p(
          t('negrita', [{ type: 'strong' }]),
          t('cursiva', [{ type: 'em' }]),
          t('subrayado', [{ type: 'underline' }]),
          t('tachado', [{ type: 'strike' }]),
          t('codigo', [{ type: 'code' }]),
          t('abajo', [{ type: 'subsup', attrs: { type: 'sub' } }]),
          t('arriba', [{ type: 'subsup', attrs: { type: 'sup' } }]),
          { type: 'hardBreak' },
          t('rojo', [{ type: 'textColor', attrs: { color: '#ff0000' } }]),
          t('enlace', [{ type: 'link', attrs: { href: 'https://example.test/a' } }, { type: 'strong' }]),
        ),
      ),
    );
    expect(c.querySelector('p strong')?.textContent).toBe('negrita');
    expect(c.querySelector('em')?.textContent).toBe('cursiva');
    expect(c.querySelector('u')?.textContent).toBe('subrayado');
    expect(c.querySelector('s')?.textContent).toBe('tachado');
    expect(c.querySelector('code')?.textContent).toBe('codigo');
    expect(c.querySelector('sub')?.textContent).toBe('abajo');
    expect(c.querySelector('sup')?.textContent).toBe('arriba');
    expect(c.querySelector('br')).not.toBeNull();
    // JR-74: textColor se ignora.
    expect(c.querySelector('[style]')).toBeNull();
    const a = c.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.test/a');
    // Las marcas se aplican de dentro afuera en su orden: el enlace va dentro de la negrita.
    expect(a.textContent).toBe('enlace');
    expect(a.parentElement?.tagName).toBe('STRONG');
  });

  it('JR-74: nada se interpreta como HTML y solo las URL http o https son enlaces', () => {
    const c = renderAdf(
      doc(
        p(t('<script>alert(1)</script><b>no</b>')),
        p(t('js', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
        p(t('datos', [{ type: 'link', attrs: { href: 'data:text/html,hola' } }])),
        p({ type: 'inlineCard', attrs: { url: 'javascript:alert(2)' } }),
        p({ type: 'inlineCard', attrs: { url: 'https://example.test/b' } }),
      ),
    );
    expect(c.querySelector('script')).toBeNull();
    expect(c.querySelector('b')).toBeNull();
    expect(c.textContent).toContain('<script>alert(1)</script><b>no</b>');
    const links = [...c.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['https://example.test/b']);
    expect(c.textContent).toContain('js');
    expect(c.textContent).toContain('datos');
    expect(c.textContent).toContain('javascript:alert(2)');
  });

  it('JR-74: títulos un nivel por debajo del resumen', () => {
    const c = renderAdf(
      doc(
        ...[1, 2, 3, 4, 5, 6].map((level) => ({ type: 'heading', attrs: { level }, content: [t(`T${level}`)] })),
      ),
    );
    const tags = [...c.querySelectorAll('h4, h5, h6')].map((h) => `${h.tagName}:${h.textContent}`);
    expect(tags).toEqual(['H4:T1', 'H4:T2', 'H5:T3', 'H6:T4', 'H6:T5', 'H6:T6']);
  });

  it('JR-74: listas, tareas, decisiones, código, citas y líneas', () => {
    const item = (text: string): AdfNode => ({ type: 'listItem', content: [p(t(text))] });
    const c = renderAdf(
      doc(
        { type: 'bulletList', content: [item('uno'), item('dos')] },
        { type: 'orderedList', attrs: { order: 3 }, content: [item('tres')] },
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { state: 'DONE' }, content: [t('hecha')] },
            { type: 'taskItem', attrs: { state: 'TODO' }, content: [t('pendiente')] },
          ],
        },
        { type: 'decisionList', content: [{ type: 'decisionItem', attrs: { state: 'DECIDED' }, content: [t('usar ADF')] }] },
        { type: 'codeBlock', attrs: { language: 'java' }, content: [t('int a = 1;\n'), t('<b>x</b>')] },
        { type: 'blockquote', content: [p(t('citado'))] },
        { type: 'rule' },
      ),
    );
    expect([...c.querySelectorAll('ul')[0].querySelectorAll('li')].map((li) => li.textContent)).toEqual(['uno', 'dos']);
    expect(c.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(c.textContent).toContain('☑ hecha');
    expect(c.textContent).toContain('☐ pendiente');
    expect(c.textContent).toContain('Decisión: usar ADF');
    expect(c.querySelector('pre code')?.textContent).toBe('int a = 1;\n<b>x</b>');
    expect(c.querySelector('blockquote')?.textContent).toBe('citado');
    expect(c.querySelector('hr')).not.toBeNull();
  });

  it('JR-74: paneles con el color de su tipo y desplegables cerrados', () => {
    const c = renderAdf(
      doc(
        ...['info', 'note', 'success', 'warning', 'error', 'custom'].map((panelType) => ({
          type: 'panel',
          attrs: { panelType },
          content: [p(t(panelType))],
        })),
        { type: 'expand', attrs: { title: 'Más datos' }, content: [p(t('oculto'))] },
        { type: 'nestedExpand', attrs: {}, content: [p(t('dentro'))] },
      ),
    );
    expect([...c.querySelectorAll('[data-paint]')].map((e) => `${e.textContent}:${e.getAttribute('data-paint')}`)).toEqual([
      'info:blue',
      'note:blue',
      'success:green',
      'warning:gold',
      'error:red',
      'custom:gray',
    ]);
    const expands = c.querySelectorAll('details');
    expect(expands).toHaveLength(2);
    expect(expands[0].open).toBe(false);
    expect(expands[0].querySelector('summary')?.textContent).toBe('Más datos');
    expect(expands[1].querySelector('summary')?.textContent).toBe('Desplegar');
  });

  it('JR-74: tablas con cabeceras y celdas combinadas', () => {
    const c = renderAdf(
      doc({
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Campo'))] }, { type: 'tableHeader', content: [p(t('Valor'))] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2, rowspan: 1 }, content: [p(t('ancho'))] }] },
        ],
      }),
    );
    expect([...c.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Campo', 'Valor']);
    const td = c.querySelector('td')!;
    expect(td.textContent).toBe('ancho');
    expect(td.getAttribute('colspan')).toBe('2');
  });

  it('JR-74: menciones, emojis, estados, fechas, tarjetas y adjuntos insertados', () => {
    const ms = Date.UTC(2026, 10, 20, 12);
    const c = renderAdf(
      doc(
        p(
          { type: 'mention', attrs: { id: 'a1', text: '@Ana Inventada' } },
          t(' '),
          { type: 'mention', attrs: { id: 'a2', text: 'Luis' } },
          t(' '),
          { type: 'emoji', attrs: { shortName: ':smile:', text: '😄' } },
          { type: 'emoji', attrs: { shortName: ':gato:' } },
          t(' '),
          { type: 'status', attrs: { text: 'EN REVISIÓN', color: 'blue' } },
          t(' '),
          { type: 'date', attrs: { timestamp: String(ms) } },
        ),
        { type: 'blockCard', attrs: { url: 'https://example.test/c' } },
        { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'm1', type: 'file', alt: 'diagrama.png' } }] },
        { type: 'mediaGroup', content: [{ type: 'media', attrs: { id: 'm2', type: 'file' } }] },
        p({ type: 'mediaInline', attrs: { id: 'm3', alt: 'informe.pdf' } }),
      ),
    );
    expect(c.textContent).toContain('@Ana Inventada');
    expect(c.textContent).toContain('@Luis');
    expect(c.textContent).toContain('😄');
    expect(c.textContent).toContain(':gato:');
    expect(c.textContent).toContain('EN REVISIÓN');
    expect(c.textContent).toContain(new Date(ms).toLocaleDateString('es-ES'));
    expect(c.querySelector('a')?.getAttribute('href')).toBe('https://example.test/c');
    expect(c.textContent).toContain('[Adjunto: diagrama.png]');
    expect(c.textContent).toContain('[Adjunto]');
    expect(c.textContent).toContain('[Adjunto: informe.pdf]');
  });

  it('JR-74: un nodo desconocido muestra su texto, y más de 50 niveles no se pintan', () => {
    const unknown = renderAdf(doc({ type: 'extension', attrs: { text: 'propio' } }, { type: 'bodiedExtension', content: [p(t('dentro'))] }));
    expect(unknown.textContent).toBe('propiodentro');

    let deep: AdfNode = t('fondo');
    for (let i = 0; i < MAX_DEPTH + 5; i++) deep = { type: 'blockquote', content: [deep] };
    const c = renderAdf(doc(p(t('arriba')), deep));
    expect(c.textContent).toContain('arriba');
    expect(c.textContent).not.toContain('fondo');
    expect(c.querySelectorAll('blockquote').length).toBeLessThanOrEqual(MAX_DEPTH);

    // Algo que no es un documento no pinta nada.
    expect(render(<Adf doc={'<b>texto</b>'} />).container.textContent).toBe('');
  });
});

describe('JR-70 abrir y cerrar el detalle', () => {
  it('JR-70 JR-71: pulsar la tarjeta abre el panel con la ficha, en /ticket/<clave> con entrada en el historial', async () => {
    const aside = await openCard();

    expect(currentPath()).toBe('/ticket/PA-7');
    expect(navigations.at(-1)).toEqual({ path: '/ticket/PA-7', replace: false });
    expect(detailCalls().map((c) => c.url)).toEqual([`${BASE}/issues/PA-7`]);
    expect(screen.getByRole('listitem', { name: 'PA-7' }).getAttribute('aria-current')).toBe('true');
    // El tablero sigue a la vista.
    expect(screen.getByRole('list', { name: 'En curso' })).toBeTruthy();
    expect(document.activeElement).toBe(aside);

    const key = within(aside).getByRole('link', { name: 'PA-7' });
    expect(key.getAttribute('href')).toBe(`${SITE}/browse/PA-7`);
    const facts = aside.querySelector('dl')!;
    const terms = [...facts.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(terms).toEqual(['Estado', 'Prioridad', 'Asignado', 'Informador', 'Creado', 'Actualizado', 'Padre', 'Etiquetas', 'Componentes']);
    expect(within(facts).getByText('doing').getAttribute('data-paint')).toBe('blue');
    expect(within(facts).getByText('frontend, altas')).toBeTruthy();
    expect(within(aside).getByText('Historia')).toBeTruthy();
    // JR-74: el texto con etiquetas se ve como texto.
    expect(within(aside).getByText('Hay que dar de alta <script>alert(1)</script>')).toBeTruthy();
    expect(aside.querySelector('script')).toBeNull();
  });

  it('JR-70: la clave y el botón de Gestask no abren el detalle; el resumen sí, también con el teclado', async () => {
    await openBoard();
    const card = screen.getByRole('listitem', { name: 'PA-7' });
    fireEvent.click(within(card).getByRole('link', { name: 'PA-7' }));
    fireEvent.click(within(card).getByRole('button', { name: /Crear en Gestask/ }));
    expect(currentPath()).toBe('');
    expect(screen.queryByRole('complementary')).toBeNull();

    const summary = within(card).getByRole('button', { name: /Ver detalle: PA-7/ });
    summary.focus();
    fireEvent.click(summary);
    expect(currentPath()).toBe('/ticket/PA-7');
  });

  it('JR-70: Esc y «Cerrar» cierran el panel y vuelven a «Tableros»', async () => {
    await openCard();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(currentPath()).toBe('');
    expect(screen.queryByRole('complementary')).toBeNull();

    fireEvent.click(screen.getByRole('listitem', { name: 'PA-7' }));
    await screen.findByRole('heading', { name: 'Resumen de PA-7' });
    fireEvent.click(within(panel('PA-7')).getByRole('button', { name: 'Cerrar' }));
    expect(currentPath()).toBe('');
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('JR-70: abrir la mini app en /ticket/<clave> muestra el ticket aunque no esté en el tablero', async () => {
    await openBoard('/ticket/PB-99');
    expect(await screen.findByRole('heading', { name: 'Resumen de PB-99' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tableros' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('listitem', { name: 'PA-7' }).getAttribute('aria-current')).toBeNull();
  });

  it('JR-70 JR-63: con una clave que no es válida, el tablero sin panel y sin consultar', async () => {
    await openBoard('/ticket/pa-7');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(detailCalls()).toHaveLength(0);
    expect(ticketOfPath('/ticket/PA-7')).toBe('PA-7');
    expect(ticketOfPath('/ticket/PA-07')).toBeNull();
    expect(ticketOfPath('/ticket/PA-7/x')).toBeNull();
    expect(ticketOfPath('/ticket/%E0%A4%A')).toBeNull();
    expect(ticketOfPath('/boards/1')).toBeNull();
  });

  it('JR-72: pulsar una subtarea, el padre o un enlace abre su detalle con entrada en el historial', async () => {
    const aside = await openCard();
    fireEvent.click(within(aside).getByRole('button', { name: 'Abrir PA-8: Validar campos' }));
    expect(currentPath()).toBe('/ticket/PA-8');
    expect(navigations.at(-1)).toEqual({ path: '/ticket/PA-8', replace: false });
    const sub = panel('PA-8');
    await within(sub).findByRole('heading', { name: 'Resumen de PA-8' });

    fireEvent.click(within(sub).getByRole('button', { name: 'Abrir PA-7: Pantalla de alta' }));
    expect(currentPath()).toBe('/ticket/PA-7');
    // JR-75: ya consultado y sin cambios en el tablero: no se vuelve a pedir.
    expect(await screen.findByRole('heading', { name: 'Resumen de PA-7' })).toBeTruthy();
    expect(detailCalls().map((c) => c.url)).toEqual([`${BASE}/issues/PA-7`, `${BASE}/issues/PA-8`]);
  });
});

describe('JR-71 JR-73 contenido del panel', () => {
  it('JR-71: enlaces agrupados por relación, en el orden de Jira, con su estado', async () => {
    const aside = await openCard();
    const links = within(aside).getByRole('region', { name: 'Enlaces' });
    expect([...links.querySelectorAll('h4')].map((h) => h.textContent)).toEqual(['bloquea', 'es bloqueado por']);
    const first = links.querySelectorAll('ul')[0];
    expect(within(first as HTMLElement).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Abrir PB-2: Exportar a CSV',
      'Abrir PB-4: Importar',
    ]);
    const subtasks = within(aside).getByRole('region', { name: 'Subtareas' });
    expect(within(subtasks).getByText('finished').getAttribute('data-paint')).toBe('green');
  });

  it('JR-73: los adjuntos enlazan a su descarga en Jira, con tipo, tamaño y autor', async () => {
    const aside = await openCard();
    const list = within(aside).getByRole('region', { name: 'Adjuntos' });
    const a = within(list).getByRole('link', { name: 'captura.png' });
    expect(a.getAttribute('href')).toBe(`${SITE}/rest/api/3/attachment/content/10100`);
    expect(list.textContent).toContain('image/png · 20,0 KB · Ana Inventada');
    expect(attachmentUrl(SITE, '7')).toBe(`${SITE}/rest/api/3/attachment/content/7`);
  });

  it('JR-73: el tamaño en B, KB o MB con un decimal y en base 1024', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1023)).toBe('1023 B');
    expect(formatSize(1024)).toBe('1,0 KB');
    expect(formatSize(1536)).toBe('1,5 KB');
    expect(formatSize(1024 * 1024 - 1)).toBe('1024,0 KB');
    expect(formatSize(5 * 1024 * 1024 + 300 * 1024)).toBe('5,3 MB');
  });

  it('JR-71: comentarios del más reciente al más antiguo, con su autor y «(editado)»', async () => {
    const aside = await openCard();
    const comments = within(aside).getByRole('region', { name: 'Comentarios (2)' });
    const items = within(comments).getAllByRole('article');
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual(['Comentario de Luis Inventado', 'Comentario de Ana Inventada']);
    expect(items[0].textContent).toContain('(editado)');
    expect(items[0].textContent).toContain('Segundo');
    expect(items[1].textContent).not.toContain('(editado)');
  });

  it('JR-71: sin nada opcional, sin las secciones vacías ni las líneas sin valor', async () => {
    details['PB-99'] = detailOf('PB-99', {
      type: null,
      priority: null,
      assignee: null,
      reporter: null,
      description: null,
      parent: null,
      subtasks: [],
      links: [],
      attachments: [],
      labels: [],
      components: [],
      comments: [],
    });
    await openBoard('/ticket/PB-99');
    await screen.findByRole('heading', { name: 'Resumen de PB-99' });
    const aside = panel('PB-99');
    expect([...aside.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Estado', 'Asignado', 'Creado', 'Actualizado']);
    expect(within(aside).getByText('Sin asignar')).toBeTruthy();
    expect(within(aside).getByText('Sin descripción')).toBeTruthy();
    expect(within(aside).getByText('Sin comentarios')).toBeTruthy();
    expect(within(aside).getByRole('region', { name: 'Comentarios (0)' })).toBeTruthy();
    for (const name of ['Subtareas', 'Enlaces', 'Adjuntos']) expect(within(aside).queryByRole('region', { name })).toBeNull();
  });

  it('JR-71: avisa de los comentarios recortados', async () => {
    details['PA-7'] = detailOf('PA-7', { commentsTruncated: true });
    const aside = await openCard();
    expect(within(aside).getByText('Se muestran los 200 comentarios más recientes.')).toBeTruthy();
  });
});

describe('JR-75 caché del detalle', () => {
  it('JR-75: volver a un ticket ya consultado no consulta, salvo con «Actualizar»', async () => {
    await openCard();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.click(screen.getByRole('listitem', { name: 'PA-7' }));
    expect(await screen.findByRole('heading', { name: 'Resumen de PA-7' })).toBeTruthy();
    expect(detailCalls()).toHaveLength(1);

    details['PA-7'] = detailOf('PA-7', { summary: 'Resumen nuevo' });
    fireEvent.click(within(panel('PA-7')).getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByRole('heading', { name: 'Resumen nuevo' })).toBeTruthy();
    expect(detailCalls()).toHaveLength(2);
  });

  it('JR-75: si el tablero muestra otra fecha de actualización, se vuelve a consultar una vez', async () => {
    await openCard();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    const later = '2026-11-23T11:00:00.000+0100';
    issues = boardIssues(later);
    details['PA-7'] = detailOf('PA-7', { summary: 'Con cambios', updated: later });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(server.callsTo('GET', `${BASE}/boards/1/issues`)).toHaveLength(2));
    await act(async () => {});

    fireEvent.click(screen.getByRole('listitem', { name: 'PA-7' }));
    expect(await screen.findByRole('heading', { name: 'Con cambios' })).toBeTruthy();
    expect(detailCalls()).toHaveLength(2);

    // Si Jira sigue dando otra fecha, no se repite la consulta.
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    details['PA-7'] = detailOf('PA-7', { updated: '2026-11-23T12:00:00.000+0100' });
    fireEvent.click(screen.getByRole('listitem', { name: 'PA-7' }));
    fireEvent.click(within(panel('PA-7')).getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(detailCalls()).toHaveLength(3));
    await act(async () => {});
    expect(detailCalls()).toHaveLength(3);
  });

  it('JR-75: un error se muestra en el panel con «Reintentar»', async () => {
    failNext = true;
    await openBoard();
    fireEvent.click(screen.getByRole('listitem', { name: 'PA-7' }));
    const alert = await within(panel('PA-7')).findByRole('alert');
    expect(alert.textContent).toContain('No existe en Jira');
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Resumen de PA-7' })).toBeTruthy();
    expect(within(panel('PA-7')).queryByRole('alert')).toBeNull();
    expect(detailCalls()).toHaveLength(2);
  });
});
