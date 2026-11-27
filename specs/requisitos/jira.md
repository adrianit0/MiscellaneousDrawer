# Requisitos de «Tableros Jira»

La mini app «Tableros Jira» (`jira`) muestra tableros propios sobre varios proyectos de Jira Cloud a la vez. Cada tablero tiene sus columnas, y en cada columna el usuario pone los estados de cada proyecto que le corresponden, aunque los proyectos tengan flujos distintos. Solo lee de Jira: no cambia nada. Las decisiones están en [ADR-0027](../decisiones/ADR-0027-mini-app-tableros-jira.md) y, para los colores y las prioridades, en [ADR-0028](../decisiones/ADR-0028-colores-y-prioridades-en-tableros-jira.md). La caché, las pestañas y los filtros guardados están en [ADR-0029](../decisiones/ADR-0029-cache-pestanas-y-filtros-en-tableros-jira.md), el botón para crear o abrir la tarea de «Gestask» y la cabecera fija, en [ADR-0030](../decisiones/ADR-0030-tableros-jira-y-gestask.md), el detalle del ticket, en [ADR-0031](../decisiones/ADR-0031-detalle-del-ticket-en-tableros-jira.md), y el cliente y las fechas de las tarjetas, en [ADR-0033](../decisiones/ADR-0033-cliente-y-fechas-en-las-tarjetas-de-tableros-jira.md).

La conexión (sitio, email, token y campo del cliente) se escribe en la mini app: no está en el código ni en el repositorio (S-30, S-32). Los ejemplos usan marcadores. Prefijo de requisitos: **JR**.

Términos:

- **Sitio**: la URL de Jira Cloud de la empresa, `https://<sitio>.atlassian.net`.
- **Estado**: un estado de Jira de un proyecto concreto, por su identificador. Dos proyectos pueden tener estados con el mismo nombre y distinto identificador.
- **Tablero**: un nombre, sus proyectos, sus columnas en orden y, en cada columna, sus estados con su color; y sus prioridades con su color.
- **Prioridad**: una prioridad de Jira, por su identificador. Los nombres dependen de cada sitio de Jira.
- **Paleta**: los colores que se pueden elegir (JR-18).
- **Filtro**: unos criterios con nombre, comunes a todos los tableros, que ocultan los tickets que no los cumplen (JR-26, JR-27).
- **Columna final**: la última columna del tablero, la de los tickets cerrados.
- **Campo del cliente**: el campo personalizado de Jira que dice qué persona del portal pidió el ticket. Cada sitio de Jira le da su identificador (`customfield_<cifras>`) y su nombre, como «Cliente Portal». No es el informador, que en los tickets que llegan del portal es siempre el mismo.
- **ADF**: Atlassian Document Format, el JSON con el que Jira Cloud da la descripción y los comentarios de un ticket.

## Conexión

| ID | Requisito |
|---|---|
| JR-01 | La conexión se guarda en `<config>/apps/jira/config.json` (P-09), con permisos 600 (S-20) y sustituyendo el fichero de golpe. Nace vacía. Un fichero que no se puede leer o no cumple JR-02 se trata como si no existiera, sin registrar su contenido (S-21). |
| JR-02 | Al guardar se valida el formato de cada valor escrito (tabla siguiente); un campo vacío no se comprueba, para poder guardar a medias. Un valor incorrecto impide guardar e indica el campo: 400 `invalid_config` con `details.field`. Guardar no contacta con Jira. |
| JR-03 | El token no sale nunca del servidor: `GET /config` devuelve `tokenSet` en su lugar, y los demás campos tal como se guardaron. Al guardar, un token que no viene o es `null` conserva el guardado, y la cadena vacía lo borra. Ni el token ni la cabecera que lo lleva aparecen en el registro (S-21). |
| JR-04 | `GET /config` devuelve en `missing` los campos obligatorios que siguen vacíos: el sitio, el email y el token. El campo del cliente es opcional y no cuenta. Mientras falte alguno, lo que contacta con Jira responde 409 `not_configured` con `details.missing`, sin contactar con ningún servidor. |
| JR-05 | Cada llamada a Jira va a `<sitio>/rest/api/3/…` con `Authorization: Basic <base64(email:token)>` y `Accept: application/json`, y espera la respuesta 20 s como mucho. No se sigue ninguna redirección a otro host. |
| JR-06 | «Probar conexión» (`POST /connection/test`) pide `GET <sitio>/rest/api/3/myself` y responde `{"ok": true, "user": "<nombre visible>"}` o el error de JR-07. |
| JR-07 | Un error de Jira se responde como 502 `jira_error` con un mensaje para el usuario: «El email o el token no son válidos» (401), «Tu cuenta no tiene permiso para ver esto» (403), «No existe en Jira» (404), «Jira limita las peticiones: prueba de nuevo en un minuto» (429) o el primer `errorMessages[]` de la respuesta; y como 502 `jira_unreachable` con «No hay contacto con Jira» si no hay respuesta. |
| JR-08 | `GET /fields` pide `GET <sitio>/rest/api/3/field`, que no necesita permisos de administrador, y devuelve los campos personalizados (`custom: true`) cuyo identificador cumple el formato de `customerField` (JR-02), con su identificador (`id`) y su nombre (`name`), ordenados por nombre sin distinguir mayúsculas ni acentos y, a igual nombre, por identificador. Los errores son los de JR-04 y JR-07. |

| Campo | Clave | Formato |
|---|---|---|
| Sitio | `siteUrl` | `https://<sitio>.atlassian.net`, con `<sitio>` de 1 a 63 letras, números o `-`, sin ruta, usuario, parámetros ni fragmento; `http://localhost:<puerto>` y `http://127.0.0.1:<puerto>` solo para pruebas. La barra final se quita |
| Email | `email` | El email de la cuenta de Atlassian: hasta 254 caracteres, con una `@` y sin espacios |
| Token | `token` | Un token de API clásico de Atlassian: 1 a 500 caracteres visibles, sin espacios |
| Campo del cliente | `customerField` | Opcional. `customfield_` seguido de 1 a 18 cifras |

## Proyectos, estados y prioridades

| ID | Requisito |
|---|---|
| JR-10 | `GET /projects?query=<texto>` pide `GET <sitio>/rest/api/3/project/search?query=<texto>&orderBy=key&maxResults=50&startAt=<n>`, hasta 200 proyectos, y devuelve de cada uno su clave (`key`) y su nombre (`name`). |
| JR-11 | `GET /projects/<clave>/statuses` pide `GET <sitio>/rest/api/3/project/<clave>/statuses` y devuelve los estados del proyecto, sin repetir los que comparten sus tipos de incidencia: identificador (`id`), nombre (`name`) y categoría de Jira (`category`: `new`, `indeterminate` o `done`). Una clave que no cumple JR-12 responde 400 sin contactar con Jira. |
| JR-12 | Una clave de proyecto empieza por una letra mayúscula y sigue con mayúsculas, números o `_`, de 2 a 20 caracteres. Un identificador de estado son de 1 a 18 cifras. Así ningún valor guardado puede cambiar el JQL de JR-21. |
| JR-19 | `GET /priorities` pide `GET <sitio>/rest/api/3/priority/search?maxResults=50&startAt=<n>`, hasta 200 prioridades, y las devuelve en el orden de Jira con su identificador (`id`, de 1 a 18 cifras) y su nombre (`name`). Las que no tienen un identificador así no se devuelven. |

## Tableros

| ID | Requisito |
|---|---|
| JR-13 | Los tableros se guardan en la base de la mini app (P-08, «Datos»). Puede haber hasta 20; la mini app nace sin ninguno. Crear el 21.º responde 409 `too_many_boards`. |
| JR-14 | Un tablero tiene un nombre de 1 a 60 caracteres sin repetir (sin distinguir mayúsculas), de 1 a 10 proyectos distintos y de 1 a 12 columnas. Cada columna tiene un nombre de 1 a 40 caracteres sin repetir en el tablero y de 0 a 100 estados. Cada estado es un par proyecto-identificador (JR-12) de un proyecto del tablero, con un color de la paleta (JR-18), y un mismo par está como mucho en una columna. Tiene además de 0 a 20 prioridades (JR-17). Guardar algo que no cumple esto responde 400 `invalid_board` con `details.field`. |
| JR-15 | Guardar un tablero no contacta con Jira: se guarda lo que manda la interfaz, con el nombre de cada estado tal como lo vio para mostrarlo si Jira deja de tenerlo. Quitar un proyecto del tablero quita sus estados de las columnas. |
| JR-16 | Borrar un tablero pide confirmación en la interfaz y no se puede deshacer. El orden de los tableros es el de creación. |
| JR-17 | Cada tablero tiene sus propias prioridades, de 0 a 20: cada una con su identificador de Jira (1 a 18 cifras, sin repetir), su nombre tal como lo vio la interfaz (1 a 255 caracteres) y un color de la paleta. Se guardan con el tablero y en el orden en que se añadieron. |
| JR-18 | La paleta tiene ocho colores, por su clave: `gray`, `blue`, `green`, `violet`, `orange`, `cyan`, `gold` y `red`. Cada uno es una variable del tema (`--text-muted`, los seis colores de mini app y `--error`), y el texto oscuro del tema (`--accent-text`) se lee sobre todos con contraste AA. Un color que no es de la paleta responde 400 `invalid_board`; uno que falta o es `null` es `gray`, así los tableros guardados antes de JR-18 siguen valiendo. |

## Tickets

| ID | Requisito |
|---|---|
| JR-20 | `GET /boards/<id>/issues` pide primero los estados de cada proyecto del tablero (JR-11; un proyecto que responde 404 no tiene ninguno), consulta los tickets y devuelve el tablero con sus columnas en orden y, en cada una, sus tickets, del actualizado más recientemente al más antiguo. De cada ticket: clave (`key`), resumen (`summary`), proyecto (`project`), estado (`status`, el nombre actual en Jira), color del estado (`statusColor`, el de su par en el tablero), asignado (`assignee`, su nombre visible, o `null`), cliente (`customer`, el texto de JR-28, o `null` si no hay campo del cliente configurado o el ticket no tiene valor), prioridad (`priority`: su `id`, su nombre actual en Jira como `name` y su `color` en el tablero, que es `null` si el tablero no tiene esa prioridad; o `null` si el ticket no tiene prioridad), fecha de creación (`created`) y fecha de actualización (`updated`), las dos tal como las da Jira. Responde también la fecha de la consulta (`fetchedAt`), si hay más tickets de los devueltos (`truncated`) y los estados guardados que Jira ya no tiene (`missingStatuses`, con su proyecto, su identificador, su nombre guardado y su columna), que no entran en la consulta. |
| JR-21 | La consulta es `POST <sitio>/rest/api/3/search/jql` con `fields: ["summary", "status", "assignee", "project", "priority", "created", "updated"]`, más el campo del cliente si está configurado, `maxResults: 100`, siguiendo `nextPageToken`, y un JQL armado por el servidor solo con los valores de JR-12: por cada proyecto con algún estado en columnas, `(project = "<clave>" AND (status in (<sus estados de las demás columnas>) OR (status in (<sus estados de la columna final>) AND updated >= -14d)))`, unidos con `OR` y seguidos de `ORDER BY updated DESC`. Va por proyecto porque un mismo identificador de estado puede estar en dos proyectos y en columnas distintas. Si una de las dos listas de un proyecto está vacía, su parte no se incluye; si ningún proyecto tiene estados, no se consulta y el tablero sale vacío. |
| JR-22 | Un ticket se coloca en la columna que tiene el par de su proyecto y su estado. Un ticket cuyo par no está en ninguna columna no se muestra. |
| JR-23 | Como mucho se leen 1000 tickets por tablero. Si Jira tiene más, se devuelven los 1000 más recientes con `truncated: true`. |
| JR-24 | Las consultas son solo de lectura: la mini app solo usa `GET` y `POST /rest/api/3/search/jql`, que no cambia nada en Jira (constitución, principio 4; ADR-0027). |
| JR-25 | En el registro del shell solo quedan el número del tablero, el número de tickets y los errores con su código; ni el token, ni el sitio, ni el JQL, ni datos de los tickets (S-21). |
| JR-28 | El texto del cliente sale del valor del campo del cliente, que depende de su tipo en Jira: un texto o un número, tal cual; un objeto, su `displayName` (una persona), o su `value` (una opción), o su `name`, el primero que sea un texto; y una lista, los textos de sus elementos por la misma regla, unidos con «, ». Se quitan los espacios de los extremos, y lo que queda vacío o no es de ninguno de estos tipos es `null`. |

## Filtros

| ID | Requisito |
|---|---|
| JR-26 | Los filtros se guardan en la base de la mini app (P-08, «Datos») y son comunes a todos los tableros. Van en el orden de creación. Puede haber hasta 30; la mini app nace sin ninguno y crear el 31.º responde 409 `too_many_filters`. Guardarlos y borrarlos no contacta con Jira, y borrar uno pide confirmación en la interfaz. |
| JR-27 | Un filtro tiene un nombre de 1 a 40 caracteres sin repetir (sin distinguir mayúsculas) y al menos uno de estos criterios; uno que falta o es `null` no se aplica. `statuses`: `{"mode": "include" \| "exclude", "values": [<nombres>]}`, con 1 a 100 nombres de 1 a 255 caracteres sin repetir. `priorities` y `assignees`: igual, con `none` (`true` para incluir «Sin prioridad» o «Sin asignar»); `values` puede estar vacío si `none` es `true`. `created` y `updated`: `{"moreThanDays": <n>, "lessThanDays": <n>, "from": "AAAA-MM-DD", "to": "AAAA-MM-DD"}`, con al menos uno que no sea `null`: días enteros de 0 a 3650, `moreThanDays` menor que `lessThanDays` si están los dos, y fechas que existen, con `from` no posterior a `to`. Lo que no cumple esto responde 400 `invalid_filter` con `details.field` (`name`, `criteria` si no tiene ninguno, o el del criterio). |

## Interfaz

| ID | Requisito |
|---|---|
| JR-30 | La mini app tiene cuatro secciones: «Tableros», «Configurar tableros», «Filtros» y «Conexión». Mientras falte algún campo de la conexión abre en «Conexión» y lo dice; con la conexión completa y sin tableros, abre en «Configurar tableros» con «Crea tu primer tablero». |
| JR-31 | «Conexión» muestra los campos de JR-02, «Guardar» y «Probar conexión», y explica dónde se crea el token (`id.atlassian.com`, «Tokens de API»). El token no se muestra nunca: si hay uno guardado, el campo lo dice y dejarlo vacío lo conserva. Un error de formato se muestra junto a su campo. El campo del cliente es un selector con «Ninguno» y los campos de JR-08, cada uno como «<nombre> (<identificador>)», y explica que es el campo de la persona que pide el ticket desde el portal. La lista se pide al abrir «Conexión» si la conexión guardada está completa; si no lo está, el selector lo dice y solo tiene «Ninguno» y el valor guardado. Si la lista falla, se dice el error junto al selector. Un valor guardado que no está en la lista se sigue viendo, como «<identificador> (no está en Jira)». |
| JR-32 | «Configurar tableros» lista los tableros con «Nuevo tablero», «Editar» y «Borrar». El editor tiene el nombre, los proyectos (con un buscador sobre JR-10) y las columnas, que se añaden, se renombran, se reordenan con «Subir» y «Bajar» y se quitan. |
| JR-33 | En el editor, cada columna muestra sus estados agrupados por proyecto con su categoría de Jira; se añaden eligiendo de los estados de los proyectos del tablero (JR-11) que no están en otra columna, y se quitan. Un estado puede estar en varios proyectos con el mismo nombre: se elige por proyecto. Cada estado de una columna tiene un selector «Color» con la paleta (JR-18) y se ve con su color; al añadirlo toma el de su categoría: `gray` si es `new`, `blue` si es `indeterminate` y `green` si es `done`. |
| JR-34 | El editor muestra aparte «Estados sin columna»: los de los proyectos del tablero que no están en ninguna. Sus tickets no se verán en el tablero. También marca los estados guardados que Jira ya no tiene. |
| JR-35 | El editor dice que la última columna es la de cerrados y que solo muestra los tickets actualizados en los últimos 14 días. |
| JR-36 | Salir del editor con cambios sin guardar pide confirmación, como en «Base de datos» (BD-67, ADR-0015). |
| JR-37 | El editor tiene una sección «Prioridades» con las del tablero (JR-17), cada una con su selector «Color» y «Quitar». «Añadir prioridad» elige de las de Jira (JR-19) que el tablero no tiene. Una prioridad nueva toma el primer color de `red`, `orange`, `gold`, `blue`, `cyan`, `violet`, `green` y `gray` que no usa otra del tablero, o `gray` si se usan todos. Si Jira ya no tiene una prioridad guardada, se marca como en JR-34. |
| JR-40 | «Tableros» muestra arriba los tableros como pestañas, en una sola línea horizontal y en el orden de creación, con desplazamiento horizontal si no caben. La pestaña del tablero elegido se marca (`aria-current`) y la elección se recuerda (`useAppState`). |
| JR-41 | Cada columna muestra su nombre y su número de tickets. Cada ticket es una tarjeta con estas líneas, en este orden: la clave y, a la derecha, el estado de Jira como etiqueta rellena de su color (`statusColor`) con el texto oscuro del tema, y el botón de Gestask (JR-51); el resumen; el cliente (`customer`); «Creado <fecha>» y «Actualizado <fecha>», cada una en su línea, con la fecha como `DD/MM/AAAA HH:MM` en la hora local; el nombre de la prioridad, sin icono, del color de la prioridad en el tablero o `gray` si el tablero no la tiene; y el asignado («Sin asignar» si no tiene) y, a la derecha, su círculo (JR-45). Un ticket sin cliente, sin prioridad o sin una de las fechas no tiene esa línea. La clave enlaza a `<sitio>/browse/<clave>`, que se abre en el Chrome habitual (C-16). Pulsar el resto de la tarjeta abre su detalle (JR-70). |
| JR-42 | Un selector «Agrupar por» con «Nada», «Proyecto» y «Asignado» reparte los tickets en filas horizontales con las mismas columnas; cada fila dice su nombre y su número de tickets. «Sin asignar» va la última. La elección se recuerda por tablero (`useAppState`). |
| JR-43 | Un filtro de texto oculta los tickets cuya clave, resumen o asignado no contienen el texto, sin distinguir mayúsculas ni acentos, sin volver a consultar Jira. Se aplica a la vez que el filtro guardado activo (JR-48), y los números de columnas y filas cuentan solo los tickets visibles. |
| JR-44 | Mientras consulta se ve que está cargando y se conserva lo anterior. Un error se muestra con su mensaje (JR-07) y «Reintentar». Con `truncated` dice «Se muestran los 1000 tickets más recientes». Con `missingStatuses` dice qué estados ya no existen en Jira y lleva al editor. |
| JR-45 | El círculo del asignado lleva sus iniciales en mayúsculas: la primera letra de las dos primeras palabras de su nombre, o las dos primeras letras si tiene una sola. Su fondo es un color propio de la persona: uno de 18 tonos separados 20°, con la saturación y la luminosidad fijas para que el texto oscuro del tema se lea con contraste AA. El tono sale del nombre, así que la misma persona tiene el mismo color en cada consulta; si en el tablero dos personas sacan el mismo tono, la que va después por orden alfabético toma el siguiente libre. Con más de 18 personas en el tablero los tonos se repiten. «Sin asignar» lleva un círculo gris con «?». El círculo tiene el nombre completo como texto alternativo. |
| JR-46 | Lo consultado de cada tablero (JR-20) se guarda en la memoria de la mini app mientras está montada (N-05), nunca en disco. Un tablero se consulta la primera vez que se muestra, al pulsar «Actualizar» o «Reintentar» y cuando su configuración cambia en el editor. Cambiar de tablero, de sección o de mini app y volver muestra lo guardado, con la hora de su consulta, sin consultar Jira. Oculta, no consulta. Cerrar la mini app (N-06) lo vacía. |
| JR-47 | La sección «Filtros» lista los filtros con su nombre y un resumen de sus criterios, con «Nuevo filtro», «Editar» y «Borrar». El editor tiene el nombre y estos criterios, todos opcionales: «Estados», «Prioridades» y «Asignados», cada uno con «Es uno de» o «No es ninguno de» y su lista; «Antigüedad», con «Más de» y «Menos de» días desde la creación; «Creado», con «Desde» y «Hasta»; y «Actualizado», con «Hace más de» y «Hace menos de» días, «Desde» y «Hasta». Los estados se eligen entre los nombres de los estados de todos los tableros; las prioridades, entre las de Jira (JR-19) y «Sin prioridad»; y los asignados, entre las personas de los tickets ya consultados y «Sin asignar», o escribiendo un nombre. Un valor guardado que ya no está entre las opciones se sigue viendo. Un error de JR-27 se muestra junto a su criterio. |
| JR-48 | Justo debajo de las pestañas de tableros, una línea horizontal tiene «Todos» y un botón por filtro, en su orden. Solo hay uno activo (`aria-pressed`), y pulsar otro lo cambia. El activo es el mismo para todos los tableros y se recuerda (`useAppState`); si ya no existe, se vuelve a «Todos». Sin filtros, la línea tiene «Todos» y «Crear un filtro», que lleva a «Filtros». Aplicar un filtro no consulta Jira. |
| JR-49 | Un ticket pasa un filtro si cumple todos sus criterios. En una lista con «Es uno de», su valor tiene que ser uno de los de la lista (o no tener prioridad o asignado si incluye «Sin prioridad» o «Sin asignar»); con «No es ninguno de», no puede serlo. Los nombres se comparan sin distinguir mayúsculas, acentos ni espacios de los extremos. «Más de N días» es una fecha anterior al momento de aplicar el filtro menos N días de 24 horas, y «Menos de N días», una igual o posterior. «Desde» y «Hasta» comparan el día de la fecha en la hora local e incluyen los dos extremos. |

## Tareas de «Gestask»

| ID | Requisito |
|---|---|
| JR-50 | La mini app recibe de `gestask` los mensajes `gestask-tickets` `{"tickets": [<texto>, …]}` (GT-121, P-30). Cada uno sustituye entero la lista de tickets de Gestask guardada en su base («Datos»), así que uno repetido no tiene efecto. Un mensaje de otro remitente, de otro tipo o con otro contenido se descarta (se registra sin su contenido). Todos se confirman después de guardarlos o descartarlos. `GET /gestask/tickets` procesa así los mensajes pendientes y responde `{"tickets": […]}` con la lista guardada, vacía si nunca llegó ninguna. No contacta con Jira. |
| JR-51 | En cada tarjeta (JR-41), a la derecha del estado, un botón pequeño dice si el ticket es ya una tarea de Gestask: su clave está en la lista de JR-50 (sin distinguir mayúsculas ni espacios de los extremos). Si no lo es, «+» («Crear en Gestask») abre Gestask en `/new?ticket=<clave>&title=<resumen>&priority=<nombre de la prioridad>` (GT-122; sin `priority` si el ticket no tiene). Si lo es, «>» («Abrir en Gestask») lo abre en `/ticket/<clave>` (GT-123). Los dos usan `openApp` (P-33). |
| JR-52 | La interfaz pide la lista de JR-50 al abrirse y cada vez que vuelve a mostrarse (N-05), sin consultar Jira y sin tocar lo guardado de los tableros (JR-46). Mientras no llega, o si falla, se usa la última recibida (al principio, vacía); un fallo no se avisa, porque Gestask se protege de crear otra tarea con el mismo ticket (GT-122). |
| JR-53 | La mini app ocupa el alto de su área (P-17). En «Tableros», las secciones, las pestañas de tableros, la línea de filtros, la barra de herramientas y los avisos se quedan fijos arriba, y debajo solo se desplaza el tablero, en vertical y en horizontal, con los nombres de las columnas fijos en su parte de arriba. En las demás secciones las pestañas de secciones se quedan fijas y se desplaza lo de debajo. |

## Detalle del ticket

| ID | Requisito |
|---|---|
| JR-60 | `GET /issues/<clave>` pide `GET <sitio>/rest/api/3/issue/<clave>?fields=summary,status,issuetype,priority,assignee,reporter,created,updated,description,parent,subtasks,issuelinks,attachment,labels,components` y sus comentarios (JR-62), y responde el detalle de JR-61. Una clave que no cumple JR-63 responde 400 `invalid_issue` sin contactar con Jira. Los errores son los de JR-04 y JR-07: un ticket que no existe o que la cuenta no puede ver es «No existe en Jira». |
| JR-61 | El detalle tiene: clave (`key`), resumen (`summary`), proyecto (`project`), estado (`status`: `name` y `category`, como en JR-11), tipo (`type`, su nombre, o `null`), prioridad (`priority`: `id` y `name`, o `null`), asignado (`assignee`) e informador (`reporter`), con su nombre visible o `null`, fecha de creación (`created`) y de actualización (`updated`) tal como las da Jira, descripción (`description`: el documento ADF tal como lo da Jira, o `null`), padre (`parent`: un ticket breve o `null`), subtareas (`subtasks`: tickets breves), enlaces (`links`), adjuntos (`attachments`), etiquetas (`labels`: textos), componentes (`components`: sus nombres), comentarios (`comments`, JR-62), `commentsTruncated` y la fecha de la consulta (`fetchedAt`). Un ticket breve tiene clave (`key`), resumen (`summary`), estado (`status`, con su categoría) y tipo (`type`). Cada enlace tiene la relación tal como la nombra Jira vista desde este ticket (`relation`: `type.outward` si el otro es `outwardIssue`, `type.inward` si es `inwardIssue`) y el otro ticket, breve (`issue`). Cada adjunto tiene su identificador (`id`), nombre (`filename`), tipo MIME (`mimeType`), tamaño en bytes (`size`), autor (`author`, nombre visible o `null`) y fecha (`created`). Las listas van en el orden de Jira. |
| JR-62 | Los comentarios se piden a `GET <sitio>/rest/api/3/issue/<clave>/comment?orderBy=-created&maxResults=100&startAt=<n>`, hasta 200, del más reciente al más antiguo. Cada uno tiene su identificador (`id`), autor (`author`, nombre visible o `null`), fecha de creación (`created`) y de cambio (`updated`), y cuerpo (`body`, ADF). Si Jira tiene más, se devuelven los 200 más recientes con `commentsTruncated: true`. |
| JR-63 | Una clave de ticket es una clave de proyecto (JR-12), un guion y un número de 1 a 10 cifras que no empieza por cero. Un identificador de adjunto son de 1 a 18 cifras; un adjunto sin un identificador así no se devuelve. |
| JR-64 | El detalle solo usa `GET` (JR-24). En el registro del shell solo queda que se consultó un detalle, con su número de comentarios, y los errores con su código; ni la clave, ni el resumen, ni el contenido del ticket (JR-25). |

| ID | Requisito |
|---|---|
| JR-70 | En «Tableros», pulsar una tarjeta fuera de su clave y del botón de Gestask, o su resumen con el teclado, abre el detalle del ticket en un panel a la derecha, sobre el tablero, que sigue visible y desplazable a su izquierda. La mini app pasa a la subruta `/ticket/<clave>` con entrada en el historial (N-02), y la tarjeta abierta se marca (`aria-current`). «Cerrar» (✕) y Esc cierran el panel y vuelven a «Tableros» (subruta vacía). Abrir la mini app en `/ticket/<clave>` (P-33, una notificación) muestra «Tableros» con el panel de ese ticket, esté o no en el tablero; con una clave que no cumple JR-63, sin panel. |
| JR-71 | El panel es una zona etiquetada «Detalle de <clave>» que se desplaza por su cuenta, y al abrirse recibe el foco. Muestra, en este orden: la cabecera, con el tipo, la clave enlazada a `<sitio>/browse/<clave>` (C-16), «Actualizar», «Cerrar» y el resumen como título; la ficha, con Estado (etiqueta del color de su categoría, como en JR-33), Prioridad, Asignado («Sin asignar» si no tiene), Informador, Creado y Actualizado (día y hora locales), Padre, Etiquetas y Componentes, sin las líneas que no tienen valor salvo Estado y Asignado; «Descripción» («Sin descripción» si no tiene); «Subtareas»; «Enlaces», agrupados por relación en el orden de Jira; «Adjuntos»; y «Comentarios» con su número («Sin comentarios» si no hay), cada uno con su autor, su fecha y «(editado)» si `updated` es distinto de `created`. «Subtareas», «Enlaces» y «Adjuntos» no se muestran si están vacías. Con `commentsTruncated` dice «Se muestran los 200 comentarios más recientes». |
| JR-72 | El padre, las subtareas y los tickets enlazados se muestran con su tipo, su clave, su resumen y su estado del color de su categoría. Pulsar uno abre su detalle en el panel, en `/ticket/<clave>` con entrada en el historial, así que «Atrás» vuelve al anterior. |
| JR-73 | Cada adjunto muestra su nombre, su tipo, su tamaño (en B, KB o MB con un decimal, en base 1024), su autor y su fecha. El nombre enlaza a `<sitio>/rest/api/3/attachment/content/<id>`, que se abre en el Chrome habitual (C-16) con la sesión del usuario en Jira. El servidor no descarga ningún adjunto. |
| JR-74 | La descripción y los comentarios se pintan a partir de su ADF con los nodos de la tabla siguiente, sin interpretar nunca HTML. Un nodo que no está en la tabla muestra el texto que contiene. Una marca `link` solo es un enlace si su URL es `http` o `https` (C-16); si no, se ve solo el texto. Los nodos anidados a más de 50 niveles no se pintan. |
| JR-75 | Lo consultado de cada ticket se guarda en la memoria de la mini app mientras está montada, nunca en disco, y se vacía al cerrarla (como JR-46). Al abrir un ticket ya consultado se muestra sin consultar, con la hora de su consulta; se vuelve a consultar si el tablero elegido lo muestra con otra fecha de actualización, al pulsar «Actualizar» y al pulsar «Reintentar». Mientras consulta se ve que está cargando y se conserva lo anterior. Un error se muestra en el panel con su mensaje (JR-07) y «Reintentar». |

| Nodo ADF | Se pinta como |
|---|---|
| `doc`, `paragraph`, `text`, `hardBreak` | Párrafos y texto, con saltos de línea |
| Marcas `strong`, `em`, `underline`, `strike`, `code`, `subsup`, `link` | Negrita, cursiva, subrayado, tachado, código, subíndice o superíndice y enlace. `textColor` y las demás marcas se ignoran |
| `heading` | Un título por debajo del resumen: los niveles 1 y 2 son de nivel 4, el 3 de nivel 5 y los demás de nivel 6 |
| `bulletList`, `orderedList`, `listItem` | Listas; la numerada empieza en su `attrs.order` |
| `taskList`, `taskItem`, `decisionList`, `decisionItem` | Listas con ☐ o ☑ según el estado de la tarea (`attrs.state`), y con «Decisión:» |
| `codeBlock` | Bloque de código, sin colorear |
| `blockquote`, `rule` | Cita y línea horizontal |
| `panel` | Recuadro con el color de su tipo (`attrs.panelType`): `info` y `note` azul, `success` verde, `warning` dorado y `error` rojo; los demás, gris |
| `expand`, `nestedExpand` | Un bloque desplegable con su título (`attrs.title`), cerrado al principio |
| `table`, `tableRow`, `tableHeader`, `tableCell` | Una tabla, con las celdas de cabecera como tales; `colspan` y `rowspan` se respetan |
| `mention` | El nombre de la persona (`attrs.text`), resaltado; se añade la `@` si no la lleva |
| `emoji` | Su `attrs.text` o, si no tiene, su `attrs.shortName` |
| `status` | Una etiqueta con su `attrs.text` |
| `date` | El día local de `attrs.timestamp` (milisegundos) |
| `inlineCard`, `blockCard`, `embedCard` | Un enlace a su `attrs.url`, con la URL como texto |
| `mediaSingle`, `mediaGroup`, `mediaInline`, `media` | «[Adjunto: <attrs.alt>]», o «[Adjunto]» si no tiene `alt` |

## Datos

La base de la mini app (`<datos>/apps/jira/data.db`, P-08) tiene tres tablas:

- `board`: identificador, nombre, `definition` (los proyectos, las columnas con sus estados y sus colores, y las prioridades con sus colores, en JSON; una definición sin colores ni prioridades se lee con `gray` y sin prioridades, JR-18) y las fechas de creación y de cambio. Migración `db/apps/jira/V001__initial.sql`.
- `saved_filter`: identificador, nombre, `definition` (sus criterios de JR-27, en JSON) y las fechas de creación y de cambio. Migración `db/apps/jira/V002__filters.sql`.
- `gestask_ticket`: los tickets de las tareas de Gestask de la última lista recibida (JR-50), uno por fila. Migración `db/apps/jira/V003__gestask_tickets.sql`.

La conexión no va en la base sino en su fichero privado (JR-01), y los tickets no se guardan en disco: se piden a Jira y se conservan solo en la memoria de la interfaz (JR-46), también su detalle (JR-75).

## API

Todas las rutas cuelgan de `/api/apps/jira` (P-06) y siguen A-01 a A-03.

| Método | Ruta | Descripción |
|---|---|---|
| GET | /config | La conexión sin el token, con `tokenSet` y `missing` (JR-01 a JR-04) |
| PUT | /config | Guarda la conexión. 400 `invalid_config` |
| POST | /connection/test | Prueba la conexión (JR-06). 409 `not_configured`, 502 `jira_error` o `jira_unreachable` |
| GET | /fields | Campos personalizados de Jira, para elegir el del cliente (JR-08). 409, 502 |
| GET | /projects?query= | Proyectos de Jira (JR-10). 409, 502 |
| GET | /projects/{key}/statuses | Estados de un proyecto (JR-11). 400 `invalid_project`, 409, 502 |
| GET | /priorities | Prioridades de Jira (JR-19). 409, 502 |
| GET | /boards | `{"boards": […]}`: los tableros con su configuración (JR-13) |
| POST | /boards | Crea un tablero. 201; 400 `invalid_board`, 409 `too_many_boards` (JR-13) |
| PUT | /boards/{id} | Sustituye un tablero. 400 `invalid_board`, 404 `not_found` |
| DELETE | /boards/{id} | Borra un tablero. 204; 404 `not_found` |
| GET | /boards/{id}/issues | Los tickets del tablero por columna (JR-20 a JR-23). 404, 409, 502 |
| GET | /filters | `{"filters": […]}`: los filtros con su identificador y sus criterios (JR-26) |
| POST | /filters | Crea un filtro. 201; 400 `invalid_filter`, 409 `too_many_filters` (JR-26, JR-27) |
| PUT | /filters/{id} | Sustituye un filtro. 400 `invalid_filter`, 404 `not_found` |
| DELETE | /filters/{id} | Borra un filtro. 204; 404 `not_found` |
| GET | /gestask/tickets | `{"tickets": […]}`: los tickets de las tareas de Gestask (JR-50). No contacta con Jira |
| GET | /issues/{key} | El detalle de un ticket con sus comentarios (JR-60 a JR-63). 400 `invalid_issue`, 409, 502 |

## Fuera de alcance

- Cambiar nada en Jira: mover tickets, transiciones, asignar, comentar o crear.
- Jira Server o Data Center, y los tokens de API con ámbitos (que usan `api.atlassian.com`).
- JQL escrito por el usuario, filtros guardados de Jira y sprints.
- Sondeo periódico, notificaciones y consolas: la mini app no tiene trabajos largos.
- En las tarjetas, otros campos del ticket (tipo, épica, puntos) y más campos personalizados que el del cliente. El cliente en el detalle, en el filtro de texto y en los filtros guardados (ADR-0033). En el detalle, los puntos, los campos personalizados, el historial de cambios, el registro de trabajo y los enlaces web (ADR-0031).
- Previsualizar o descargar adjuntos, y editar nada desde el detalle (ADR-0031).
- Ordenar por prioridad, colorear las columnas y los iconos de prioridad de Jira (ADR-0028).
- Filtros por tablero, varios filtros activos a la vez, reordenar los filtros y filtrar en Jira con ellos (ADR-0029).
- Guardar los tickets en disco o conservarlos al cerrar la mini app (ADR-0029).
- Mantener al día la lista de tickets de Gestask sin abrir Gestask, y rellenar en Gestask el tipo u otros campos del ticket (ADR-0030).
