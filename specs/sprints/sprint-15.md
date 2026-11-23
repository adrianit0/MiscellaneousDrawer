# Sprint 15: Caché, pestañas y filtros guardados en «Tableros Jira»

## Objetivo

Que «Tableros Jira» no vuelva a consultar al volver a un tablero, que los tableros se elijan con pestañas, y que haya filtros guardados, comunes a todos los tableros, en una línea bajo las pestañas. Además, la prioridad pierde el `⌃` (ADR-0029).

## Requisitos cubiertos

- Tableros Jira: JR-26, JR-27 y JR-46 a JR-49 (nuevos); JR-20, JR-21, JR-30, JR-40, JR-41 y JR-43 (cambiados).

Documentos: [requisitos/jira.md](../requisitos/jira.md), [ADR-0029](../decisiones/ADR-0029-cache-pestanas-y-filtros-en-tableros-jira.md), y el «Resultado» del [sprint 14](sprint-14.md).

## Tareas

1. **Especificación.** Los requisitos JR nuevos y cambiados, ADR-0029 y este sprint.
2. **Servidor**, paquete `dev.cajonsastre.apps.jira`:
   - `Filter`, `Filters` y `FilterMapper`: los filtros con la validación de JR-27, en la tabla `filter` (`V002__filters.sql`).
   - `JiraApp`: las rutas `/filters` y el campo `created` de cada ticket.
   - `Jira`: el campo `created` en la búsqueda.
3. **Interfaz**, `frontend/src/apps/jira/`:
   - La caché por tablero en la memoria de la mini app.
   - Las pestañas de tableros y la línea de filtros.
   - La sección «Filtros», con su lista y su editor.
   - La prioridad sin icono.
4. **Pruebas.**
   - Backend: crear, listar, sustituir y borrar filtros; su validación y el límite; el campo `created` en la búsqueda y en la respuesta.
   - Interfaz:
     - La caché: volver a un tablero, a la sección o a la mini app no consulta; «Actualizar» y un cambio en el editor sí.
     - Las pestañas.
     - Cada criterio de JR-49.
     - La línea de filtros con su filtro activo recordado.
     - El editor de filtros.
5. **Documentación.** `README.md`.
6. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación recorridos con la aplicación arrancada, datos aislados y el Jira simulado.

## Criterios de aceptación

- `./mvnw verify` termina en verde.
- Los tableros salen como pestañas en una línea. Al volver a un tablero ya visto, o a la mini app después de usar otra, se ve lo de antes con su hora y Jira no recibe ninguna consulta; «Actualizar» sí consulta.
- En «Filtros» se crea un filtro con estados, prioridades, asignados, antigüedad y fechas, y aparece en la línea bajo las pestañas. Al pulsarlo se ocultan los tickets que no lo cumplen en cualquier tablero, sin consultar Jira.
- La prioridad se ve solo con su nombre en su color.
- La mini app sigue sin hacer ninguna petición a Jira que no sea `GET` o `POST /rest/api/3/search/jql`.

## Resultado

Fecha: 2026-11-23. Hecho en el código, probado con las pruebas y con la aplicación arrancada contra un Jira simulado. Todavía sin commits.

### Hecho

- **Especificación:**
  - Requisitos nuevos: JR-26, JR-27 y JR-46 a JR-49.
  - Requisitos cambiados: JR-20, JR-21, JR-30, JR-40, JR-41 y JR-43, además de «Datos», «API» y «Fuera de alcance».
  - ADR-0029, aceptada.
  - `README.md`.
- **Servidor:**
  - `Filter`, `Filters` y `FilterMapper`, con la validación de JR-27, el límite de 30 filtros y la tabla `saved_filter` (`V002__filters.sql`).
  - Rutas `GET/POST /filters` y `PUT/DELETE /filters/{id}`.
  - Campo `created` en la búsqueda y en cada ticket.
- **Interfaz:**
  - `issueCache.ts`: la caché por tablero, que vale mientras no cambie la configuración con la que se consultó.
  - Pestañas de tableros y línea de filtros en `BoardView`.
  - `filters.ts`: cómo se aplican los criterios (JR-49) y el resumen de la lista.
  - `FiltersSection`: la lista y el editor de filtros.
  - La prioridad, sin `⌃`.
- **Pruebas:** `./mvnw verify` en verde: 541 de backend, con las mismas 19 omitidas en Windows, y 429 de interfaz.
  - Backend: 3 pruebas nuevas en `JiraAppTest` (26 en total). `FakeJira` devuelve `created`.
  - Interfaz: 10 pruebas nuevas en `jiraApp.test.tsx` (34 en total), cubriendo:
    - las pestañas;
    - la caché al cambiar de tablero, de sección y de visibilidad, y al editar el tablero;
    - cada criterio de JR-49, incluidos los límites de días y de fechas;
    - la línea de filtros y el filtro activo recordado;
    - el editor: crear, editar con un error y borrar.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados y el Jira simulado con fechas de creación:
  - Pestañas y caché:
    - Los dos tableros se ven como pestañas.
    - Abrir «Solo PROJB» hizo una consulta; volver a «Equipo», a «Filtros» o a la mini app no hizo ninguna.
  - Filtros:
    - En «Filtros» se creó «Viejos sin Marta», con asignados «No es ninguno de» Marta y antigüedad de más de 29 días. Al activarlo, «Equipo» mostró justo los cuatro tickets esperados, y «Solo PROJB» los suyos.
    - Tras reiniciar la aplicación, el filtro seguía guardado.
  - Peticiones:
    - En todo el recorrido Jira recibió 3 búsquedas, todas `GET` o `POST /rest/api/3/search/jql`.
    - El token no aparece en el registro.

### Pendiente

- Probar con el Jira Cloud real del usuario, como en los sprints 13 y 14.

### Desviaciones y decisiones

- **Tabla `saved_filter` en lugar de `filter`**: `FILTER` es palabra reservada de SQLite.
- **Retoque visual del editor de filtros** tras verlo arrancado: las condiciones y los campos van en filas sin recuadro (`.row`), y los selectores de condición no ocupan todo el ancho.
