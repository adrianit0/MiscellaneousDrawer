# Sprint 18: Cliente y fechas en las tarjetas de «Tableros Jira»

## Objetivo

Que cada tarjeta de «Tableros Jira» diga quién pidió el ticket desde el portal y cuándo se creó y se actualizó. El campo del cliente es un campo personalizado de Jira y se elige en «Conexión» (ADR-0033).

El usuario lo pidió el 2026-11-27, antes de las métricas de flujo y los avisos de cambios, que pasan a los sprints 19 y 20.

## Requisitos cubiertos

- Tableros Jira: JR-08 y JR-28 (nuevos); JR-02, JR-03, JR-04, JR-20, JR-21, JR-31, JR-41, «API» y «Fuera de alcance» (cambiados).

Documentos: [requisitos/jira.md](../requisitos/jira.md), [ADR-0033](../decisiones/ADR-0033-cliente-y-fechas-en-las-tarjetas-de-tableros-jira.md) y el «Resultado» del [sprint 17](sprint-17.md).

## Tareas

1. **Especificación.** ADR-0033, los requisitos nuevos y cambiados, y este sprint.
2. **Servidor:**
   - `JiraConfig`: `customerField`, opcional, con su formato (JR-02 a JR-04).
   - `Jira.fields` y la ruta `GET /fields` (JR-08).
   - `Jira.search` pide el campo del cliente, y `Jira.Issue` lo lleva como texto (JR-21, JR-28). `JiraApp` lo devuelve como `customer` (JR-20).
3. **Interfaz:**
   - `Connection.tsx`: el selector «Campo del cliente» (JR-31).
   - `BoardView.tsx`: la tarjeta con el orden nuevo, el cliente y las dos fechas (JR-41).
4. **Pruebas:**
   - Backend, con `FakeJira`, que pasa a entender `GET /field` y a dar un campo del cliente:
     - el formato de `customerField` y que no cuenta como pendiente;
     - la lista de campos, solo los personalizados y en orden;
     - la consulta con y sin el campo;
     - cada tipo de valor de JR-28.
   - Interfaz:
     - el selector con la lista, sin conexión completa, con un error y con un valor que ya no está en Jira;
     - el orden de las líneas de la tarjeta, las líneas que faltan y el formato de las fechas.
5. **Documentación.** `CLAUDE.md`, si cambia algo de lo que resume.
6. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación recorridos con la aplicación arrancada, datos aislados y Jira simulado.

## Criterios de aceptación

- `./mvnw verify` termina en verde.
- En «Conexión» se elige el campo del cliente entre los campos personalizados de Jira, y se guarda.
- Cada tarjeta muestra, en este orden: la clave, el estado y el botón de Gestask; el resumen; el cliente; «Creado» y «Actualizado» con día y hora; la prioridad; y el asignado con su círculo.
- Un ticket sin cliente no tiene esa línea, y sin campo del cliente configurado ninguna tarjeta la tiene.
- La mini app sigue sin hacer ninguna petición a Jira que no sea `GET` o `POST /rest/api/3/search/jql`.

## Resultado

Fecha: 2026-11-27. Hecho en el código, probado con las pruebas y con la aplicación arrancada contra un Jira simulado. Todavía sin commits.

### Hecho

- **Especificación:**
  - ADR-0033, aceptada.
  - Requisitos nuevos: JR-08 (lista de campos) y JR-28 (texto del cliente).
  - Requisitos cambiados: JR-02, JR-03, JR-04, JR-20, JR-21, JR-31 y JR-41, y «API» y «Fuera de alcance» de `requisitos/jira.md`.
  - `README.md` y `CLAUDE.md`.
- **Servidor:**
  - `JiraConfig`: `customerField`, opcional, con el formato `customfield_<cifras>` (`CUSTOM_FIELD`).
  - `Jira.fields` y la ruta `GET /fields`.
  - `Jira.search` pide el campo del cliente si está configurado, y `Jira.customer` lo convierte en texto.
  - `JiraApp` devuelve `customer` en cada ticket.
- **Interfaz:**
  - `Connection.tsx`: el selector «Campo del cliente», en su propio grupo «Tarjetas».
  - `BoardView.tsx`: la tarjeta con el orden nuevo. `formatCardDate` da `DD/MM/AAAA HH:MM`.
- **Pruebas:** `./mvnw verify` en verde: 563 de backend, con las mismas 19 omitidas en Windows, y 490 de interfaz.
  - Backend: 3 pruebas nuevas en `JiraAppTest`. `FakeJira` entiende `GET /field` y devuelve el campo del cliente que se le pide.
  - Interfaz: 7 pruebas nuevas en `jiraApp.test.tsx`. Cambian las que comprobaban el cuerpo de `PUT /config` y que la prioridad era la última línea.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados y un Jira simulado de 3 tickets:
  - Con la conexión guardada, el selector mostró «Ninguno», «Área», «Cliente Portal» y «Sprint», con sus identificadores y ordenados sin tener en cuenta los acentos. Se eligió «Cliente Portal» y se guardó en `config.json`.
  - En el tablero, PA-1 mostró el cliente de un campo de tipo persona, y PA-2, el de un campo de texto. PA-3 no tiene cliente y no mostró esa línea.
  - Las tarjetas mostraron «Creado» y «Actualizado» con día y hora. La prioridad salió en su color, y el asignado con su círculo en la última línea.
  - Jira recibió solo `GET` y un `POST /rest/api/3/search/jql`, que incluía `customfield_10050` en `fields`. El registro dice «Tablero 1 consultado: 3 tickets», sin datos de los tickets.

### Pendiente

- Probar con el Jira Cloud real del usuario: que «Cliente Portal» está en la lista y que la tarjeta muestra el nombre del cliente. Si el campo es de un tipo que JR-28 no cubre, la línea no saldrá y habrá que ampliar JR-28.
