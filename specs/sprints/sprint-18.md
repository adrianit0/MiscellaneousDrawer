# Sprint 18: Cliente, fechas y tipo en las tarjetas de «Tableros Jira»

## Objetivo

Que cada tarjeta de «Tableros Jira» diga quién pidió el ticket desde el portal y cuándo se creó y se actualizó. El campo del cliente es un campo personalizado de Jira y se elige en «Conexión» (ADR-0033).

Además, que cada tarjeta lleve el icono de su tipo (tarea, bug, historia, épica o uno personalizado): el de Jira, que descarga el servidor, o uno propio si no llega (ADR-0034). El usuario lo añadió al sprint el mismo día, después del commit de la primera parte (`0375c04`).

El usuario lo pidió el 2026-11-27, antes de las métricas de flujo y los avisos de cambios, que pasan a los sprints 19 y 20.

## Requisitos cubiertos

- Tableros Jira: JR-08, JR-28, JR-29 y JR-38 (nuevos); JR-02, JR-03, JR-04, JR-05, JR-20, JR-21, JR-24, JR-31, JR-41, «Datos», «API» y «Fuera de alcance» (cambiados).

Documentos: [requisitos/jira.md](../requisitos/jira.md), [ADR-0033](../decisiones/ADR-0033-cliente-y-fechas-en-las-tarjetas-de-tableros-jira.md), [ADR-0034](../decisiones/ADR-0034-icono-del-tipo-en-las-tarjetas-de-tableros-jira.md) y el «Resultado» del [sprint 17](sprint-17.md).

## Tareas

1. **Especificación.** ADR-0033, ADR-0034, los requisitos nuevos y cambiados, y este sprint.
2. **Servidor:**
   - `JiraConfig`: `customerField`, opcional, con su formato (JR-02 a JR-04).
   - `Jira.fields` y la ruta `GET /fields` (JR-08).
   - `Jira.search` pide el campo del cliente, y `Jira.Issue` lo lleva como texto (JR-21, JR-28). `JiraApp` lo devuelve como `customer` (JR-20).
   - El tipo de cada ticket con la consulta (JR-20, JR-21).
   - `Transport.fetch` para las respuestas binarias, y la ruta `GET /issue-types/{id}/icon` con su caché (JR-29).
3. **Interfaz:**
   - `Connection.tsx`: el selector «Campo del cliente» (JR-31).
   - `BoardView.tsx`: la tarjeta con el orden nuevo, el cliente y las dos fechas (JR-41).
   - `TypeIcon.tsx`: el icono del tipo, el de Jira o el propio (JR-38).
4. **Pruebas:**
   - Backend, con `FakeJira`, que pasa a entender `GET /field` y a dar un campo del cliente:
     - el formato de `customerField` y que no cuenta como pendiente;
     - la lista de campos, solo los personalizados y en orden;
     - la consulta con y sin el campo;
     - cada tipo de valor de JR-28;
     - el tipo en los tickets y el icono: PNG, SVG, de otro sitio, demasiado grande, de otro tipo MIME, con redirección, sin contacto y la caché.
   - Interfaz:
     - el selector con la lista, sin conexión completa, con un error y con un valor que ya no está en Jira;
     - el orden de las líneas de la tarjeta, las líneas que faltan y el formato de las fechas;
     - el icono de Jira, cada icono propio y un único pedido por tipo.
5. **Documentación.** `CLAUDE.md`, si cambia algo de lo que resume.
6. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación recorridos con la aplicación arrancada, datos aislados y Jira simulado.

## Criterios de aceptación

- `./mvnw verify` termina en verde.
- En «Conexión» se elige el campo del cliente entre los campos personalizados de Jira, y se guarda.
- Cada tarjeta muestra, en este orden: la clave, el estado y el botón de Gestask; el resumen; el cliente; «Creado» y «Actualizado» con día y hora; la prioridad; y el asignado con su círculo.
- Un ticket sin cliente no tiene esa línea, y sin campo del cliente configurado ninguna tarjeta la tiene.
- Cada tarjeta lleva a la izquierda de la clave el icono de su tipo que da Jira, o uno propio si no llega, con el nombre del tipo al pasar el ratón.
- La mini app sigue sin hacer ninguna petición a Jira que no sea `GET` o `POST /rest/api/3/search/jql`.

## Resultado

Fecha: 2026-11-27. Hecho en el código, probado con las pruebas y con la aplicación arrancada contra un Jira simulado. El cliente y las fechas están en el commit `0375c04`; el icono del tipo, todavía sin commit.

### Hecho

- **Especificación:**
  - ADR-0033 y ADR-0034, aceptadas.
  - Requisitos nuevos: JR-08 (lista de campos), JR-28 (texto del cliente), JR-29 (icono del tipo) y JR-38 (icono en la tarjeta).
  - Requisitos cambiados: JR-02, JR-03, JR-04, JR-05, JR-20, JR-21, JR-24, JR-31 y JR-41, y «Datos», «API» y «Fuera de alcance» de `requisitos/jira.md`.
  - `README.md` y `CLAUDE.md`.
- **Servidor:**
  - `JiraConfig`: `customerField`, opcional, con el formato `customfield_<cifras>` (`CUSTOM_FIELD`).
  - `Jira.fields` y la ruta `GET /fields`.
  - `Jira.search` pide el campo del cliente si está configurado, y `Jira.customer` lo convierte en texto.
  - `JiraApp` devuelve `customer` en cada ticket.
  - La consulta pide `issuetype`, y cada ticket trae `type` con su nivel (`Jira.IssueType`).
  - `Transport.fetch` para las respuestas binarias, que lee como mucho 64 KB más un byte.
  - `TypeIcons` y la ruta `GET /issue-types/{id}/icon`: el icono como `data:`, solo del sitio, de cinco tipos MIME y sin seguir redirecciones, guardado en memoria por sitio y tipo.
- **Interfaz:**
  - `Connection.tsx`: el selector «Campo del cliente», en su propio grupo «Tarjetas».
  - `BoardView.tsx`: la tarjeta con el orden nuevo. `formatCardDate` da `DD/MM/AAAA HH:MM`.
  - `typeIcons.tsx`: la caché de iconos por tipo (`useTypeIcons`) y `TypeIcon`, con los cinco iconos propios. `typeKind` elige el propio.
- **Pruebas:** `./mvnw verify` en verde: 567 de backend, con las mismas 19 omitidas en Windows, y 493 de interfaz.
  - Backend: 7 pruebas nuevas en `JiraAppTest`, 4 de ellas del tipo y su icono. `FakeJira` entiende `GET /field` y `GET /issuetype/{id}`, devuelve el campo del cliente y el tipo que se le piden, y simula las descargas binarias.
  - Interfaz: 10 pruebas nuevas en `jiraApp.test.tsx`, 3 de ellas del icono. Cambian las que comprobaban el cuerpo de `PUT /config`, que la prioridad era la última línea y la lista exacta de `fields`.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados y un Jira simulado de 3 tickets:
  - Con la conexión guardada, el selector mostró «Ninguno», «Área», «Cliente Portal» y «Sprint», con sus identificadores y ordenados sin tener en cuenta los acentos. Se eligió «Cliente Portal» y se guardó en `config.json`.
  - En el tablero, PA-1 mostró el cliente de un campo de tipo persona, y PA-2, el de un campo de texto. PA-3 no tiene cliente y no mostró esa línea.
  - Las tarjetas mostraron «Creado» y «Actualizado» con día y hora. La prioridad salió en su color, y el asignado con su círculo en la última línea.
  - Jira recibió solo `GET` y un `POST /rest/api/3/search/jql`, que incluía `customfield_10050` en `fields`. El registro dice «Tablero 1 consultado: 3 tickets», sin datos de los tickets.
- **Recorrido del icono del tipo**, con un Jira simulado de 5 tickets de 5 tipos:
  - «Bug» y «Tarea» se vieron con el icono de Jira: un SVG del avatar universal y un PNG de `/images/icons/`. El SVG traía un `<script>`, que no se ejecutó, y la consola no mostró ningún aviso de la política de contenido.
  - «Épica», con el icono en otro servidor, salió con el rayo propio, y el servidor no lo pidió. «Historia de usuario», cuyo icono redirige, salió con el marcador propio, y no se siguió la redirección. «Petición de soporte», sin icono, salió con la casilla propia.
  - Cada tipo se pidió una vez a Jira (`/issuetype/<id>`), y cada icono se descargó una vez.

### Pendiente

- Probar con el Jira Cloud real del usuario:
  - Que «Cliente Portal» está en la lista y que la tarjeta muestra el nombre del cliente. Si el campo es de un tipo que JR-28 no cubre, la línea no saldrá y habrá que ampliar JR-28.
  - Que los iconos de los tipos llegan sin redirigir a otro servidor. Si redirigen, se verán los iconos propios.
