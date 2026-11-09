import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { CatalogApp } from '../api';
import { useMiniApp } from '../platform';
import { app, installFakeServer, resetShell } from '../test/fakeServer';
import { AppFrame } from './AppFrame';
import { useCatalog } from './catalogStore';
import { useNav } from './navStore';
import { ModuleRegistryContext, type ModuleRegistry } from './registry';
import { useRouter } from './router';
import { useUi } from './uiStore';

function Probe() {
  const ctx = useMiniApp();
  const [text, setText] = useState('');
  return (
    <div>
      <p>id={ctx.id}</p>
      <p>nombre={ctx.manifest.name}</p>
      <p>activa={String(ctx.active)}</p>
      <p>ruta={ctx.path || '(raíz)'}</p>
      <input aria-label="borrador" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" onClick={() => ctx.navigate('/lista/7')}>
        Ir a la lista
      </button>
      <button type="button" onClick={() => ctx.setSubtitle('Lista')}>
        Subtítulo
      </button>
      <button type="button" onClick={() => ctx.notify('Hola desde la mini app')}>
        Avisar
      </button>
    </div>
  );
}

function Broken(): never {
  throw new Error('Fallo de prueba al pintar');
}

const demo = app({ id: 'demo', name: 'Demo' });
const registry: ModuleRegistry = { demo: async () => ({ default: { Root: Probe } }) };

function renderFrame(target: CatalogApp, active: boolean, modules: ModuleRegistry = registry) {
  return render(
    <ModuleRegistryContext.Provider value={modules}>
      <AppFrame app={target} active={active} />
    </ModuleRegistryContext.Provider>,
  );
}

beforeEach(() => {
  resetShell();
  installFakeServer();
  useCatalog.setState({ apps: [demo], status: 'ready', error: null });
  useNav.getState().activate('demo', '');
});

describe('P-11, P-12 marco de la mini app', () => {
  it('carga la interfaz bajo demanda y le da su contexto', async () => {
    let loads = 0;
    const counted: ModuleRegistry = {
      demo: async () => {
        loads++;
        return { default: { Root: Probe } };
      },
    };
    renderFrame(demo, true, counted);
    expect(screen.getByText('Cargando Demo…')).toBeTruthy();
    expect(await screen.findByText('id=demo')).toBeTruthy();
    expect(screen.getByText('nombre=Demo')).toBeTruthy();
    expect(screen.getByText('activa=true')).toBeTruthy();
    expect(screen.getByText('ruta=(raíz)')).toBeTruthy();
    expect(loads).toBe(1);
  });

  it('navigate cambia su subruta en el historial, setSubtitle la miga y notify los avisos', async () => {
    useRouter.getState().navigate({ kind: 'app', appId: 'demo', path: '' });
    renderFrame(demo, true);
    fireEvent.click(await screen.findByText('Ir a la lista'));
    expect(window.location.hash).toBe('#/apps/demo/lista/7');
    fireEvent.click(screen.getByText('Subtítulo'));
    expect(useNav.getState().subtitles.demo).toBe('Lista');
    fireEvent.click(screen.getByText('Avisar'));
    expect(useUi.getState().notices.map((n) => n.text)).toEqual(['Hola desde la mini app']);
  });

  it('una mini app oculta no cambia la ruta visible al navegar: solo su subruta guardada', async () => {
    useRouter.getState().navigate({ kind: 'home' });
    renderFrame(demo, false);
    // Las consultas por texto también encuentran lo oculto.
    fireEvent.click(await screen.findByText('Ir a la lista'));
    expect(window.location.hash).toBe('#/');
    expect(useNav.getState().paths.demo).toBe('/lista/7');
  });

  it('una mini app disponible sin interfaz lo indica', () => {
    renderFrame(app({ id: 'sin-ui', name: 'Sin interfaz' }), true, {});
    expect(screen.getByText('Esta mini app no tiene interfaz')).toBeTruthy();
    expect(screen.getByText('frontend/src/apps/sin-ui/index.tsx')).toBeTruthy();
  });

  it('L-05: una mini app en preparación muestra su página', () => {
    renderFrame(app({ id: 'tasks', name: 'Tareas', status: 'planned', description: 'Gestor de tareas' }), true);
    expect(screen.getByRole('heading', { name: 'Tareas' })).toBeTruthy();
    expect(screen.getByText('Gestor de tareas')).toBeTruthy();
    expect(screen.getByText('En preparación')).toBeTruthy();
    expect(screen.getByText('Esta mini app aún no está disponible. Llegará en una versión próxima.')).toBeTruthy();
  });

  it('L-06: una mini app que falló muestra el error y dónde está el registro', () => {
    renderFrame(app({ id: 'rota', name: 'Rota', status: 'failed', error: 'Falló la migración V001' }), true);
    expect(screen.getByRole('heading', { name: 'No se pudo arrancar «Rota»' })).toBeTruthy();
    expect(screen.getByText('Falló la migración V001')).toBeTruthy();
    expect(screen.getByText('~/.local/state/cajonsastre/cajonsastre.log')).toBeTruthy();
  });
});

describe('P-15 aislamiento de errores', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('un error al pintar se queda en su marco y «Reintentar» la vuelve a montar', async () => {
    let fail = true;
    const flaky: ModuleRegistry = {
      demo: async () => ({ default: { Root: () => (fail ? <Broken /> : <Probe />) } }),
    };
    render(
      <ModuleRegistryContext.Provider value={flaky}>
        <p>Shell intacto</p>
        <AppFrame app={demo} active />
      </ModuleRegistryContext.Provider>,
    );
    expect(await screen.findByText('«Demo» ha fallado')).toBeTruthy();
    expect(screen.getByText('Fallo de prueba al pintar')).toBeTruthy();
    expect(screen.getByText('Shell intacto')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('id=demo')).toBeTruthy();
  });

  it('un error al descargar la interfaz también se queda en su marco y se puede reintentar', async () => {
    let attempts = 0;
    const offline: ModuleRegistry = {
      demo: async () => {
        attempts++;
        if (attempts === 1) throw new Error('No se pudo descargar el módulo');
        return { default: { Root: Probe } };
      },
    };
    renderFrame(demo, true, offline);
    expect(await screen.findByText('No se pudo descargar el módulo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('id=demo')).toBeTruthy();
    expect(attempts).toBe(2);
  });
});

describe('N-05 oculta pero montada', () => {
  it('conserva su estado al ocultarse y recibe active=false', async () => {
    const { rerender, container } = renderFrame(demo, true);
    fireEvent.change(await screen.findByLabelText('borrador'), { target: { value: 'a medias' } });
    rerender(
      <ModuleRegistryContext.Provider value={registry}>
        <AppFrame app={demo} active={false} />
      </ModuleRegistryContext.Provider>,
    );
    const frame = container.querySelector<HTMLElement>('section[data-app="demo"]')!;
    expect(frame.getAttribute('aria-label')).toBe('Demo');
    expect(frame.hidden).toBe(true);
    expect(screen.getByText('activa=false')).toBeTruthy();
    await act(async () => {});
    rerender(
      <ModuleRegistryContext.Provider value={registry}>
        <AppFrame app={demo} active />
      </ModuleRegistryContext.Provider>,
    );
    expect(frame.hidden).toBe(false);
    expect((screen.getByLabelText('borrador') as HTMLInputElement).value).toBe('a medias');
  });
});
