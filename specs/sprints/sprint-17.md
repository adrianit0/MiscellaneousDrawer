# Sprint 17: Detalle del ticket en «Tableros Jira»

## Objetivo

Leer un ticket sin salir de «Tableros Jira»: al pulsar una tarjeta se abre a la derecha un panel con su ficha, su descripción, sus subtareas, sus enlaces, sus adjuntos y sus comentarios. El panel tiene su propia subruta, `/ticket/<clave>`, que usarán los avisos del sprint 19 (ADR-0031).

Es el primero de tres sprints que el usuario ordenó por necesidad el 2026-11-24. Después vienen las métricas de flujo (sprint 18) y los avisos de cambios (sprint 19).

## Requisitos cubiertos

- Tableros Jira: JR-60 a JR-64 y JR-70 a JR-75 (nuevos); JR-41, «Datos», «API» y «Fuera de alcance» (cambiados).

Documentos: [requisitos/jira.md](../requisitos/jira.md), [ADR-0031](../decisiones/ADR-0031-detalle-del-ticket-en-tableros-jira.md) y el «Resultado» del [sprint 16](sprint-16.md).

## Tareas

1. **Especificación.** ADR-0031, los requisitos nuevos y cambiados y este sprint.
2. **Servidor:**
   - `Jira.issue` y `Jira.comments`: las dos llamadas `GET` (JR-60, JR-62).
   - `IssueDetail`: la clave válida (JR-63) y el objeto del detalle (JR-61).
   - La ruta `GET /issues/{key}`, con su registro (JR-64).
3. **Interfaz:**
   - `adf.tsx`: el renderizador de ADF (JR-74).
   - `IssuePanel.tsx`: el panel, con su ficha, sus secciones y sus estados de carga y error (JR-71 a JR-73).
   - `detailCache.ts`: la caché por ticket (JR-75).
   - En `BoardView` y `JiraApp`: abrir con la tarjeta, la subruta `/ticket/<clave>`, la tarjeta marcada, Esc y «Cerrar» (JR-70).
4. **Pruebas.**
   - Backend, con `FakeJira`, que pasa a entender las dos llamadas nuevas:
     - el detalle completo y el que no tiene nada opcional;
     - las relaciones de los enlaces y los adjuntos sin identificador válido;
     - los comentarios paginados y recortados a 200;
     - las claves no válidas, sin contactar con Jira;
     - los errores de Jira;
     - que todo es `GET` y lo que queda en el registro.
   - Interfaz:
     - cada nodo de la tabla de JR-74, uno desconocido, los enlaces que no son `http` y el corte por anidamiento;
     - abrir, cerrar con Esc y con «Cerrar», la subruta y la entrada directa por `/ticket/<clave>`;
     - pasar a una subtarea o un enlace;
     - la caché: sin consultar al volver, consultando si cambió `updated`, con «Actualizar» y con «Reintentar»;
     - los adjuntos y su enlace;
     - las secciones vacías.
5. **Documentación.** `README.md` y `CLAUDE.md`.
6. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación recorridos con la aplicación arrancada, datos aislados y Jira simulado.

## Criterios de aceptación

- `./mvnw verify` termina en verde.
- Al pulsar una tarjeta se abre el panel con el detalle del ticket, y el tablero sigue visible a la izquierda.
- La descripción y los comentarios se ven con su formato: títulos, listas, código, tablas, menciones y enlaces. Un texto con `<script>` en un ticket se ve como texto.
- Pulsar una subtarea abre su detalle, y «Atrás» vuelve al ticket anterior.
- Esc cierra el panel.
- Abrir la mini app en `/ticket/<clave>` muestra ese ticket.
- Volver a un ticket ya abierto no consulta Jira si no ha cambiado.
- La mini app sigue sin hacer ninguna petición a Jira que no sea `GET` o `POST /rest/api/3/search/jql`.

## Resultado

Fecha: 2026-11-24. Hecho en el código, probado con las pruebas y con la aplicación arrancada contra un Jira simulado. Todavía sin commits.

### Hecho

- **Especificación:**
  - ADR-0031, aceptada.
  - Requisitos nuevos: JR-60 a JR-64 y JR-70 a JR-75, con la tabla de nodos ADF.
  - Requisitos cambiados: JR-41, y «Datos», «API» y «Fuera de alcance» de `requisitos/jira.md`.
  - `README.md` y `CLAUDE.md`.
- **Servidor:**
  - `Jira.issue` y `Jira.comments`, las dos con `GET`.
  - `IssueDetail`: la clave válida (`ISSUE_KEY`) y el objeto del detalle.
  - La ruta `GET /issues/{key}`, que solo registra el número de comentarios.
- **Interfaz:**
  - `adf.tsx`: el renderizador de ADF, con React y sin HTML.
  - `IssuePanel.tsx`: el panel.
  - `detailCache.ts`: la caché por ticket, que no repite una consulta por la misma fecha del tablero.
  - En `BoardView`: la tarjeta que se pulsa y se marca, con el resumen como botón para el teclado.
  - En `JiraApp`: la subruta `/ticket/<clave>` (`ticketOfPath`).
- **Pruebas:** `./mvnw verify` en verde: 560 de backend, con las mismas 19 omitidas en Windows, y 465 de interfaz.
  - Backend: 9 pruebas nuevas en `apps/jira/IssueDetailTest`. `FakeJira` entiende el ticket y sus comentarios.
  - Interfaz: 23 pruebas nuevas en `jiraDetail.test.tsx`.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados y un Jira simulado de 3 tickets, y la conexión y el tablero creados desde la interfaz:
  - Al pulsar la tarjeta PA-7 se abrió el panel a la derecha, con el tablero visible. La ficha, el título, la lista, el código, el panel de aviso, la tabla, el enlace, la mención y el adjunto insertado se vieron con su formato, y el `<script>` de la descripción, como texto.
  - Se vieron las subtareas, el enlace «bloquea», el adjunto con su tamaño y los dos comentarios, el más reciente primero y con «(editado)».
  - La subtarea PA-8 se abrió en el panel con su padre. «Atrás» volvió a PA-7 sin consultar Jira.
  - Esc cerró el panel, y entrar por `#/apps/jira/ticket/PA-9` lo abrió.
  - Jira recibió solo `GET` y un `POST /rest/api/3/search/jql`, y un único detalle por ticket. El registro dice «Detalle de ticket consultado: N comentarios», sin claves, resúmenes ni token.

### Pendiente

- Probar con el Jira Cloud real del usuario:
  - que el enlace de un adjunto se descarga con la sesión del navegador;
  - qué nodos ADF usan sus tickets, por si alguno se ve solo como texto.

### Desviaciones y decisiones

- **Marcas ADF de dentro afuera**: un texto con `link` y `strong`, en ese orden, queda como negrita que contiene el enlace. Se ve igual que al revés.
- **El panel cubre también las pestañas y la barra** de la parte derecha, no solo el tablero, para tener todo el alto. El tablero sigue usable a su izquierda.
- **Esc** se registra con `useAppShortcut` solo mientras el panel está montado, para no robar Esc al resto de la mini app.
