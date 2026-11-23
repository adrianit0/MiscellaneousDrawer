# Sprint 13: Mini app «Tableros Jira»

## Objetivo

Recuperar el tablero que se perdió al pasar de Jira Server a Jira Cloud: tableros propios sobre varios proyectos a la vez, con columnas que define el usuario y, en cada una, los estados de cada proyecto que le corresponden. Solo lectura (ADR-0027).

## Requisitos cubiertos

- Tableros Jira: JR-01 a JR-44.
- Seguridad: S-15. Plataforma: P-02 (icono nuevo `board`).
- Constitución: principio 4 (sexto destino, de solo lectura).

Documentos: [requisitos/jira.md](../requisitos/jira.md), [ADR-0027](../decisiones/ADR-0027-mini-app-tableros-jira.md), [diseno/mini-apps.md](../diseno/mini-apps.md).

## Tareas

1. **Especificación.** Requisitos JR, principio 4, S-15, P-02, el modelo de datos, ADR-0027 aceptada y este sprint.
2. **Catálogo.** Icono `board.svg` y manifiesto de `jira` (`cyan`, `productivity`). `AppCatalogTest` y `AppManifestTest` se adaptan.
3. **Servidor**, paquete `dev.cajonsastre.apps.jira`:
   - `ConfigStore` y `JiraConfig` con la validación de JR-02 y el token oculto (JR-01 a JR-04).
   - `Transport` y `HttpTransport` (Basic, 20 s, sin redirecciones), y `Jira` con `myself`, proyectos, estados, búsqueda paginada y los errores de JR-07.
   - Base propia: `V001__initial.sql` (tablero, proyectos, columnas y estados) y su mapper; validación de JR-14.
   - `IssueQuery`: el JQL de JR-21 y el reparto en columnas de JR-22 y JR-23.
   - `JiraApp` y sus rutas.
4. **Interfaz**, `frontend/src/apps/jira/`: «Conexión», el editor de tableros con «Estados sin columna», y el tablero con columnas, tarjetas, «Agrupar por», el filtro y los estados de carga y error.
5. **Pruebas.**
   - Backend con `FakeJira`: la conexión y su validación, el token que no sale, los errores 401/403/404/429 y sin respuesta, la deduplicación de estados, el JQL con una o las dos partes y sin ninguna, la paginación y el tope de 1000, el reparto por par proyecto-estado, los estados que Jira ya no tiene y la validación de tableros.
   - Interfaz: el ejemplo de project0001 y project0002 en cuatro columnas, agrupar por proyecto y por asignado, «Sin asignar», el filtro, «Estados sin columna», cambios sin guardar, y los estados vacío, cargando y con error.
6. **Documentación.** `README.md` y `CLAUDE.md` (prefijo JR, Jira en el principio 4 y en la estructura).
7. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada, datos aislados y un Jira simulado; después, con el Jira Cloud real del usuario.

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- «Tableros Jira» aparece en el lanzador, en «Productividad».
- Con un Jira simulado con el ejemplo de ADR-0027, el tablero muestra To do, In progress, Testing y Closed con los tickets de los dos proyectos en su columna, cada uno con clave, resumen, asignado y estado.
- Un ticket cerrado hace más de 14 días no aparece en Closed.
- «Agrupar por» proyecto y por asignado reparte los tickets en filas.
- El token no aparece en ninguna respuesta, ni en el registro.
- La mini app no hace ninguna petición a Jira que no sea `GET` o `POST /rest/api/3/search/jql`.
- Ninguna prueba contacta con un servidor.

## Resultado

Fecha: 2026-11-23. Hecho en el código y probado en las pruebas y con la aplicación arrancada, con un Jira simulado. Sin commits todavía.

### Hecho

- **Especificación:** `requisitos/jira.md` (JR-01 a JR-44, con su sección «Datos»), el principio 4 (seis destinos), S-15, la arquitectura, ADR-0027 aceptada, `README.md` y `CLAUDE.md` (prefijo JR).
- **Catálogo:** icono `board`; `jira` («Tableros Jira», `cyan`, «Productividad») detrás de «Gestask».
- **Servidor** (`dev.cajonsastre.apps.jira`): `JiraConfig` y `ConfigStore` (sitio `https://<sitio>.atlassian.net`, email y token oculto), `Transport` y `HttpTransport` (autenticación básica, 20 s, sin redirecciones), `Jira` (usuario, proyectos, estados y búsqueda paginada con `nextPageToken`), `Board`, `Boards` y `BoardMapper` sobre la tabla `board` de su base, `IssueQuery` (el JQL y el reparto) y `JiraApp` con sus rutas.
- **Interfaz** (`frontend/src/apps/jira/`): «Conexión»; «Configurar tableros» con la lista, el editor (buscador de proyectos, columnas con «Subir», «Bajar» y «Quitar», estados por proyecto con su categoría, «Estados sin columna» y los que Jira ya no tiene) y la confirmación al salir con cambios sin guardar; «Tableros» con el selector, «Agrupar por», el filtro, las tarjetas y los avisos.
- **Pruebas:** `./mvnw verify` en verde, con 533 de backend (19 omitidas en Windows, las mismas de antes) y 410 de interfaz.
  - Backend nuevas: 18 en `JiraAppTest` con `FakeJira`, que evalúa el JQL. Adaptada `AppCatalogTest`.
  - Interfaz nuevas: 15 en `jiraApp.test.tsx`.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados y un Jira simulado en `http://127.0.0.1:8089` (un script fuera del repositorio con dos proyectos inventados): sin conexión abre en «Conexión»; guardada, «Probar conexión» dice «Conexión correcta como Persona Inventada». Se creó desde el editor el tablero del ejemplo de ADR-0027 (To do, In progress, Testing y Closed, con «testing» de los dos proyectos en Testing); «Estados sin columna» mostró «rejected». El tablero repartió los ocho tickets esperados; no salieron ni el cerrado hace 15 días ni el rechazado. «Agrupar por» asignado dio cuatro filas con «Sin asignar» la última. El lanzador muestra «Tableros Jira» en «Productividad». Jira solo recibió `GET` y un `POST /rest/api/3/search/jql`; el token no aparece en `GET /config` ni en el registro.

### Pendiente

- Probar con el Jira Cloud real del usuario: el token clásico con autenticación básica, los estados de sus proyectos (gestionados por la empresa o por el equipo) y el JQL por identificador de estado.

### Desviaciones y decisiones

- **El JQL va por proyecto** (`(project = "A" AND (…)) OR (project = "B" AND (…))`) y no con un `project in (…)` común, como decía la primera versión de JR-21: un mismo identificador de estado puede estar en dos proyectos y en columnas distintas, y con la consulta común un ticket cerrado y antiguo de un proyecto entraría por la parte abierta del otro. Se corrigió JR-21 antes del código.
- **Cada consulta pide también los estados de cada proyecto** (JR-20): así los estados que Jira ya no tiene se avisan y no entran en el JQL, donde Jira respondería con un error.
- **Crear el tablero 21.º responde 409 `too_many_boards`** (JR-13).
- **Una columna nueva se añade antes de la final**, que sigue siendo la de cerrados.
