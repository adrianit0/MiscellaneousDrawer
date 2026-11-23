# Sprint 16: Tareas de «Gestask» desde «Tableros Jira» y cabecera fija

## Objetivo

Que cada tarjeta de «Tableros Jira» lleve a su tarea de «Gestask»: «+» abre Gestask con el formulario de creación relleno si el ticket todavía no es una tarea, y «>» abre la tarea si ya lo es. Además, la cabecera de «Tableros Jira» se queda fija arriba mientras se desplaza el tablero (ADR-0030).

## Requisitos cubiertos

- Plataforma: P-33 (nuevo); P-12, P-17 y P-29 (cambiados).
- Gestask: GT-121 a GT-124 (nuevos).
- Tableros Jira: JR-50 a JR-53 (nuevos); JR-41, «Datos», «API» y «Fuera de alcance» (cambiados).

Documentos: [requisitos/plataforma.md](../requisitos/plataforma.md), [requisitos/gestask.md](../requisitos/gestask.md), [requisitos/jira.md](../requisitos/jira.md), [ADR-0030](../decisiones/ADR-0030-tableros-jira-y-gestask.md), y el «Resultado» del [sprint 15](sprint-15.md).

## Tareas

1. **Especificación.** ADR-0030, los requisitos nuevos y cambiados, el principio 3 de la constitución, `diseno/mini-apps.md` y este sprint.
2. **Plataforma:**
   - `openApp(id, subruta)` en `useMiniApp()`.
   - El límite de un mensaje, de 4 KB a 64 KB (`Messages.MAX_CONTENT`).
   - El marco de una mini app con `height: 100%`.
3. **Servidor:**
   - Gestask: `GestaskTickets`, que envía la lista tras `tasks-list` (GT-121).
   - Tableros Jira: la tabla `gestask_ticket` (`V003__gestask_tickets.sql`), la recepción de los mensajes y `GET /gestask/tickets` (JR-50).
4. **Interfaz:**
   - Tableros Jira: el botón de cada tarjeta y la lista de tickets al mostrarse (JR-51, JR-52); la cabecera fija (JR-53).
   - Gestask: las subrutas `/new?…` y `/ticket/<clave>` (GT-122 a GT-124).
5. **Pruebas.**
   - Backend: cuándo envía Gestask y cuándo no, y que un fallo no cambia la respuesta; la recepción en Tableros Jira, con mensajes repetidos, de otro tipo y no válidos; el nuevo límite de los mensajes.
   - Interfaz:
     - `openApp`.
     - El botón «+» o «>» y su destino.
     - La lista pedida al volver sin consultar Jira.
     - Las dos subrutas de Gestask, con la tarea que ya existe y sin conexión.
6. **Documentación.** `README.md` y `CLAUDE.md`.
7. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación recorridos con la aplicación arrancada, datos aislados y Jira y Supabase simulados.

## Criterios de aceptación

- `./mvnw verify` termina en verde.
- Con Gestask abierto una vez, las tarjetas de «Tableros Jira» cuyo ticket es una tarea de Gestask llevan «>» y las demás «+».
- «+» abre Gestask con el formulario de creación con la clave, el resumen y, si coincide, la prioridad. Al guardar y volver a «Tableros Jira», esa tarjeta lleva «>» sin que Jira reciba ninguna consulta.
- «>» abre en Gestask el detalle de la tarea.
- En «Tableros», al desplazar un tablero largo, la cabecera y los nombres de las columnas se quedan arriba.
- La mini app sigue sin hacer ninguna petición a Jira que no sea `GET` o `POST /rest/api/3/search/jql`.

## Resultado

Fecha: 2026-11-23. Hecho en el código, probado con las pruebas y con la aplicación arrancada contra Jira y Supabase simulados. Todavía sin commits.

### Hecho

- **Especificación:**
  - ADR-0030, aceptada.
  - Requisitos nuevos: P-33, GT-121 a GT-124 y JR-50 a JR-53.
  - Requisitos cambiados: P-12, P-17, P-29 y JR-41, además de «Datos», «API» y «Fuera de alcance» de `requisitos/jira.md`.
  - El principio 3 de la constitución y `diseno/mini-apps.md`.
  - `README.md` y `CLAUDE.md`.
- **Plataforma:**
  - `openApp(id, subruta)` en `useMiniApp()` (`openAppAt` en `shell/actions.ts`).
  - `Messages.MAX_CONTENT` pasa a 64 KB.
  - `.app-frame` pasa a `height: 100%`.
- **Servidor:**
  - Gestask: `GestaskTickets` envía a `jira` el mensaje `gestask-tickets` tras el `tasks-list` principal, solo si la lista cambió y si cabe en un mensaje.
  - Tableros Jira: `GestaskTickets`, `GestaskTicketMapper` y la tabla `gestask_ticket` (`V003__gestask_tickets.sql`), con la ruta `GET /gestask/tickets`.
- **Interfaz:**
  - Tableros Jira:
    - El botón «+» o «>» de cada tarjeta, junto al estado.
    - La lista de tickets de Gestask, pedida al mostrarse.
    - La cabecera fija: la mini app ocupa el alto del área, solo se desplaza `.boardScroll` y los nombres de las columnas son `sticky`.
  - Gestask: las subrutas `/new?…` y `/ticket/<clave>` (`parseEntry`, `gestaskPriority`, `taskWithTicket`). Cada entrada abre un formulario nuevo aunque ya hubiera otro abierto.
- **Pruebas:** `./mvnw verify` en verde: 551 de backend, con las mismas 19 omitidas en Windows, y 442 de interfaz.
  - Backend: 10 pruebas nuevas.
    - 5 en `apps/gestask/GestaskTicketsTest`.
    - 4 en `apps/jira/GestaskTicketsTest`.
    - 1 en `MessageCenterTest`, con el nuevo límite.
  - Interfaz: 13 pruebas nuevas.
    - 1 de `openApp` en `AppFrame.test.tsx`.
    - 6 en `jiraApp.test.tsx`.
    - 6 en `gestaskApp.test.tsx`.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados, un Jira simulado de 60 tickets y un Supabase simulado con las tareas `PA-2` y `pa-5`:
  - Antes de abrir Gestask, todas las tarjetas llevaban «+». Al abrir Gestask y volver, `PA-2` y `PA-5` llevaban «>».
  - «+» en `PA-3`, con el resumen «Ticket de prueba 3 / 50% ¿#? & más», abrió el formulario con ese título exacto, el ticket y la prioridad «Menor». Al guardar y volver con «Atrás», se llegó a «Tableros Jira» y `PA-3` ya llevaba «>».
  - «>» en `PA-5` abrió el detalle de la tarea `pa-5`.
  - Al desplazar el tablero, la cabecera, la barra y los nombres de las columnas se quedaron arriba.
  - En todo el recorrido Jira recibió 2 peticiones: los estados con `GET` y una búsqueda con `POST /rest/api/3/search/jql`. Ni el token ni la contraseña aparecen en el registro.

### Pendiente

- Probar con el Jira Cloud y el Supabase reales del usuario.

### Desviaciones y decisiones

- **Prioridad que Gestask no tiene**: se pidió dejarla vacía, pero el formulario de Gestask no admite una tarea sin prioridad. Queda la que pone por defecto, `Menor` (GT-122, ADR-0030).
- **GT-124**: la vuelta a «Backlog» tras una entrada se separó en su propio requisito.
- **Sin comprobar el CSS de la mini app en las pruebas**: los CSS Modules se simulan en vitest. Las pruebas comprueban la estructura (qué queda dentro de lo que se desplaza) y el `height: 100%` del marco; el resto se comprobó con la aplicación arrancada.
