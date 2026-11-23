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

Pendiente.
