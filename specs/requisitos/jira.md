# Requisitos de «Tableros Jira»

La mini app «Tableros Jira» (`jira`) muestra tableros propios sobre varios proyectos de Jira Cloud a la vez. Cada tablero tiene sus columnas, y en cada columna el usuario pone los estados de cada proyecto que le corresponden, aunque los proyectos tengan flujos distintos. Solo lee de Jira: no cambia nada. Las decisiones están en [ADR-0027](../decisiones/ADR-0027-mini-app-tableros-jira.md).

La conexión (sitio, email y token) se escribe en la mini app: no está en el código ni en el repositorio (S-30, S-32). Los ejemplos usan marcadores. Prefijo de requisitos: **JR**.

Términos:

- **Sitio**: la URL de Jira Cloud de la empresa, `https://<sitio>.atlassian.net`.
- **Estado**: un estado de Jira de un proyecto concreto, por su identificador. Dos proyectos pueden tener estados con el mismo nombre y distinto identificador.
- **Tablero**: un nombre, sus proyectos, sus columnas en orden y, en cada columna, sus estados.
- **Columna final**: la última columna del tablero, la de los tickets cerrados.

## Conexión

| ID | Requisito |
|---|---|
| JR-01 | La conexión se guarda en `<config>/apps/jira/config.json` (P-09), con permisos 600 (S-20) y sustituyendo el fichero de golpe. Nace vacía. Un fichero que no se puede leer o no cumple JR-02 se trata como si no existiera, sin registrar su contenido (S-21). |
| JR-02 | Al guardar se valida el formato de cada valor escrito (tabla siguiente); un campo vacío no se comprueba, para poder guardar a medias. Un valor incorrecto impide guardar e indica el campo: 400 `invalid_config` con `details.field`. Guardar no contacta con Jira. |
| JR-03 | El token no sale nunca del servidor: `GET /config` devuelve `tokenSet` en su lugar. Al guardar, un token que no viene o es `null` conserva el guardado, y la cadena vacía lo borra. Ni el token ni la cabecera que lo lleva aparecen en el registro (S-21). |
| JR-04 | `GET /config` devuelve en `missing` los campos que siguen vacíos. Mientras falte alguno, lo que contacta con Jira responde 409 `not_configured` con `details.missing`, sin contactar con ningún servidor. |
| JR-05 | Cada llamada a Jira va a `<sitio>/rest/api/3/…` con `Authorization: Basic <base64(email:token)>` y `Accept: application/json`, y espera la respuesta 20 s como mucho. No se sigue ninguna redirección a otro host. |
| JR-06 | «Probar conexión» (`POST /connection/test`) pide `GET <sitio>/rest/api/3/myself` y responde `{"ok": true, "user": "<nombre visible>"}` o el error de JR-07. |
| JR-07 | Un error de Jira se responde como 502 `jira_error` con un mensaje para el usuario: «El email o el token no son válidos» (401), «Tu cuenta no tiene permiso para ver esto» (403), «No existe en Jira» (404), «Jira limita las peticiones: prueba de nuevo en un minuto» (429) o el primer `errorMessages[]` de la respuesta; y como 502 `jira_unreachable` con «No hay contacto con Jira» si no hay respuesta. |

| Campo | Clave | Formato |
|---|---|---|
| Sitio | `siteUrl` | `https://<sitio>.atlassian.net`, con `<sitio>` de 1 a 63 letras, números o `-`, sin ruta, usuario, parámetros ni fragmento; `http://localhost:<puerto>` y `http://127.0.0.1:<puerto>` solo para pruebas. La barra final se quita |
| Email | `email` | El email de la cuenta de Atlassian: hasta 254 caracteres, con una `@` y sin espacios |
| Token | `token` | Un token de API clásico de Atlassian: 1 a 500 caracteres visibles, sin espacios |

## Proyectos y estados

| ID | Requisito |
|---|---|
| JR-10 | `GET /projects?query=<texto>` pide `GET <sitio>/rest/api/3/project/search?query=<texto>&orderBy=key&maxResults=50&startAt=<n>`, hasta 200 proyectos, y devuelve de cada uno su clave (`key`) y su nombre (`name`). |
| JR-11 | `GET /projects/<clave>/statuses` pide `GET <sitio>/rest/api/3/project/<clave>/statuses` y devuelve los estados del proyecto, sin repetir los que comparten sus tipos de incidencia: identificador (`id`), nombre (`name`) y categoría de Jira (`category`: `new`, `indeterminate` o `done`). Una clave que no cumple JR-12 responde 400 sin contactar con Jira. |
| JR-12 | Una clave de proyecto empieza por una letra mayúscula y sigue con mayúsculas, números o `_`, de 2 a 20 caracteres. Un identificador de estado son de 1 a 18 cifras. Así ningún valor guardado puede cambiar el JQL de JR-21. |

## Tableros

| ID | Requisito |
|---|---|
| JR-13 | Los tableros se guardan en la base de la mini app (P-08). Puede haber de 1 a 20; la mini app nace sin ninguno. |
| JR-14 | Un tablero tiene un nombre de 1 a 60 caracteres sin repetir (sin distinguir mayúsculas), de 1 a 10 proyectos distintos y de 1 a 12 columnas. Cada columna tiene un nombre de 1 a 40 caracteres sin repetir en el tablero y de 0 a 100 estados. Cada estado es un par proyecto-identificador (JR-12) de un proyecto del tablero, y un mismo par está como mucho en una columna. Guardar algo que no cumple esto responde 400 `invalid_board` con `details.field`. |
| JR-15 | Guardar un tablero no contacta con Jira: se guarda lo que manda la interfaz, con el nombre de cada estado tal como lo vio para mostrarlo si Jira deja de tenerlo. Quitar un proyecto del tablero quita sus estados de las columnas. |
| JR-16 | Borrar un tablero pide confirmación en la interfaz y no se puede deshacer. El orden de los tableros es el de creación. |

## Tickets

| ID | Requisito |
|---|---|
| JR-20 | `GET /boards/<id>/issues` consulta Jira y devuelve el tablero con sus columnas en orden y, en cada una, sus tickets, del actualizado más recientemente al más antiguo. De cada ticket: clave (`key`), resumen (`summary`), proyecto (`project`), estado (`status`, el nombre actual en Jira), asignado (`assignee`, su nombre visible, o `null`) y fecha de actualización (`updated`). Responde también la fecha de la consulta (`fetchedAt`), si hay más tickets de los devueltos (`truncated`) y los estados guardados que Jira ya no devuelve (`missingStatuses`). |
| JR-21 | La consulta es `POST <sitio>/rest/api/3/search/jql` con `fields: ["summary", "status", "assignee", "project", "updated"]`, `maxResults: 100`, siguiendo `nextPageToken`, y este JQL armado por el servidor solo con los valores de JR-12: `project in (<claves>) AND (status in (<estados de las demás columnas>) OR (status in (<estados de la columna final>) AND updated >= -14d)) ORDER BY updated DESC`. Si una de las dos listas está vacía, su parte no se incluye; si las dos lo están, no se consulta y el tablero sale vacío. |
| JR-22 | Un ticket se coloca en la columna que tiene el par de su proyecto y su estado. Un ticket cuyo par no está en ninguna columna no se muestra (puede llegar si dos proyectos comparten un estado y solo uno lo tiene asignado). |
| JR-23 | Como mucho se leen 1000 tickets por tablero. Si Jira tiene más, se devuelven los 1000 más recientes con `truncated: true`. |
| JR-24 | Las consultas son solo de lectura: la mini app solo usa `GET` y `POST /rest/api/3/search/jql`, que no cambia nada en Jira (constitución, principio 4; ADR-0027). |
| JR-25 | En el registro del shell solo quedan el número del tablero, el número de tickets y los errores con su código; ni el token, ni el sitio, ni el JQL, ni datos de los tickets (S-21). |

## Interfaz

| ID | Requisito |
|---|---|
| JR-30 | La mini app tiene tres secciones: «Tableros», «Configurar tableros» y «Conexión». Mientras falte algún campo de la conexión abre en «Conexión» y lo dice; con la conexión completa y sin tableros, abre en «Configurar tableros» con «Crea tu primer tablero». |
| JR-31 | «Conexión» muestra los campos de JR-02, «Guardar» y «Probar conexión», y explica dónde se crea el token (`id.atlassian.com`, «Tokens de API»). El token no se muestra nunca: si hay uno guardado, el campo lo dice y dejarlo vacío lo conserva. Un error de formato se muestra junto a su campo. |
| JR-32 | «Configurar tableros» lista los tableros con «Nuevo tablero», «Editar» y «Borrar». El editor tiene el nombre, los proyectos (con un buscador sobre JR-10) y las columnas, que se añaden, se renombran, se reordenan con «Subir» y «Bajar» y se quitan. |
| JR-33 | En el editor, cada columna muestra sus estados agrupados por proyecto con su categoría de Jira; se añaden eligiendo de los estados de los proyectos del tablero (JR-11) que no están en otra columna, y se quitan. Un estado puede estar en varios proyectos con el mismo nombre: se elige por proyecto. |
| JR-34 | El editor muestra aparte «Estados sin columna»: los de los proyectos del tablero que no están en ninguna. Sus tickets no se verán en el tablero. También marca los estados guardados que Jira ya no tiene. |
| JR-35 | El editor dice que la última columna es la de cerrados y que solo muestra los tickets actualizados en los últimos 14 días. |
| JR-36 | Salir del editor con cambios sin guardar pide confirmación, como en «Base de datos» (BD-67, ADR-0015). |
| JR-40 | «Tableros» muestra un selector con los tableros y el elegido, que se recuerda (`useAppState`). Lo consulta (JR-20) al abrirse, al cambiar de tablero y al pulsar «Actualizar», y muestra la hora de la última consulta. Oculta, no consulta (N-05). |
| JR-41 | Cada columna muestra su nombre y su número de tickets. Cada ticket es una tarjeta con la clave, el resumen, el asignado («Sin asignar» si no tiene) y el estado de Jira. La clave enlaza a `<sitio>/browse/<clave>`, que se abre en el Chrome habitual (C-16). |
| JR-42 | Un selector «Agrupar por» con «Nada», «Proyecto» y «Asignado» reparte los tickets en filas horizontales con las mismas columnas; cada fila dice su nombre y su número de tickets. «Sin asignar» va la última. La elección se recuerda por tablero (`useAppState`). |
| JR-43 | Un filtro de texto oculta los tickets cuya clave, resumen o asignado no contienen el texto, sin distinguir mayúsculas ni acentos, sin volver a consultar Jira. |
| JR-44 | Mientras consulta se ve que está cargando y se conserva lo anterior. Un error se muestra con su mensaje (JR-07) y «Reintentar». Con `truncated` dice «Se muestran los 1000 tickets más recientes». Con `missingStatuses` dice qué estados ya no existen en Jira y lleva al editor. |

## API

Todas las rutas cuelgan de `/api/apps/jira` (P-06) y siguen A-01 a A-03.

| Método | Ruta | Descripción |
|---|---|---|
| GET | /config | La conexión sin el token, con `tokenSet` y `missing` (JR-01 a JR-04) |
| PUT | /config | Guarda la conexión. 400 `invalid_config` |
| POST | /connection/test | Prueba la conexión (JR-06). 409 `not_configured`, 502 `jira_error` o `jira_unreachable` |
| GET | /projects?query= | Proyectos de Jira (JR-10). 409, 502 |
| GET | /projects/{key}/statuses | Estados de un proyecto (JR-11). 400, 409, 502 |
| GET | /boards | `{"boards": […]}`: los tableros con su configuración (JR-13) |
| POST | /boards | Crea un tablero. 201; 400 `invalid_board` |
| PUT | /boards/{id} | Sustituye un tablero. 400 `invalid_board`, 404 `not_found` |
| DELETE | /boards/{id} | Borra un tablero. 204; 404 `not_found` |
| GET | /boards/{id}/issues | Los tickets del tablero por columna (JR-20 a JR-23). 404, 409, 502 |

## Fuera de alcance

- Cambiar nada en Jira: mover tickets, transiciones, asignar, comentar o crear.
- Jira Server o Data Center, y los tokens de API con ámbitos (que usan `api.atlassian.com`).
- JQL escrito por el usuario, filtros guardados de Jira y sprints.
- Sondeo periódico, notificaciones y consolas: la mini app no tiene trabajos largos.
- Otros campos del ticket (prioridad, tipo, épica, puntos) y su detalle dentro de la mini app.
