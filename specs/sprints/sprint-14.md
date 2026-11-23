# Sprint 14: Colores y prioridades en «Tableros Jira»

## Objetivo

Dar color al tablero de «Tableros Jira»: el color de cada estado elegido por el usuario, un círculo con las iniciales y el color de cada asignado, y la prioridad de cada ticket, con las prioridades y sus colores configurados en cada tablero (ADR-0028).

## Requisitos cubiertos

- Tableros Jira: JR-17, JR-18, JR-19, JR-37 y JR-45 (nuevos); JR-14, JR-20, JR-21, JR-33 y JR-41 (cambiados).

Documentos: [requisitos/jira.md](../requisitos/jira.md), [ADR-0028](../decisiones/ADR-0028-colores-y-prioridades-en-tableros-jira.md), y el «Resultado» del [sprint 13](sprint-13.md).

## Tareas

1. **Especificación.** Los requisitos JR nuevos y cambiados, ADR-0028 y este sprint.
2. **Servidor**, paquete `dev.cajonsastre.apps.jira`:
   - `Board`: el color de cada estado y las prioridades, con la validación de JR-14, JR-17 y JR-18; una definición guardada sin colores sigue valiendo.
   - `Jira`: las prioridades (`priority/search`, paginada) y el campo `priority` de cada ticket.
   - `JiraApp`: la ruta `/priorities`, y `statusColor` y `priority` en cada ticket.
3. **Interfaz**, `frontend/src/apps/jira/`:
   - Editor: el selector «Color» de cada estado y la sección «Prioridades».
   - Tarjeta: la etiqueta del estado, el círculo del asignado y la línea de la prioridad.
4. **Pruebas.**
   - Backend: la validación de colores y prioridades, el tablero antiguo sin colores, las prioridades de Jira y su paginación, el campo `priority` en la búsqueda y `statusColor` y `priority` en la respuesta.
   - Interfaz: la tarjeta del ejemplo de ADR-0028, las iniciales, los colores distintos de dos personas, la prioridad sin configurar en gris, el color inicial de un estado y de una prioridad, y el contraste de la paleta y de los tonos.
5. **Documentación.** `README.md`.
6. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada, datos aislados y un Jira simulado con prioridades.

## Criterios de aceptación

- `./mvnw verify` termina en verde.
- En el editor se elige el color de cada estado, y la tarjeta muestra el estado como una etiqueta de ese color.
- En el editor se añaden prioridades de Jira con su color, por tablero; la tarjeta muestra `⌃` y el nombre de la prioridad en su color, o en gris si el tablero no la tiene.
- Cada tarjeta muestra a la derecha de la línea del asignado un círculo con sus iniciales; dos personas del tablero tienen colores distintos, y la misma persona el mismo en todas sus tarjetas.
- Un tablero guardado en el sprint 13 se abre y se ve con sus estados en gris.
- La mini app sigue sin hacer ninguna petición a Jira que no sea `GET` o `POST /rest/api/3/search/jql`.

## Resultado

Fecha: 2026-11-23. Hecho en el código y probado en las pruebas y con la aplicación arrancada, con un Jira simulado. Sin commits todavía.

### Hecho

- **Especificación:** JR-17, JR-18, JR-19, JR-37 y JR-45 nuevos; JR-14, JR-20, JR-21, JR-33, JR-41, «Datos», «API» y «Fuera de alcance» cambiados; ADR-0028 aceptada; `README.md`.
- **Servidor:** `Board` guarda el color de cada estado y las prioridades con su color, valida la paleta y lee los tableros sin colores como gris y sin prioridades; `Jira.priorities` (paginada) y el campo `priority` en la búsqueda; ruta `GET /priorities`; cada ticket lleva `statusColor` y `priority` con el color del tablero o `null`.
- **Interfaz:** selector «Color» por estado (con el color inicial por categoría) y sección «Prioridades» en el editor (rojo, naranja, dorado… por orden; marca las que Jira ya no tiene). La tarjeta muestra el estado como etiqueta de su color, el círculo del asignado con sus iniciales y su tono, y `⌃` con la prioridad en su color o en gris. Los colores van en `data-paint` para no chocar con `data-color` del shell.
- **Pruebas:** `./mvnw verify` en verde, con 538 de backend (19 omitidas en Windows, las mismas de antes) y 419 de interfaz.
  - Backend nuevas: 5 en `JiraAppTest` (23 en total); `FakeJira` sirve las prioridades y la de cada ticket.
  - Interfaz nuevas: 9 en `jiraApp.test.tsx` (24 en total), con el contraste AA del texto oscuro sobre los ocho colores y los 18 tonos.
- **Recorrido con la aplicación arrancada** en Windows, con los datos aislados del sprint 13 y el Jira simulado con cuatro prioridades: el tablero guardado en el sprint 13 se abrió con sus estados y sus prioridades en gris. En el editor se pusieron colores a los estados y se añadieron tres prioridades, que tomaron rojo, naranja y dorado. El tablero mostró las etiquetas en su color, un círculo de distinto color para cada una de las tres personas y la prioridad no configurada («Trivial») en gris. Jira solo recibió `GET` (estados y `priority/search`) y `POST /rest/api/3/search/jql`; el token no aparece en el registro.

### Pendiente

- Probar con el Jira Cloud real del usuario, también lo pendiente del sprint 13. En particular, `priority/search` con sus prioridades.

### Desviaciones y decisiones

- **`data-paint` en lugar de `data-color`** para los colores de la paleta: el tema del shell ya colorea el texto de `[data-color]` y cambiaría el de las etiquetas.
- **Prueba de tableros antiguos con `Board.from`**: se comprueba sobre la definición tal como la guardaba el sprint 13, porque guardar por la API ya escribe los colores.
