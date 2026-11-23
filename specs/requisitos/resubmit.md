# Requisitos de «Reenviar PR»

La mini app «Reenviar PR» (`resubmit`) vuelve a abrir los pull requests de corrección que se rechazaron al cerrar una versión. El día de subida, la rama `hotfix` se cierra, se mezcla en `develop`, se borra y se crea otra vez desde `develop`, y los PR contra ella que no habían entrado quedan rechazados. Por cada uno, la mini app crea una rama nueva desde la `hotfix` nueva, le aplica los commits del PR rechazado, la sube y abre el PR otra vez, con el mismo título, la misma descripción y los mismos revisores, y anota en el rechazado el enlace al nuevo. Las decisiones están en [ADR-0023](../decisiones/ADR-0023-mini-app-reenviar-pr.md) y [ADR-0024](../decisiones/ADR-0024-anotar-el-pr-anterior.md).

El servidor es un Bitbucket Data Center. La conexión (servidor, token, proyecto, repositorio y usuario) se escribe en la mini app: no está en el código ni en el repositorio (S-30, S-32). Los ejemplos usan marcadores. Prefijo de requisitos: **RP**.

Términos:

- **Rama destino**: la rama contra la que se piden los PR de corrección, `hotfix` si no se configura otra.
- **Clave**: la clave de Jira de una rama de corrección. `bug/TICKET-0001` y `bug/TICKET-0001-2` tienen la clave `TICKET-0001`.
- **Iteración**: el número de veces que se ha pedido el PR de una clave. `bug/TICKET-0001` es la 1 y `bug/TICKET-0001-2`, la 2.
- **PR pendiente**: un PR rechazado que se puede reenviar (RP-13).
- **Trabajo**: el reenvío de los PR elegidos. Se ejecuta en segundo plano y escribe en una consola.

## Conexión

| ID | Requisito |
|---|---|
| RP-01 | La conexión se guarda en `<config>/apps/resubmit/config.json` (P-09), con permisos 600 (S-20) y sustituyendo el fichero de golpe. Nace vacía. Un fichero que no se puede leer o no cumple RP-02 se trata como si no existiera. |
| RP-02 | Al guardar se valida el formato de cada valor escrito (tabla siguiente); un campo vacío no se comprueba, para poder guardar a medias. Un valor incorrecto impide guardar e indica el campo: 400 `invalid_config` con `details.field`. Guardar no contacta con Bitbucket ni ejecuta `git`. |
| RP-03 | El token no sale nunca del servidor: `GET /config` devuelve `tokenSet` en su lugar. Al guardar, un token que no viene o es `null` conserva el guardado, y la cadena vacía lo borra. Ni el token ni la cabecera que lo lleva aparecen en el registro ni en la consola (S-21). |
| RP-04 | `GET /config` devuelve en `missing` los campos obligatorios que siguen vacíos. Mientras falte alguno, lo que contacta con Bitbucket o ejecuta `git` responde 409 `not_configured` con `details.missing`. |
| RP-05 | «Probar conexión» (`POST /connection/test`) pide a Bitbucket el repositorio configurado y responde `{"ok": true, "repository": "<proyecto>/<repositorio>"}` o el error de RP-06. |
| RP-06 | Un error de Bitbucket se responde como 502 `bitbucket_error` con un mensaje para el usuario: «El token no es válido o ha caducado» (401), «El token no tiene permiso sobre el repositorio» (403), «No existe el proyecto o el repositorio» (404) o el primer `errors[].message` de la respuesta; y como 502 `bitbucket_unreachable` con «No hay contacto con Bitbucket» si no hay respuesta. |

| Campo | Clave | Obligatorio | Formato |
|---|---|---|---|
| URL de Bitbucket | `baseUrl` | Sí | `https://<servidor>[:puerto][/ruta]`, hasta 200 caracteres, sin usuario, parámetros ni fragmento; `http` solo para `localhost` y `127.0.0.1`. La barra final se quita |
| Token | `token` | Sí | Un token de acceso HTTP de Bitbucket: 1 a 500 caracteres visibles, sin espacios |
| Proyecto | `projectKey` | Sí | 1 a 128 letras, números, `_`, `-` o `~` (los proyectos personales empiezan por `~`) |
| Repositorio | `repoSlug` | Sí | 1 a 128 letras, números, `.`, `_` o `-` |
| Usuario | `username` | Sí | El nombre de usuario de Bitbucket del dueño del token: 1 a 255 caracteres visibles, sin espacios |
| Carpeta | `dir` | Sí | La copia local del repositorio: ruta absoluta, hasta 500 caracteres, sin caracteres de control |
| Rama destino | `targetBranch` | No | Nombre de rama (RP-07), hasta 100 caracteres. Si no se escribe, `hotfix` |
| Prefijo de rama | `branchPrefix` | No | 1 a 50 caracteres con el formato de RP-07, que puede terminar en `/`. Si no se escribe, `bug/` |

| ID | Requisito |
|---|---|
| RP-07 | Un nombre de rama tiene letras, números, `.`, `_`, `/` y `-`; no empieza por `-`, `/` ni `.`, no termina en `/` ni en `.lock` y no contiene `..` ni `//`. Así ningún valor escrito por el usuario puede leerse como una opción de `git`. |

## PR pendientes

| ID | Requisito |
|---|---|
| RP-10 | `GET /candidates` pide a Bitbucket los PR del repositorio configurado contra la rama destino cuyo autor es el usuario configurado, en cualquier estado y del más reciente al más antiguo, en páginas de 50 y hasta 200: `GET <baseUrl>/rest/api/1.0/projects/<proyecto>/repos/<repositorio>/pull-requests?state=ALL&direction=INCOMING&at=refs/heads/<rama destino>&order=NEWEST&role.1=AUTHOR&username.1=<usuario>&limit=50&start=<n>`. Cada llamada lleva `Authorization: Bearer <token>` y `Accept: application/json`. Un PR de otro autor que llegue en la respuesta se descarta. No ejecuta `git`. |
| RP-11 | La rama de un PR sigue el formato si es `<prefijo><clave>` o `<prefijo><clave>-<N>`, donde la clave es una letra, letras, números o `_`, un guion y números (`[A-Za-z][A-Za-z0-9_]*-[0-9]+`) y N es un número de 1 a 3 cifras. Sin `-<N>`, la iteración es 1. Dos claves que solo se diferencian en mayúsculas son la misma. |
| RP-12 | Los PR cuya rama sigue el formato se agrupan por clave. De cada clave solo cuenta el más reciente por fecha de creación: si está rechazado (`DECLINED`) desde hace 30 días o menos, es un PR pendiente; si está abierto o mezclado, o se rechazó hace más de 30 días, la clave no tiene nada pendiente. Así un PR que ya se reenvió no vuelve a aparecer. |
| RP-13 | `GET /candidates` devuelve, del más reciente al más antiguo por fecha de rechazo, los PR pendientes y los PR rechazados en los últimos 30 días que no se pueden reenviar, con `selectable: false` y el motivo en `reason`: «La rama no sigue el formato <prefijo><clave de Jira>» o «El PR viene de otro repositorio». De cada uno: número (`id`), título, rama, clave, enlace al PR (`link`), fecha de rechazo (`declinedAt`), revisores (`reviewers`), la rama nueva propuesta (`newBranch`, RP-14; null si no se puede reenviar), `selectable` y `reason`. |
| RP-14 | La rama nueva de una clave es `<prefijo><clave>-<N>`, con la clave escrita como en el PR rechazado y N la mayor iteración conocida de esa clave más uno. Son conocidas las ramas de todos los PR listados en RP-10 y, en el trabajo, también las ramas del remoto tras consultarlo (RP-23) y las que ya ha creado el mismo trabajo. Ejemplo: tras `bug/TICKET-0001`, `bug/TICKET-0001-2`; si `-2` ya existe, `bug/TICKET-0001-3`. |

## Trabajo

| ID | Requisito |
|---|---|
| RP-20 | `POST /jobs` con `{"prIds": [12, 15]}` inicia el reenvío de esos PR, en ese orden: de 1 a 50 números distintos. Solo puede haber un trabajo en marcha: pedir otro responde 409 `job_running`. Un cuerpo que no cumple esto responde 400 `invalid_request`. Se ejecuta en un hilo propio. |
| RP-21 | Antes de tocar nada, el trabajo comprueba que la carpeta es un repositorio git y que la URL de su `origin` apunta al repositorio configurado: su ruta, sin `.git` ni la barra final y sin distinguir mayúsculas, termina en `/<proyecto>/<repositorio>` o en `:<proyecto>/<repositorio>`. Si no, el trabajo falla sin ejecutar nada más: «La carpeta no es un repositorio git» o «El remoto «origin» de la carpeta no es el repositorio <proyecto>/<repositorio>». |
| RP-22 | El trabajo vuelve a pedir los PR pendientes (RP-10 a RP-14). Un PR elegido que ya no es pendiente queda `skipped` con «El PR ya no está pendiente de reenviar» y no se toca. |
| RP-23 | El trabajo consulta el remoto (`git fetch --prune origin`) y comprueba que la rama destino existe en él; si no, falla con «La rama «<rama destino>» no existe en el remoto». Las ramas de `origin` cuentan para elegir la rama nueva (RP-14), que nunca es una que ya exista en el remoto. |
| RP-24 | Los commits de un PR son los que llegan desde su último commit (`fromRef.latestCommit`) sin estar en la rama destino nueva, sin los de mezcla y del más antiguo al más reciente: `git rev-list --reverse --topo-order --no-merges <último commit> --not refs/remotes/origin/<rama destino>`. Si su último commit no está en la copia local, el PR falla con «Los commits del PR no están en el remoto ni en la copia local». Si no queda ningún commit, queda `skipped` con «Sus cambios ya están en «<rama destino>»». |
| RP-25 | Los commits se aplican en una copia de trabajo aparte (`git worktree add --detach`) dentro de `<datos>/apps/resubmit/worktrees/`, a partir de la rama destino del remoto, con un único `git cherry-pick` de todos ellos. La copia del usuario no cambia de rama ni de ficheros, y no se crea ninguna rama local. La copia aparte se elimina al terminar ese PR, haya ido bien o no, también si el trabajo se cancela. |
| RP-26 | Si un commit no se puede aplicar, se anota el commit y los ficheros en conflicto, se deshace el cherry-pick (`git cherry-pick --abort`) y el PR queda `conflict` con «Conflicto al aplicar <commit abreviado a 8>: <ficheros>». Si falla por otro motivo, se deshace igual y queda `failed` con la última línea de error de `git`. En ninguno de los dos casos se sube nada, y el trabajo sigue con el siguiente PR. |
| RP-27 | **Envío acotado.** Lo único que la mini app envía al servidor git es la rama nueva, con `git push origin HEAD:refs/heads/<rama nueva>`: sin `--force`, sin `--delete` y nunca a una rama que ya exista. Ningún otro comando contacta con el remoto salvo `fetch` (constitución, principio 4; ADR-0023). |
| RP-28 | Subida la rama, se crea el PR: `POST <baseUrl>/rest/api/1.0/projects/<proyecto>/repos/<repositorio>/pull-requests` con el título del rechazado, su descripción seguida de una línea en blanco y «Procede de: <enlace al PR rechazado>», `fromRef` la rama nueva, `toRef` la rama destino y los revisores del rechazado. Si Bitbucket rechaza los revisores (409), se crea sin ellos y el detalle lo dice: «PR creado sin revisores: <motivo>». El PR queda `created` con el enlace al nuevo (`link`). |
| RP-29 | Si la rama se subió pero no se pudo crear el PR, el PR queda `failed` con «Rama <rama nueva> subida, pero no se pudo crear el PR: <motivo>». La rama no se borra: el PR se puede pedir a mano. |
| RP-30 | Todos los comandos son `git`, el instalado en el equipo, con las credenciales y la identidad que el usuario ya tenga configuradas, en las mismas condiciones que RG-21: sin entrada, con `GIT_TERMINAL_PROMPT=0`, con `GIT_SSH_COMMAND=ssh -oBatchMode=yes` si el usuario no lo define y sin `_JPACKAGE_LAUNCHER` ni `LD_LIBRARY_PATH`. Si `git` no existe, el trabajo falla con «No se encontró el comando «git»». |
| RP-31 | El trabajo abre una consola de la plataforma (P-25) llamada «Reenviar PR». Escribe cada comando y su salida, `## <rama>` antes de cada PR, su resultado y un resumen al final. Termina como `succeeded` si todos los PR quedan `created` o `skipped`, `cancelled` si se cancela y `failed` en otro caso. |
| RP-32 | El resumen cuenta los PR de cada resultado: «6 recreados, 2 con conflictos», con «omitidos», «con error» y los PR anteriores que no se pudieron anotar (RP-36, «1 PR anterior sin anotar») si los hay. Al terminar sin cancelarse se emite una notificación de la plataforma (P-21) que lleva a la mini app, de tipo `success` si el trabajo es `succeeded` y `error` si no, con el resumen como título. Si el trabajo falla antes de tratar ningún PR (RP-21, RP-23), el título es su motivo. |
| RP-33 | `POST /job/cancel` termina el comando en curso, deshace el cherry-pick a medias y elimina la copia aparte (RP-25); los PR que no se llegaron a tratar quedan `pending`. 409 `no_job` si no hay ninguno en marcha. Al apagarse la aplicación se cancela el que esté en marcha (P-10), y mientras dura la mini app está ocupada (P-20) con el motivo «hay un reenvío de PR en marcha». Mientras dura, no se puede guardar la conexión: 409 `job_running`. |
| RP-34 | `GET /job` devuelve el trabajo en marcha o el último terminado: número, estado (`running`, `succeeded`, `failed` o `cancelled`), fechas, mensaje, el identificador de su consola (`consoleId`) y, por cada PR, su número, su título, su rama, la rama nueva, su resultado (`pending`, `running`, `created`, `conflict`, `skipped` o `failed`), el detalle, el enlace al PR nuevo y si se anotó el anterior (`annotated`: `true`, `false` o `null` si no se creó el nuevo, RP-36). |
| RP-35 | En el registro del shell solo quedan el número del trabajo, los números de los PR y los resultados; ni el token, ni URL, ni ramas, ni títulos, ni salida de `git` (S-21). |
| RP-36 | **Anotar el PR anterior.** Solo si el PR nuevo se creó, la mini app añade a la descripción del rechazado una línea en blanco y estas dos líneas: «Nuevo PR: <enlace al PR nuevo>» y «\*\*Pendiente de eliminar esta rama\*\*». Antes vuelve a pedir el rechazado (`GET …/pull-requests/<número>`) para tener su versión y su descripción actuales, y lo actualiza (`PUT …/pull-requests/<número>`) con esa versión, su título y sus revisores, para no quitarlos. Si la descripción ya tiene la línea «Nuevo PR: <enlace>», no se repite. Si Bitbucket no lo permite, el PR nuevo sigue `created`, `annotated` es `false` y el detalle añade «No se pudo anotar el PR anterior: <motivo>». La mini app nunca borra la rama del PR anterior: lo hace el usuario. |

## Interfaz

| ID | Requisito |
|---|---|
| RP-40 | La mini app tiene dos secciones: «PR rechazados» y «Conexión». Mientras falte algún campo obligatorio, abre en «Conexión» y lo dice. |
| RP-41 | «Conexión» muestra un formulario con los campos de RP-02, «Guardar» y «Probar conexión». El token no se muestra nunca: si hay uno guardado, el campo lo dice y dejarlo vacío lo conserva. Un error de formato se muestra junto a su campo. |
| RP-42 | «PR rechazados» pide los PR pendientes al abrirse y al pulsar «Buscar de nuevo», y muestra una tabla con una casilla, «Ticket», «Título», «Rama» (la rechazada y la nueva) y «Rechazado» (la fecha). El título enlaza al PR rechazado. Los PR pendientes empiezan marcados; los que no se pueden reenviar se ven atenuados, sin casilla y con su motivo. Sin ninguno, dice «No hay PR rechazados pendientes de reenviar». |
| RP-43 | «Reenviar seleccionados (<N>)» pide confirmación antes de iniciar el trabajo, con cuántas ramas se subirán y cuántos PR se crearán en Bitbucket. |
| RP-44 | Con un trabajo en marcha, las casillas y los botones que inician otro están desactivados y arriba se ven su avance («<n> de <total>»), «Ver consola» (P-12) y «Cancelar». Cada fila del trabajo muestra su resultado («Pendiente», «En marcha», «Recreado», «Con conflictos», «Omitido» o «Error») con su detalle y, si se creó, el enlace al PR nuevo y «PR anterior anotado» o «PR anterior sin anotar» (RP-36). Al terminar avisa con el resumen (U-05) y vuelve a pedir los PR pendientes. |
| RP-45 | El trabajo se consulta cada segundo mientras hay uno en marcha y la mini app está a la vista; oculta, no consulta (N-05). Al volver a verse se consulta de nuevo. |

## API

Todas las rutas cuelgan de `/api/apps/resubmit` (P-06) y siguen A-01 a A-03.

| Método | Ruta | Descripción |
|---|---|---|
| GET | /config | La conexión sin el token, con `tokenSet` y `missing` (RP-01 a RP-04) |
| PUT | /config | Guarda la conexión. 400 `invalid_config`, 409 `job_running` |
| POST | /connection/test | Prueba la conexión (RP-05). 409 `not_configured`, 502 `bitbucket_error` o `bitbucket_unreachable` |
| GET | /candidates | `{"candidates": […]}` (RP-10 a RP-14). 409 `not_configured`, 502 |
| GET | /job | `{"job": …}`: el trabajo en marcha o el último terminado, o `null` (RP-34) |
| POST | /jobs | `{"prIds": [12, 15]}`. 202; 400 `invalid_request`, 409 `not_configured` o `job_running` (RP-20) |
| POST | /job/cancel | Cancela el trabajo en marcha (RP-33). 409 `no_job` |

## Fuera de alcance

- Bitbucket Cloud, GitHub, GitLab y otros servidores.
- PR de otros autores, o contra otra rama que la destino configurada.
- Resolver conflictos desde la mini app o dejar una copia con el conflicto a medias: el PR con conflictos se rehace a mano.
- Borrar, forzar o actualizar ramas del remoto, y subir cualquier rama que no sea la nueva de un PR rechazado. La rama del PR anterior la borra el usuario: la mini app solo lo anota (RP-36, ADR-0024).
- Cambiar del PR anterior algo que no sea su descripción: estado, título, revisores o destino.
- Cerrar la versión, mezclar `hotfix` en `develop`, borrar o crear la rama destino: eso sigue siendo del equipo.
- Cambiar el estado o comentar en Jira.
- Más de un repositorio a la vez.
