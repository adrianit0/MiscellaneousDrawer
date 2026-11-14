import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { ProcessesApp } from '../apps/processes/ProcessesApp';
import { createAppApi } from '../platform/appApi';
import { closeNotice, portsLabel, type CloseResult, type Profile, type Scan } from '../apps/processes/types';
import { installFakeServer, resetShell, type Call, type FakeServer } from './fakeServer';
import { InApp, testContext } from './miniApp';

/** CP-30 a CP-34: la interfaz de «Cerrar procesos», con su API simulada. No cierra nada. Datos inventados (S-31). */

const BASE = '/api/apps/processes';

const INTELLIJ: Profile = { id: 1, name: 'IntelliJ IDEA', processPattern: 'idea|IntelliJ', portFrom: 8080, portTo: 8090 };
const NODE: Profile = { id: 2, name: 'Servidor Node', processPattern: null, portFrom: 3000, portTo: 3000 };

const SCAN: Scan = {
  processes: [
    { pid: 100, command: '/opt/idea/bin/idea', ports: [], byPattern: true },
    { pid: 900, command: '/usr/bin/java com.example.DemoApi', ports: [8080, 8081], byPattern: false },
  ],
  blockedPorts: [],
  warning: null,
};

const EMPTY: Scan = { processes: [], blockedPorts: [], warning: null };

interface Backend {
  profiles: Profile[];
  scans: Record<number, Scan>;
  close: CloseResult | null;
  fail: { status: number; code: string; message: string; details?: unknown } | null;
}

let server: FakeServer;
let backend: Backend;
let notices: { text: string; kind: string | undefined }[];
let subtitles: (string | null)[];

function route(call: Call): { status?: number; body?: unknown } | undefined {
  const path = call.url.slice(BASE.length);
  if (call.method !== 'GET' && backend.fail) {
    const f = backend.fail;
    backend.fail = null;
    return { status: f.status, body: { code: f.code, message: f.message, details: f.details ?? null } };
  }
  if (path === '/profiles' && call.method === 'GET') return { body: { profiles: backend.profiles } };
  if (path === '/profiles' && call.method === 'POST') {
    const created = { ...(call.body as Omit<Profile, 'id'>), id: 7 };
    backend.profiles = [...backend.profiles, created];
    return { status: 201, body: created };
  }
  const match = /^\/profiles\/(\d+)(\/scan|\/close)?$/.exec(path);
  if (!match) return undefined;
  const id = Number(match[1]);
  if (match[2] === '/scan') return { body: backend.scans[id] ?? EMPTY };
  if (match[2] === '/close') {
    const pids = (call.body as { pids: number[] }).pids;
    const result = backend.close ?? { closed: pids, failed: [], gone: [] };
    // Lo cerrado desaparece de la siguiente búsqueda.
    const scan = backend.scans[id] ?? EMPTY;
    backend.scans[id] = { ...scan, processes: scan.processes.filter((p) => !result.closed.includes(p.pid)) };
    return { body: result };
  }
  if (call.method === 'PUT') {
    const updated = { ...(call.body as Omit<Profile, 'id'>), id };
    backend.profiles = backend.profiles.map((p) => (p.id === id ? updated : p));
    return { body: updated };
  }
  if (call.method === 'DELETE') {
    backend.profiles = backend.profiles.filter((p) => p.id !== id);
    return { body: { deleted: true } };
  }
  return undefined;
}

/** Como en AppFrame: el cliente es el mismo aunque cambie si la mini app se ve. */
const api = createAppApi('processes');

function Harness({ active = true }: { active?: boolean }) {
  const value = useMemo(
    () =>
      testContext({
        id: 'processes',
        api,
        active,
        notify: (text, kind) => notices.push({ text, kind }),
        setSubtitle: (text) => subtitles.push(text),
      }),
    [active],
  );
  return (
    <InApp value={value}>
      <ProcessesApp />
    </InApp>
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const scans = (id: number) => server.callsTo('GET', `${BASE}/profiles/${id}/scan`);
const profileNames = () =>
  within(screen.getByRole('navigation', { name: 'Perfiles' }))
    .getAllByRole('button')
    .map((b) => b.textContent);
const rows = () =>
  within(screen.getByRole('table', { name: 'Procesos' }))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent));

async function open(active = true) {
  const view = render(<Harness active={active} />);
  await screen.findByRole('navigation', { name: 'Perfiles' });
  return view;
}

async function openScanned() {
  const view = await open();
  await screen.findByRole('table', { name: 'Procesos' });
  return view;
}

beforeEach(() => {
  resetShell();
  notices = [];
  subtitles = [];
  backend = { profiles: [INTELLIJ, NODE], scans: { 1: SCAN }, close: null, fail: null };
  server = installFakeServer({ appRoutes: route });
});

describe('CP-30 perfiles', () => {
  it('CP-30: lista los perfiles y «Nuevo perfil», elige el primero y pone su nombre en la miga de pan', async () => {
    await openScanned();
    expect(profileNames()).toEqual(['IntelliJ IDEA', 'Servidor Node', 'Nuevo perfil']);
    expect(button('IntelliJ IDEA').getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('heading', { name: 'IntelliJ IDEA' })).toBeTruthy();
    expect(subtitles.at(-1)).toBe('IntelliJ IDEA');
  });

  it('CP-30: recuerda el perfil elegido', async () => {
    server.appStates.processes = { profile: 2 };
    await open();
    await screen.findByRole('heading', { name: 'Servidor Node' });
    expect(button('Servidor Node').getAttribute('aria-current')).toBe('true');
    fireEvent.click(button('IntelliJ IDEA'));
    await waitFor(() => expect(server.appStates.processes?.profile).toBe(1), { timeout: 2000 });
  });

  it('CP-30: si el elegido ya no existe, elige el primero', async () => {
    server.appStates.processes = { profile: 99 };
    await openScanned();
    expect(screen.getByRole('heading', { name: 'IntelliJ IDEA' })).toBeTruthy();
  });

  it('CP-30: sin perfiles lo dice e invita a crear uno', async () => {
    backend.profiles = [];
    await open();
    expect(screen.getByText(/No hay ningún perfil\. Crea uno con «Nuevo perfil»/)).toBeTruthy();
    expect(profileNames()).toEqual(['Nuevo perfil']);
    expect(subtitles.at(-1)).toBeNull();
  });
});

describe('CP-31 búsqueda', () => {
  it('CP-31: muestra el patrón, los puertos y los procesos encontrados', async () => {
    await openScanned();
    expect(screen.getByText('idea|IntelliJ')).toBeTruthy();
    expect(screen.getByText('8080 a 8090')).toBeTruthy();
    expect(rows()).toEqual([
      ['100', '—', '/opt/idea/bin/idea'],
      ['900', '8080, 8081', '/usr/bin/java com.example.DemoApi'],
    ]);
    expect(screen.getByRole('status').textContent).toBe('2 procesos');
    expect(portsLabel(NODE)).toBe('3000');
    expect(portsLabel({ ...NODE, portFrom: null, portTo: null })).toBeNull();
  });

  it('CP-31: sin procesos dice «No hay nada que cerrar» y no deja cerrar', async () => {
    backend.scans[1] = EMPTY;
    await open();
    await screen.findByText('No hay nada que cerrar');
    expect(screen.queryByRole('table')).toBeNull();
    expect(button('Cerrar todo').disabled).toBe(true);
  });

  it('CP-15 CP-31: avisa de los puertos de otro usuario y de que no se pueden buscar los puertos', async () => {
    backend.scans[1] = {
      ...SCAN,
      blockedPorts: [8082, 8085],
      warning: 'No se encontró el comando «ss»: no se pueden buscar los procesos de los puertos',
    };
    await openScanned();
    expect(screen.getByText('Ocupados por procesos de otro usuario, que no se pueden cerrar: 8082, 8085')).toBeTruthy();
    expect(screen.getByText('No se encontró el comando «ss»: no se pueden buscar los procesos de los puertos')).toBeTruthy();
  });
});

describe('CP-32 cuándo se busca', () => {
  it('CP-32: al elegir un perfil y al pulsar «Actualizar», y no se repite sola', async () => {
    await openScanned();
    expect(scans(1)).toHaveLength(1);
    await act(async () => {
      fireEvent.click(button('Actualizar'));
    });
    expect(scans(1)).toHaveLength(2);
    await act(async () => {
      fireEvent.click(button('Servidor Node'));
    });
    await screen.findByText('No hay nada que cerrar');
    expect(scans(2)).toHaveLength(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(scans(1)).toHaveLength(2);
    expect(scans(2)).toHaveLength(1);
  });

  it('CP-32: oculta no busca; al volver a verse, busca', async () => {
    const view = await open(false);
    expect(scans(1)).toHaveLength(0);
    view.rerender(<Harness active />);
    await screen.findByRole('table', { name: 'Procesos' });
    expect(scans(1)).toHaveLength(1);
    view.rerender(<Harness active={false} />);
    view.rerender(<Harness active />);
    await waitFor(() => expect(scans(1)).toHaveLength(2));
  });
});

describe('CP-33 «Cerrar todo»', () => {
  it('CP-33: cierra los procesos de la tabla sin diálogo, avisa y vuelve a buscar', async () => {
    await openScanned();
    await act(async () => {
      fireEvent.click(button('Cerrar todo'));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(server.callsTo('POST', `${BASE}/profiles/1/close`).map((c) => c.body)).toEqual([{ pids: [100, 900] }]);
    expect(notices).toEqual([{ text: 'Se han cerrado 2 procesos', kind: 'info' }]);
    await screen.findByText('No hay nada que cerrar');
    expect(scans(1)).toHaveLength(2);
  });

  it('CP-33: si alguno falla lo dice como error, y sigue en la tabla', async () => {
    backend.close = { closed: [900], failed: [{ pid: 100, command: '/opt/idea/bin/idea' }], gone: [] };
    await openScanned();
    await act(async () => {
      fireEvent.click(button('Cerrar todo'));
    });
    expect(notices).toEqual([{ text: 'No se han podido cerrar 1 de 2 procesos', kind: 'error' }]);
    await waitFor(() => expect(rows()).toEqual([['100', '—', '/opt/idea/bin/idea']]));
  });

  it('CP-33: los textos del aviso', () => {
    expect(closeNotice({ closed: [1], failed: [], gone: [] })).toEqual({ text: 'Se ha cerrado 1 proceso', kind: 'info' });
    expect(closeNotice({ closed: [1, 2, 3], failed: [], gone: [4] })).toEqual({ text: 'Se han cerrado 3 procesos', kind: 'info' });
    expect(closeNotice({ closed: [], failed: [], gone: [1, 2] })).toEqual({ text: 'Los procesos ya no estaban', kind: 'info' });
    expect(closeNotice({ closed: [1], failed: [{ pid: 2, command: 'x' }, { pid: 3, command: 'y' }], gone: [] })).toEqual({
      text: 'No se han podido cerrar 2 de 3 procesos',
      kind: 'error',
    });
  });

  it('CP-33: un error del servidor se avisa y no rompe la pantalla', async () => {
    backend.fail = { status: 404, code: 'profile_not_found', message: 'El perfil no existe' };
    await openScanned();
    await act(async () => {
      fireEvent.click(button('Cerrar todo'));
    });
    expect(notices).toEqual([{ text: 'El perfil no existe', kind: 'error' }]);
    await screen.findByRole('table', { name: 'Procesos' });
  });
});

describe('CP-34 formulario', () => {
  it('CP-34: «Nuevo perfil» crea un perfil, que queda elegido', async () => {
    await openScanned();
    fireEvent.click(button('Nuevo perfil'));
    const form = screen.getByRole('form', { name: 'Nuevo perfil' });
    expect(within(form).getAllByRole('textbox').map((i) => (i as HTMLInputElement).value)).toEqual(['', '', '', '']);
    fireEvent.change(field('Nombre'), { target: { value: '  Tomcat  ' } });
    fireEvent.change(field('Patrón de procesos'), { target: { value: 'catalina' } });
    fireEvent.change(field('Puerto inicial'), { target: { value: '9000' } });
    fireEvent.change(field('Puerto final'), { target: { value: '9010' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('POST', `${BASE}/profiles`).map((c) => c.body)).toEqual([
      { name: 'Tomcat', processPattern: 'catalina', portFrom: 9000, portTo: 9010 },
    ]);
    expect(profileNames()).toEqual(['IntelliJ IDEA', 'Servidor Node', 'Tomcat', 'Nuevo perfil']);
    expect(screen.getByRole('heading', { name: 'Tomcat' })).toBeTruthy();
    expect(button('Tomcat').getAttribute('aria-current')).toBe('true');
    expect(notices.at(-1)?.text).toBe('Perfil guardado.');
  });

  it('CP-34: «Editar» modifica el perfil; lo vacío viaja como null', async () => {
    await openScanned();
    fireEvent.click(button('Editar'));
    screen.getByRole('form', { name: 'Editar perfil' });
    expect(field('Nombre').value).toBe('IntelliJ IDEA');
    expect(field('Patrón de procesos').value).toBe('idea|IntelliJ');
    expect(field('Puerto inicial').value).toBe('8080');
    fireEvent.change(field('Patrón de procesos'), { target: { value: ' ' } });
    fireEvent.change(field('Puerto final'), { target: { value: '8099' } });
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    expect(server.callsTo('PUT', `${BASE}/profiles/1`).map((c) => c.body)).toEqual([
      { name: 'IntelliJ IDEA', processPattern: null, portFrom: 8080, portTo: 8099 },
    ]);
    await screen.findByText('8080 a 8099');
    // CP-32: el perfil ha cambiado: se busca otra vez.
    await waitFor(() => expect(scans(1)).toHaveLength(2));
  });

  it('CP-03 CP-34: un error de formato se muestra junto a su campo y no cierra el formulario', async () => {
    await openScanned();
    fireEvent.click(button('Nuevo perfil'));
    fireEvent.change(field('Nombre'), { target: { value: 'Malo' } });
    fireEvent.change(field('Puerto inicial'), { target: { value: 'ochenta' } });
    backend.fail = {
      status: 400,
      code: 'invalid_profile',
      message: '«Puerto inicial» debe ser un número entero de 1 a 65535',
      details: { field: 'portFrom' },
    };
    await act(async () => {
      fireEvent.click(button('Guardar'));
    });
    // Lo que no son cifras viaja como texto para que el servidor diga el error.
    expect(server.callsTo('POST', `${BASE}/profiles`)[0].body).toEqual({ name: 'Malo', processPattern: null, portFrom: 'ochenta', portTo: null });
    expect(screen.getByRole('alert').textContent).toBe('«Puerto inicial» debe ser un número entero de 1 a 65535');
    expect(field('Puerto inicial').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('form', { name: 'Nuevo perfil' })).toBeTruthy();
  });

  it('CP-34: «Cancelar» vuelve al perfil sin guardar', async () => {
    await openScanned();
    fireEvent.click(button('Editar'));
    fireEvent.change(field('Nombre'), { target: { value: 'Otro' } });
    fireEvent.click(button('Cancelar'));
    expect(screen.getByRole('heading', { name: 'IntelliJ IDEA' })).toBeTruthy();
    expect(server.callsTo('PUT', BASE)).toEqual([]);
  });

  it('CP-34: «Eliminar» pide confirmación', async () => {
    await openScanned();
    fireEvent.click(button('Eliminar'));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar perfil' });
    expect(dialog.textContent).toContain('Se eliminará el perfil «IntelliJ IDEA»');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(server.callsTo('DELETE', BASE)).toEqual([]);

    fireEvent.click(button('Eliminar'));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));
    });
    expect(server.callsTo('DELETE', `${BASE}/profiles/1`)).toHaveLength(1);
    expect(profileNames()).toEqual(['Servidor Node', 'Nuevo perfil']);
    // CP-30: el elegido ya no existe: se elige el primero.
    expect(screen.getByRole('heading', { name: 'Servidor Node' })).toBeTruthy();
    expect(notices.at(-1)?.text).toBe('Perfil eliminado.');
  });
});
