# Sprint 5: Consolas de la plataforma

## Objetivo

Que cualquier mini app pueda mostrar la salida de sus ejecuciones en un único sitio: un panel desplegable bajo la ventana, a todo el ancho y de altura variable, con la lista de consolas a la izquierda (nombre, mini app y estado) y la salida de la elegida a la derecha, de solo lectura, con «Limpiar terminadas». «Base de datos» es el primer uso.

## Requisitos cubiertos

- Plataforma: P-25 a P-28 (nuevos), P-05 y P-12.
- Navegación: N-14 a N-17 (nuevos).
- Datos y API: D-04 y las rutas `/api/consoles`, `/api/consoles/{id}` y `/api/events`.
- Base de datos: BD-13, BD-14, BD-62 y BD-63.

Documentos: [ADR-0014](../decisiones/ADR-0014-consolas.md), [requisitos/plataforma.md](../requisitos/plataforma.md), [requisitos/navegacion.md](../requisitos/navegacion.md), [diseno/mini-apps.md](../diseno/mini-apps.md) («Consolas»).

## Tareas

1. **Especificación.** ADR-0014, los requisitos nuevos y modificados, `modelo-datos.md`, `arquitectura.md` y la sección «Consolas» de `mini-apps.md`.
2. **Plataforma.** `Consoles`, `Console`, `ConsoleState` y `AppContext.consoles()`.
3. **Servidor del shell**, paquete `dev.cajonsastre.consoles`.
   - `ConsoleCenter`: abrir, escribir, terminar, conservar 20 consolas de 5000 líneas, listar, limpiar y repartir (P-25 a P-28).
   - `AppRegistry` y `Main`: cada mini app recibe sus consolas; los cambios en la lista van por `/api/events`.
4. **Interfaz del shell.**
   - `consoleStore.ts` y `ConsoleDock.tsx`: barra inferior, panel, lista, salida, altura y «Limpiar terminadas» (N-14 a N-17).
   - `presence.ts`: evento `consoles`.
   - `useMiniApp().showConsole(id)` (P-12).
5. **«Base de datos».** `JobRunner` escribe en una consola; se retiran `JobLog`, el registro de `GET /job` y el de «Preparar», que gana «Ver consola» (BD-14, BD-62).
6. **Documentación.** `README.md` y `CLAUDE.md`.
7. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada.

Orden: primero las pruebas de cada requisito y después su código. Commits pequeños en español; ningún push, porque publicaría una versión (R-01).

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- Una mini app abre una consola, escribe en ella y la termina con `context.consoles()`, y no importa nada fuera de `platform` (P-18).
- La barra inferior ocupa todo el ancho, con el botón «Consolas» y el número de consolas en progreso.
- El panel se despliega y se recoge con el botón, y sigue como se dejó tras recargar la ventana.
- La altura del panel cambia arrastrando su borde superior y con ↑ y ↓, y se conserva tras recargar.
- La lista muestra cada consola con su nombre, su mini app y su estado, la más reciente primero; al pulsar una se ve su salida a la derecha.
- Una consola abierta con la ventana abierta aparece sin recargar, su salida crece sola y su estado cambia al terminar.
- «Limpiar terminadas» quita las terminadas, con error y canceladas, y deja las que están en progreso.
- Nunca hay más de 20 consolas ni más de 5000 líneas en una, y no se escribe nada en disco.
- Un trabajo de «Base de datos» abre su consola «Trabajo N · rama», que termina como «Terminado», «Error» o «Cancelado». «Preparar» ya no muestra el registro y tiene «Ver consola».

## Resultado

Fecha: 2026-11-12. Hecho en el código, probado y recorrido con la aplicación arrancada en Windows. Sin commits todavía.

### Hecho

- **Especificación:** ADR-0014 aceptada; P-25 a P-28 y N-14 a N-17 nuevos; cambios en P-05, P-12, D-04, la API, BD-13, BD-14, BD-41, BD-62, `modelo-datos.md`, `arquitectura.md` y la sección «Consolas» de `mini-apps.md`.
- **Plataforma:** `Consoles`, `Console`, `ConsoleState` y `AppContext.consoles()`.
- **Servidor (`dev.cajonsastre.consoles`):** `ConsoleCenter` abre, escribe, termina, conserva 20 consolas de 5000 líneas, lista, limpia y avisa de los cambios, todo en memoria. Rutas `GET` y `DELETE /api/consoles` y `GET /api/consoles/{id}?after=N`.
- **Shell:** `AppRegistry.start` recibe las consolas de cada mini app; `Main` envía el evento `consoles` por `/api/events`.
- **Interfaz:** `ConsoleDock` y `consoleStore` (barra inferior, panel, lista, salida, altura con ratón y teclado, y «Limpiar terminadas»), evento `consoles` en `presence.ts` y `showConsole` en `useMiniApp()`. Los avisos de U-05 suben para no tapar la barra.
- **«Base de datos»:** `JobRunner` escribe en una consola «Trabajo N · rama» y la termina con el estado del trabajo; desaparecen `JobLog`, el parámetro `after` y el registro de `GET /job`, que lleva `consoleId`. «Preparar» ya no pinta el registro: tiene «Ver consola» y muestra la consola al iniciar un trabajo.
- **Documentación:** `README.md` y `CLAUDE.md`.
- **Pruebas:** 361 de backend y 212 de interfaz.
  - Nuevas de backend: 13 en `ConsoleCenterTest`; en `DatabaseAppTest`, las dos de BD-14 sobre el registro se sustituyen por dos sobre la consola del trabajo.
  - Nuevas de interfaz: 14 en `shell/consoles.test.tsx`; las de BD-62 y BD-63 de `databaseApp.test.tsx` se han adaptado.
  - En Windows se omiten las mismas 19 de backend de los sprints anteriores.

### Criterios de aceptación

1. **`./mvnw verify` en verde:** en Windows 10, con las pruebas de fronteras. **Cumplido.**
2. **Abrir, escribir y terminar sin salir de `platform`:** `JobRunner` solo importa `platform.Console`, `ConsoleState` y `Consoles`; `AppBoundariesTest` pasa. **Cumplido.**
3. **Barra inferior a todo el ancho, con «Consolas» y las que están en progreso:** con la aplicación arrancada, la barra medía los 1024 px de la ventana; el contador, en la prueba N-14. **Cumplido.**
4. **Se despliega, se recoge y sigue como se dejó tras recargar:** con la aplicación arrancada, tras recargar seguía desplegado con su consola. **Cumplido.**
5. **Altura con el borde y con ↑ y ↓, conservada:** con la aplicación arrancada pasó de 260 a 308 px con el teclado y a 368 px arrastrando, y `shell.consoleHeight` quedó guardado. **Cumplido.**
6. **Lista con nombre, mini app y estado, y salida a la derecha:** con la aplicación arrancada, «Trabajo 1 · Hotfix», «Base de datos», «Error» y los comandos del trabajo. **Cumplido.**
7. **Aparece sin recargar, la salida crece y el estado cambia:** al iniciar el trabajo se desplegó el panel con su consola sin tocar nada más. El crecimiento línea a línea y el paso de «En progreso» a «Terminado» solo están en las pruebas N-15 y P-28: sin `aws` instalado el trabajo termina al instante. **Cumplido en pruebas.**
8. **«Limpiar terminadas»:** con la aplicación arrancada dejó «No hay consolas» y `GET /api/consoles` vacío; que respeta las que están en progreso, en las pruebas P-27 y N-17. **Cumplido.**
9. **Ni más de 20 consolas ni más de 5000 líneas, y nada en disco:** pruebas P-26; con la aplicación arrancada, ningún fichero de datos, configuración o registro contenía la salida, y el registro del shell solo recogió «Trabajo 1 … iniciado» y «terminado: failed» (S-21). **Cumplido.**
10. **«Base de datos» abre su consola y «Preparar» tiene «Ver consola»:** pruebas BD-14 y BD-62, y con la aplicación arrancada. **Cumplido.**

### Pendiente

- **Verificación en Ubuntu** y con un trabajo real, largo, para ver la salida crecer y el estado «En progreso» en pantalla.
- Un aviso de U-05 tapa unos segundos la esquina inferior derecha de la salida cuando el panel está desplegado.
- Siguen pendientes los puntos de los sprints anteriores.

### Desviaciones y decisiones

- **ADR-0014 (aceptada):** consolas en memoria, el registro de «Base de datos» pasa a la consola y cuatro estados.
- **Las líneas no van por `/api/events`:** el canal lleva la lista entera en cada cambio (evento `consoles`) y la ventana pide las líneas de la consola elegida cada segundo, solo con el panel desplegado.
- **`showConsole(id)` en `useMiniApp()`:** hace falta para «Ver consola»; por eso `Console` expone `id()` y `GET /job` lleva `consoleId`.
- **Al iniciar un trabajo se despliega el panel** con su consola, para no perder de vista el registro que antes estaba en «Preparar».
- **El panel se despliega bajo la barra «Consolas»**, que hace de cabecera, y el borde para cambiar la altura queda encima de ella.
- **`AppRegistry.start` conserva sus variantes sin consolas** para las pruebas: lo que se escribe en ellas se descarta.

### Cómo usarlo desde una mini app nueva

1. En `start(AppContext context, AppRoutes routes)`, guardar `context.consoles()`.
2. Al empezar una ejecución: `Console console = consoles.open("Nombre")`; por cada línea, `console.line(texto)`; al acabar, siempre, `console.finish(ConsoleState.SUCCEEDED)`, `FAILED` o `CANCELLED`.
3. Para enlazarla desde la interfaz, devolver `console.id()` por su API y llamar a `showConsole(id)` de `useMiniApp()`.
4. En sus pruebas, pasar un `Consoles` propio, o `new ConsoleCenter(…)::forApp`, como quinto argumento de `AppRegistry.start`.
