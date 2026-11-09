# ADR-0005: Mini apps como porciones verticales con un catálogo declarado en el servidor

- Estado: aceptada
- Fecha: 2026-11-09
- Requisitos: P-01 a P-07, P-11 a P-19, A-04

## Contexto

CajonSastre reunirá mini apps de naturaleza muy distinta (tareas, bases de datos, utilidades). El usuario pidió que su integración se definiera «de la manera más correcta», no de forma trivial. Había que decidir dónde se declara una mini app, cómo se carga y qué la separa de las demás.

## Opciones consideradas

1. **Rutas y componentes sueltos**: cada mini app añade sus rutas al servidor y su pantalla a un `switch` del shell. Sencillo, pero sin fronteras: nada impide que una mini app use datos o estilos de otra, y un fallo de una tumba la aplicación.
2. **Plugins dinámicos** (JAR o paquetes cargados en ejecución con `ServiceLoader` o similar). Flexible, pero CajonSastre se construye entero desde un único repositorio: la carga dinámica añade superficie de ataque y complejidad sin ningún uso real.
3. **Porciones verticales con un contrato y un catálogo explícito** (elegida).

## Decisión

- Una mini app es una porción vertical bajo un identificador (P-01): manifiesto, servidor opcional, base opcional e interfaz.
- **El catálogo se declara en el servidor** (`AppCatalog`), en una lista explícita. El servidor conoce además el estado en ejecución y lo sirve en `GET /api/catalog`, así que la interfaz no necesita una segunda lista. Sin descubrimiento automático en el servidor: añadir una mini app es una línea visible en una revisión.
- **La interfaz se localiza por convención** (`frontend/src/apps/<id>/index.tsx`) y se carga bajo demanda con `import.meta.glob`, que genera un fichero por mini app. Una prueba del servidor comprueba que toda mini app disponible tiene esa carpeta (P-19).
- **Contrato mínimo** en los dos lados: `MiniApp`, `AppContext` y `AppRoutes` en Java; `MiniAppModule`, `useMiniApp`, `useAppState` y `useAppShortcut` en la interfaz. Es lo único que una mini app puede importar del proyecto (P-18), y unas pruebas lo comprueban leyendo el código.
- **Aislamiento de fallos** en los dos lados: arranque con captura por mini app (P-07) y marco con límite de errores en la interfaz (P-15).
- **Aislamiento de estilos** con CSS Modules, que Vite admite sin dependencias (P-17).
- Las rutas del shell que conciernen a una mini app (`/api/catalog`, `/api/app-state/<id>`) quedan fuera de `/api/apps/<id>/`, que pertenece por entero a la mini app (A-04).

## Consecuencias

- Añadir una mini app no toca el shell, salvo su línea en el catálogo.
- El contrato crecerá solo cuando una mini app real lo necesite («Fuera de la plataforma, por ahora» en `diseno/mini-apps.md`).
- Las pruebas de fronteras analizan importaciones por texto: son deliberadamente sencillas y pueden ampliarse si aparece un caso que no cubren.
