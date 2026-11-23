# ADR-0027: Mini app «Tableros Jira» y Jira Cloud como destino

- Estado: aceptada (2026-11-23)
- Requisitos: JR-01 a JR-44 (nuevos), S-15, P-02 (icono nuevo `board`), constitución (principio 4)
- Modifica: constitución (principio 4), que añade a la lista de destinos el sitio de Jira Cloud configurado, solo para leer; S-15. No cambia la plataforma ni las otras mini apps

## Contexto

La empresa del usuario ha pasado de Jira Server a Jira Cloud (`<empresa>.atlassian.net`). En la migración se perdió el tablero que usaba para seguir a la vez varios proyectos cuyos flujos tienen estados distintos. A cambio, ahora puede crear un token de API y consultar Jira desde fuera.

Pidió un tablero propio que, con su token, junte varios proyectos y reparta sus estados en columnas que define él. Su ejemplo:

| Columna | Estados |
|---|---|
| To do | start (project0001), created (project0002), analized (project0002) |
| In progress | doing (project0001), inprogress (project0002) |
| Testing | testing (project0001 y project0002) |
| Closed | finished (project0001), closed (project0002) |

De cada ticket quiere ver el número, el nombre, el asignado y el estado.

## Decisión

El usuario respondió a cuatro preguntas (2026-11-23):

1. **Mini app de Cajón de sastre, de solo lectura.** Autoriza el sitio de Jira Cloud que configure como destino nuevo, solo para consultar proyectos, estados y tickets. La mini app no cambia nada en Jira.
2. **Tickets abiertos y cerrados recientes.** Todos los que están en una columna que no es la última, y los de la última solo si cambiaron en los últimos 14 días, para que el tablero no crezca sin fin.
3. **Las filas se eligen en el tablero**: sin agrupar, por proyecto o por asignado.
4. **Varios tableros con nombre**, cada uno con sus proyectos, sus columnas y sus estados.

Diseño, presentado con el plan del sprint 13 y aprobado por el usuario (2026-11-23):

- **Identidad**: `jira`, «Tableros Jira», «Tus columnas sobre los estados de varios proyectos de Jira Cloud», icono nuevo `board`, color `cyan` y categoría `productivity`.
- **La conexión es configuración**, como en «Reenviar PR»: URL del sitio, email y token de API en un fichero privado de la carpeta de configuración. El token no vuelve a la interfaz.
- **Token clásico con autenticación básica** (`email:token`) contra `https://<sitio>.atlassian.net`. Los tokens con ámbitos exigen llamar a `api.atlassian.com`, que sería otro destino; quedan fuera.
- **Los tableros son datos del usuario** y van en la base propia de la mini app, con sus migraciones y su copia previa (principio 7).
- **Un estado se asigna por proyecto.** En Jira Cloud cada proyecto gestionado por el equipo tiene sus propios estados, aunque se llamen igual; por eso una columna guarda pares proyecto-estado por identificador, no nombres. Un estado de un proyecto está como mucho en una columna.
- **Un estado sin columna no se muestra.** La configuración del tablero lista los estados de sus proyectos que no están en ninguna columna, para que no se pierda ninguno sin querer.
- **La última columna es la de cerrados**: sus tickets solo aparecen si se actualizaron en los últimos 14 días.
- **Una sola consulta por tablero**, con el JQL que arma el servidor a partir de la configuración: el usuario no escribe JQL. Como mucho 1000 tickets por tablero, los más recientes, y el tablero lo dice si hay más.
- **Se actualiza al abrir el tablero, al cambiar de tablero y con «Actualizar».** Sin sondeo periódico, para no gastar el límite de peticiones de Jira.
- **El ticket enlaza a `<sitio>/browse/<clave>`**, que se abre en el Chrome habitual (ADR-0021).

## Alternativas descartadas

- **Mover tickets de columna desde el tablero.** Exige escribir en Jira y elegir la transición de cada flujo. El usuario prefirió solo lectura.
- **Usar los tableros de Jira Software.** Un tablero de Jira asigna columnas por estado global y no permite que el mismo nombre de estado de dos proyectos acabe en columnas distintas de forma sencilla; además, es lo que se perdió en la migración.
- **Una página suelta en el navegador.** Jira Cloud no permite llamadas desde otro origen (CORS) y el token quedaría en la página.
- **JQL escrito por el usuario.** Más flexible, pero el usuario eligió el criterio de abiertos y cerrados recientes.
- **Agrupar por categoría de estado de Jira** (Por hacer, En curso, Hecho). No respeta las columnas del usuario.

## Consecuencias

- **Sexto destino autorizado, de solo lectura.** La mini app envía a Jira el token, las claves de proyecto y los identificadores de estado de la consulta; no envía tickets ni otros datos del usuario.
- **El token da acceso a Jira** con los permisos de la cuenta del usuario. Se guarda en un fichero privado (S-20) y no aparece en el registro (S-21).
- **Los tokens clásicos caducan** (Atlassian los limita a un año). Al caducar, la mini app dice «El email o el token no son válidos» y hay que crear otro.
- **Si un estado se borra o se renombra en Jira**, la columna conserva su identificador; renombrado se ve con el nombre nuevo, y borrado deja de mostrarse y la configuración lo marca como inexistente.
- **Código repetido**: un `Transport` HTTP por tercera vez (P-18).
- **Las pruebas no contactan con ningún servidor**: la API de Jira se prueba con un Jira simulado.
