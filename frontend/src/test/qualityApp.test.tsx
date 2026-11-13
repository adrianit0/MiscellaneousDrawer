import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { QualityApp } from '../apps/quality/QualityApp';
import { parseSh } from '../apps/quality/shImport';
import { resultLabel, type ConfigView, type Run, type ScriptListing, type ScriptTables } from '../apps/quality/types';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** CD-05, CD-06, CD-40 a CD-45: la interfaz de «Calidad del dato», con su API simulada. Datos inventados (S-31). */

const BASE = '/api/apps/quality';

const CONFIG: ConfigView = {
  containerName: 'mysql-de-prueba',
  databaseName: 'demo',
  qualitySqlDir: '/datos/calidad',
  rootPasswordSet: true,
  missing: [],
};

const EMPTY: ConfigView = {
  containerName: null,
  databaseName: null,
  qualitySqlDir: null,
  rootPasswordSet: false,
  missing: ['containerName', 'rootPassword', 'databaseName', 'qualitySqlDir'],
};

const LISTING: ScriptListing = {
  folder: '/datos/calidad',
  exists: true,
  files: ['clientes_sin_nif.sql', 'facturas_huerfanas.sql', 'pedidos_sin_cliente.sql'],
};

function run(partial: Partial<Run> = {}): Run {
  return {
    id: 1,
    state: 'succeeded',
    startedAt: '2026-11-13T09:00:00Z',
    finishedAt: '2026-11-13T09:00:05Z',
    message: '2 de 3 scripts con incidencias: 1 con filas y 1 con error',
    consoleId: 7,
    scripts: [
      { file: 'clientes_sin_nif.sql', state: 'rows', rowCount: 1200, complete: true, error: null },
      { file: 'facturas_huerfanas.sql', state: 'clean', rowCount: 0, complete: true, error: null },
      { file: 'pedidos_sin_cliente.sql', state: 'error', rowCount: 0, complete: true, error: "ERROR 1146 (42S02): Table 'demo.x' doesn't exist" },
    ],
    ...partial,
  };
}

const TABLES: ScriptTables = {
  file: 'clientes_sin_nif.sql',
  rowCount: 1200,
  complete: true,
  tables: [{ columns: ['id', 'nombre'], rows: [['1', 'Cliente 1'], ['2', null], ['3', 'NULL']] }],
};

interface Backend {
  config: ConfigView;
  listing: ScriptListing;
  run: Run | null;
  fail: { status: number; code: string; message: string; details?: unknown } | null;
}

let server: FakeServer;
let backend: Backend;
let navigations: string[];
let notices: string[];
let subtitles: (string | null)[];
let shownConsoles: number[];

function route(call: Call): { status?: number; body?: unknown } | undefined {
  const path = call.url.slice(BASE.length);
  if (call.method !== 'GET' && backend.fail) {
    const f = backend.fail;
    backend.fail = null;
    return { status: f.status, body: { code: f.code, message: f.message, details: f.details ?? null } };
  }
  if (path === '/config') {
    if (call.method === 'PUT') {
      const body = call.body as Record<string, unknown>;
      backend.config = { ...backend.config, ...body, rootPasswordSet: backend.config.rootPasswordSet || !!body.rootPassword, missing: [] } as ConfigView;
      delete (backend.config as unknown as Record<string, unknown>).rootPassword;
    }
    return { body: backend.config };
  }
  if (path === '/scripts') return { body: backend.listing };
  if (path === '/run' && call.method === 'GET') return { body: { run: backend.run } };
  if (path === '/run') {
    const id = (backend.run?.id ?? 0) + 1;
    backend.run = run({ id, state: 'running', consoleId: 10 + id, message: null, finishedAt: null, scripts: [] });
    return { status: 202, body: { run: backend.run } };
  }
  if (path === '/run/cancel') {
    backend.run = { ...backend.run!, state: 'cancelled', message: 'Comprobación cancelada' };
    return { body: { cancelling: true } };
  }
  if (path.startsWith('/run/scripts/')) return { body: TABLES };
  return undefined;
}

function Harness({ initialPath = '', active = true }: { initialPath?: string; active?: boolean }) {
  const [path, setPath] = useState(initialPath);
  const value = useMemo(
    () =>
      testContext({
        id: 'quality',
        path,
        active,
        navigate: (to) => {
          navigations.push(to);
          setPath(to);
        },
        notify: (text) => notices.push(text),
        setSubtitle: (text) => subtitles.push(text),
        showConsole: (id) => shownConsoles.push(id),
      }),
    [path, active],
  );
  return (
    <InApp value={value}>
      <QualityApp />
    </InApp>
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const checkbox = (name: string | RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const posts = (path: string) => server.callsTo('POST', BASE + path);
const scriptNames = () =>
  within(screen.getByRole('list', { name: 'Scripts' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('input')!.getAttribute('aria-label'));

async function open(initialPath = '') {
  render(<Harness initialPath={initialPath} />);
  await screen.findByRole('navigation', { name: 'Secciones' });
  await waitFor(() => expect(screen.queryByText('Cargando…')).toBeNull());
}

async function openCheck() {
  await open();
  await screen.findByRole('list', { name: 'Scripts' });
}

beforeEach(() => {
  resetShell();
  navigations = [];
  notices = [];
  subtitles = [];
  shownConsoles = [];
  backend = { config: CONFIG, listing: LISTING, run: null, fail: null };
  server = installFakeServer({ appRoutes: route });
});

describe('CD-40 secciones', () => {
  it('CD-40: tiene «Comprobar» y «Configuración», con su subruta y su nombre en la miga de pan', async () => {
    await open();
    const tabs = within(screen.getByRole('navigation', { name: 'Secciones' })).getAllByRole('button');
    expect(tabs.map((t) => t.textContent)).toEqual(['Comprobar', 'Configuración']);
    expect(subtitles.at(-1)).toBe('Comprobar');
    fireEvent.click(button('Configuración'));
    expect(navigations).toEqual(['/settings']);
    expect(screen.getByRole('form', { name: 'Configuración' })).toBeTruthy();
    expect(subtitles.at(-1)).toBe('Configuración');
  });
});

describe('CD-41 «Comprobar»', () => {
  it('CD-03 CD-41: sin configuración dice qué falta, lleva a «Configuración» y no deja ejecutar', async () => {
    backend.config = EMPTY;
    await open();
    expect(screen.getByText(/Falta configurar: Contenedor, Contraseña de root, Base de datos, Carpeta de scripts de calidad\./)).toBeTruthy();
    expect(button('Ejecutar').disabled).toBe(true);
    expect(server.callsTo('GET', BASE + '/scripts')).toEqual([]);
    fireEvent.click(button('Ir a Configuración'));
    expect(navigations).toEqual(['/settings']);
  });

  it('CD-41: muestra los scripts marcados y, con todos, ejecuta la carpeta entera', async () => {
    await openCheck();
    expect(scriptNames()).toEqual(LISTING.files);
    expect(LISTING.files.map((f) => checkbox(f).checked)).toEqual([true, true, true]);
    expect(checkbox('Marcar todos').checked).toBe(true);
    await act(async () => {
      fireEvent.click(button('Ejecutar'));
    });
    expect(posts('/run').map((c) => c.body)).toEqual([{ files: null }]);
    // CD-42: al iniciar se muestra la consola.
    expect(shownConsoles).toEqual([11]);
    expect(button('Cancelar')).toBeTruthy();
  });

  it('CD-41: ejecuta solo los marcados, y «Marcar todos» los desmarca y los vuelve a marcar', async () => {
    await openCheck();
    fireEvent.click(checkbox('facturas_huerfanas.sql'));
    expect(checkbox('Marcar todos').checked).toBe(false);
    await act(async () => {
      fireEvent.click(button('Ejecutar'));
    });
    expect(posts('/run')[0].body).toEqual({ files: ['clientes_sin_nif.sql', 'pedidos_sin_cliente.sql'] });
  });

  it('CD-41: sin ninguno marcado no se puede ejecutar', async () => {
    await openCheck();
    fireEvent.click(checkbox('Marcar todos'));
    expect(LISTING.files.map((f) => checkbox(f).checked)).toEqual([false, false, false]);
    expect(button('Ejecutar').disabled).toBe(true);
    fireEvent.click(checkbox('Marcar todos'));
    expect(button('Ejecutar').disabled).toBe(false);
  });

  it('CD-41: «Filtrar» deja ver los que contienen el texto, sin distinguir mayúsculas, y ejecuta solo esos', async () => {
    await openCheck();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar' }), { target: { value: 'CLIENTE' } });
    expect(scriptNames()).toEqual(['clientes_sin_nif.sql', 'pedidos_sin_cliente.sql']);
    await act(async () => {
      fireEvent.click(button('Ejecutar'));
    });
    expect(posts('/run')[0].body).toEqual({ files: ['clientes_sin_nif.sql', 'pedidos_sin_cliente.sql'] });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar' }), { target: { value: 'nada' } });
    expect(screen.getByText('Ningún script coincide.')).toBeTruthy();
  });

  it('CD-41: dice si la carpeta no existe o no tiene scripts', async () => {
    backend.listing = { folder: '/datos/calidad', exists: false, files: [] };
    await open();
    expect(await screen.findByText('La carpeta /datos/calidad no existe.')).toBeTruthy();
  });

  it('P-14 CD-41: el filtro y «Solo con incidencias» se recuerdan', async () => {
    server.appStates.quality = { filter: 'facturas', onlyIncidents: true };
    await open();
    await waitFor(() => expect((screen.getByRole('searchbox', { name: 'Filtrar' }) as HTMLInputElement).value).toBe('facturas'));
    expect(checkbox('Solo con incidencias').checked).toBe(true);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar' }), { target: { value: 'pedidos' } });
    await waitFor(() => expect(server.appStates.quality?.filter).toBe('pedidos'), { timeout: 2000 });
  });
});

describe('CD-42 a CD-44 resultados', () => {
  it('CD-42: cada script muestra su resultado y arriba está el resumen con «Ver consola»', async () => {
    backend.run = run();
    await openCheck();
    const status = await screen.findByRole('status', { name: 'Resumen' });
    expect(status.textContent).toBe('2 de 3 scripts con incidencias: 1 con filas y 1 con error');
    const items = within(screen.getByRole('list', { name: 'Scripts' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'clientes_sin_nif.sql1200 filas',
      'facturas_huerfanas.sqlCorrecto',
      'pedidos_sin_cliente.sqlError',
    ]);
    fireEvent.click(button('Ver consola'));
    expect(shownConsoles).toEqual([7]);
    expect(notices).toEqual([]);
  });

  it('CD-42: sin incidencias dice que la base está bien, y un número incompleto dice «Más de»', async () => {
    backend.run = run({
      message: 'La base de datos tiene correctamente todos sus datos',
      scripts: [{ file: 'clientes_sin_nif.sql', state: 'clean', rowCount: 0, complete: true, error: null }],
    });
    await openCheck();
    expect((await screen.findByRole('status', { name: 'Resumen' })).textContent).toBe('La base de datos tiene correctamente todos sus datos');
    const base = { file: 'a.sql', error: null };
    expect(resultLabel({ ...base, state: 'rows', rowCount: 4000, complete: false })).toBe('Más de 4000 filas');
    expect(resultLabel({ ...base, state: 'rows', rowCount: 1, complete: true })).toBe('1 fila');
    expect(resultLabel({ ...base, state: 'running', rowCount: 0, complete: true })).toBe('En marcha');
    expect(resultLabel({ ...base, state: 'pending', rowCount: 0, complete: true })).toBe('Pendiente');
  });

  it('CD-42: «Solo con incidencias» oculta los correctos', async () => {
    backend.run = run();
    await openCheck();
    await screen.findByRole('status', { name: 'Resumen' });
    fireEvent.click(checkbox('Solo con incidencias'));
    expect(scriptNames()).toEqual(['clientes_sin_nif.sql', 'pedidos_sin_cliente.sql']);
  });

  it('CD-43: al pulsar un script con filas se ven en una tabla, con NULL distinto de la cadena «NULL»', async () => {
    backend.run = run();
    await openCheck();
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'clientes_sin_nif.sql' }));
    });
    const region = await screen.findByRole('region', { name: 'Resultado de clientes_sin_nif.sql' });
    expect(server.callsTo('GET', BASE + '/run/scripts/clientes_sin_nif.sql')).toHaveLength(1);
    expect(within(region).getByText('Se muestran 3 de 1200 filas.')).toBeTruthy();
    expect(within(region).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['id', 'nombre']);
    const cells = within(region).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell'));
    expect(cells.map((r) => r.map((c) => c.textContent))).toEqual([
      ['1', 'Cliente 1'],
      ['2', 'NULL'],
      ['3', 'NULL'],
    ]);
    expect(cells[1][1].className).not.toBe(cells[2][1].className);
  });

  it('CD-43: al pulsar un script con error se ven sus líneas de error', async () => {
    backend.run = run();
    await openCheck();
    fireEvent.click(await screen.findByRole('button', { name: 'pedidos_sin_cliente.sql' }));
    const region = screen.getByRole('region', { name: 'Resultado de pedidos_sin_cliente.sql' });
    expect(within(region).getByText("ERROR 1146 (42S02): Table 'demo.x' doesn't exist")).toBeTruthy();
    expect(server.callsTo('GET', BASE + '/run/scripts/pedidos_sin_cliente.sql')).toEqual([]);
  });

  it('CD-44: consulta cada segundo mientras está en marcha y avisa al terminar', async () => {
    await openCheck();
    await act(async () => {
      fireEvent.click(button('Ejecutar'));
    });
    expect((await screen.findByRole('status', { name: 'Resumen' })).textContent).toBe('Comprobación en marcha');
    backend.run = run({ id: 1, consoleId: 11 });
    await waitFor(() => expect(screen.getByRole('status', { name: 'Resumen' }).textContent).toBe(run().message), { timeout: 3000 });
    expect(notices).toEqual(['Calidad del dato: 2 de 3 scripts con incidencias: 1 con filas y 1 con error']);
    expect(button('Ejecutar')).toBeTruthy();
  }, 10000);

  it('CD-27 CD-42: «Cancelar» cancela la comprobación en marcha', async () => {
    backend.run = run({ state: 'running', message: null, finishedAt: null });
    await openCheck();
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    });
    expect(posts('/run/cancel')).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Resumen' }).textContent).toBe('Comprobación cancelada'), { timeout: 3000 });
  }, 10000);

  it('CD-44 N-05: oculta no consulta, y al volver a verse consulta de inmediato', async () => {
    backend.run = run({ state: 'running', message: null, finishedAt: null });
    const view = render(<Harness active={false} />);
    await screen.findByRole('navigation', { name: 'Secciones' });
    await new Promise((r) => setTimeout(r, 1200));
    expect(server.callsTo('GET', BASE + '/run')).toEqual([]);
    view.rerender(<Harness active />);
    expect(await screen.findByRole('status', { name: 'Resumen' })).toBeTruthy();
  }, 10000);
});

describe('CD-45 «Configuración»', () => {
  it('CD-45 CD-02: guarda los campos y solo envía la contraseña si se escribe', async () => {
    await open('/settings');
    expect(screen.getByText('Hay una contraseña guardada. Escribe otra para cambiarla.')).toBeTruthy();
    expect(field('Contraseña de root').value).toBe('');
    fireEvent.change(field('Carpeta de scripts de calidad'), { target: { value: ' /datos/otra ' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('PUT', BASE + '/config')[0].body).toEqual({
      containerName: 'mysql-de-prueba',
      databaseName: 'demo',
      qualitySqlDir: '/datos/otra',
    });
    expect(notices).toEqual(['Configuración guardada.']);
  });

  it('CD-45: un error de formato se muestra junto a su campo', async () => {
    await open('/settings');
    backend.fail = { status: 400, code: 'invalid_config', message: '«Carpeta de scripts de calidad» debe ser una ruta absoluta', details: { field: 'qualitySqlDir' } };
    fireEvent.change(field('Carpeta de scripts de calidad'), { target: { value: 'relativa' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(screen.getByRole('alert').textContent).toBe('«Carpeta de scripts de calidad» debe ser una ruta absoluta');
    expect(field('Carpeta de scripts de calidad').getAttribute('aria-invalid')).toBe('true');
  });

  it('CD-05: importar un .sh rellena el formulario sin guardar y dice qué ha omitido', async () => {
    await open('/settings');
    const sh = ['CONTAINER_NAME="mysql-importado"', 'MYSQL_ROOT_PASSWORD="clave-inventada"', 'QUALITY_SQL_FOLDER="calidad"', 'S3_PATH="s3://x"'].join('\n');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fichero .sh'), { target: { files: [new File([sh], 'config.sh')] } });
    });
    await screen.findByText('Se han rellenado 2 campos con config.sh. Revísalos y pulsa «Guardar».');
    expect(field('Contenedor').value).toBe('mysql-importado');
    expect(field('Contraseña de root').value).toBe('clave-inventada');
    expect(field('Carpeta de scripts de calidad').value).toBe('/datos/calidad');
    expect(screen.getByText('Carpeta de scripts de calidad (QUALITY_SQL_FOLDER): no es una ruta absoluta')).toBeTruthy();
    expect(server.callsTo('PUT', BASE + '/config')).toEqual([]);
  });

  it('CD-06: con cambios sin guardar, cambiar de sección pregunta; «Salir sin guardar» los descarta', async () => {
    await open('/settings');
    fireEvent.change(field('Base de datos'), { target: { value: 'otra' } });
    fireEvent.click(button('Comprobar'));
    const dialog = screen.getByRole('alertdialog', { name: 'Cambios sin guardar' });
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancelar', 'Salir sin guardar', 'Guardar']);
    expect(navigations).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salir sin guardar' }));
    expect(navigations).toEqual(['']);
    fireEvent.click(button('Configuración'));
    expect(field('Base de datos').value).toBe('demo');
  });

  it('CD-06: «Guardar» en el diálogo guarda y cambia de sección', async () => {
    await open('/settings');
    fireEvent.change(field('Contraseña de root'), { target: { value: 'clave-de-prueba' } });
    fireEvent.click(button('Comprobar'));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Cambios sin guardar' })).getByRole('button', { name: 'Guardar' }));
    });
    expect((server.callsTo('PUT', BASE + '/config')[0].body as Record<string, unknown>).rootPassword).toBe('clave-de-prueba');
    expect(navigations).toEqual(['']);
  });
});

describe('CD-05 lectura del .sh', () => {
  it('CD-05: lee las cuatro variables, quita la / final y omite lo que usa variables', () => {
    const result = parseSh(
      [
        '#!/bin/sh',
        'export CONTAINER_NAME=mysql-importado  # comentario',
        "MYSQL_ROOT_PASSWORD=' clave con espacios '",
        'DATABASE_NAME="$OTRA"',
        'QUALITY_SQL_FOLDER="/datos/calidad/"',
        'PRE_PASS="no-debe-leerse"',
      ].join('\n'),
    );
    expect(result.values).toEqual({
      containerName: 'mysql-importado',
      rootPassword: ' clave con espacios ',
      qualitySqlDir: '/datos/calidad',
    });
    expect(result.skipped).toEqual([{ field: 'databaseName', variable: 'DATABASE_NAME', reason: 'usa variables o comandos' }]);
  });
});
