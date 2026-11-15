# Requisitos de «Repositorios»

La mini app «Repositorios» (`repos`) mantiene al día las copias locales de varios repositorios git: muestra en qué rama está cada uno y cuánto le falta, cambia de rama, trae los cambios del remoto y clona el que falta. Sustituye al script de consola `actualizarAPIS.sh`, que recorría una lista fija de API, las ponía en `develop` y hacía `git pull`. Las decisiones están en [ADR-0019](../decisiones/ADR-0019-mini-app-repositorios.md).

Qué repositorios hay lo dice una lista que el usuario crea y edita en la mini app: no está en el código ni en el repositorio (S-30, S-32). Los ejemplos usan marcadores. Prefijo de requisitos: **RG**.

Términos:

- **Repositorio**: un nombre, una carpeta local, la URL de su remoto y una rama por defecto.
- **Estado**: lo que se sabe de la copia local sin salir de la máquina: rama, cambios sin confirmar y commits pendientes según la última consulta al remoto.
- **Trabajo**: una operación que modifica la copia local o contacta con el remoto. Se ejecuta en segundo plano y escribe en una consola.

## Lista de repositorios

| ID | Requisito |
|---|---|
| RG-01 | Los repositorios se guardan en `<config>/apps/repos/repos.json` (P-09), con permisos 600 y sustituyendo el fichero de golpe. Cada uno tiene un identificador numérico que no se reutiliza y los valores de la tabla siguiente. La lista nace vacía. Un fichero que no se puede leer o no cumple RG-02 se trata como si no existiera. |
| RG-02 | Al crear o modificar un repositorio se valida el formato de cada valor. Un valor incorrecto impide guardar e indica el campo: 400 `invalid_repo` con `details.field`. Guardar no toca la carpeta ni contacta con el remoto. |
| RG-03 | Se pueden crear, modificar y eliminar repositorios, hasta 50: crear otro responde 409 `too_many_repos`. Un identificador que no existe responde 404 `repo_not_found`. `GET /repos` los devuelve en el orden en que se crearon. Eliminar uno lo quita de la lista y no borra nada del disco. |
| RG-04 | Mientras hay un trabajo en marcha no se puede crear, modificar ni eliminar ningún repositorio: 409 `job_running`. |
| RG-05 | La URL del remoto no lleva contraseña. Una URL con `usuario:contraseña@` se rechaza, y la mini app no pide, lee ni guarda credenciales de git (RG-21). |

| Campo | Clave | Formato |
|---|---|---|
| Nombre | `name` | 1 a 60 caracteres, sin contar los espacios de los extremos |
| Carpeta | `dir` | Ruta absoluta, hasta 500 caracteres, sin caracteres de control |
| URL del remoto | `remoteUrl` | `https://…`, `ssh://…` o `usuario@servidor:ruta`, hasta 300 caracteres, sin espacios ni contraseña (RG-05) |
| Rama por defecto | `defaultBranch` | Nombre de rama de git (RG-06), hasta 100 caracteres. Si no se escribe, `develop` |

| ID | Requisito |
|---|---|
| RG-06 | Un nombre de rama, venga de la configuración o de la API, tiene letras, números, `.`, `_`, `/` y `-`; no empieza por `-`, `/` ni `.`, no termina en `/` ni en `.lock` y no contiene `..` ni `//`. Así ningún valor escrito por el usuario puede leerse como una opción de `git`. |

## Estado

| ID | Requisito |
|---|---|
| RG-10 | `GET /status` devuelve el estado de todos los repositorios, en su orden. Solo ejecuta comandos locales: no contacta con ningún remoto ni modifica nada. |
| RG-11 | Cada repositorio está en uno de estos estados (`state`):<br>- `missing` («Sin clonar»): la carpeta no existe o está vacía.<br>- `not_git` («No es un repositorio»): la carpeta tiene contenido pero no `.git`.<br>- `ok`: es un repositorio y se han podido leer sus datos.<br>- `error`: es un repositorio pero `git` ha fallado; `error` lleva su última línea de error. |
| RG-12 | De un repositorio `ok` se obtiene, con `git -C <carpeta> status --porcelain=v2 --branch`: la rama actual (`branch`, `null` si la cabecera está suelta), el commit actual abreviado a 8 caracteres (`head`), cuántos ficheros con seguimiento tienen cambios (`changes`), cuántos hay sin seguimiento (`untracked`) y, si la rama sigue a una remota, cuántos commits va por delante (`ahead`) y por detrás (`behind`) de ella según la última consulta al remoto; sin rama remota, los dos son `null`. |
| RG-13 | `branches` son las ramas a las que se puede cambiar: las locales y las de `origin`, sin repetir y por orden de nombre. Se obtienen con `git -C <carpeta> for-each-ref --format=%(refname) refs/heads refs/remotes/origin`. |
| RG-14 | `remoteMatches` dice si la URL de `origin` (`git -C <carpeta> remote get-url origin`) es la configurada. La URL de `origin` no se devuelve nunca, porque puede llevar una contraseña escrita a mano. |
| RG-15 | Si `git` no existe, `GET /status` responde con todos los repositorios en `error` y `warning`: «No se encontró el comando «git»». Sin aviso, `warning` es `null`. |

## Trabajos

| ID | Requisito |
|---|---|
| RG-20 | `POST /jobs` inicia un trabajo con una acción de la tabla siguiente. Solo puede haber uno en marcha: pedir otro responde 409 `job_running`. Se ejecuta en un hilo propio. Una acción desconocida, un repositorio que falta o una rama que no cumple RG-06 responden 400 `invalid_request`; un repositorio que no existe, 404 `repo_not_found`. |
| RG-21 | Todos los comandos son `git`, el instalado en el equipo, con las credenciales que el usuario ya tenga configuradas (ayudante de credenciales o claves SSH). Se ejecutan sin entrada, con `GIT_TERMINAL_PROMPT=0` y, si el usuario no ha definido `GIT_SSH_COMMAND`, con `GIT_SSH_COMMAND=ssh -oBatchMode=yes`: si `git` necesitara preguntar una contraseña, el comando falla en lugar de quedarse esperando. Se ejecutan sin `_JPACKAGE_LAUNCHER` ni `LD_LIBRARY_PATH`. Si `git` no existe, el trabajo falla con «No se encontró el comando «git»». |
| RG-22 | **Solo lectura del remoto.** La mini app solo contacta con el remoto para `fetch`, `pull` y `clone`. Nunca ejecuta `push` ni ningún otro comando que envíe datos (constitución, principio 4; ADR-0019). |
| RG-23 | Un trabajo sobre un repositorio que no está en el estado que la acción necesita falla sin ejecutar nada y lo dice: «El repositorio no está clonado», «La carpeta no es un repositorio git» o «La carpeta ya existe y no está vacía». |
| RG-24 | **Actualizar** lee el estado local (RG-12) antes y después del comando: actualiza la rama actual y deja el resultado `updated` («Actualizado») si el commit actual cambia y `unchanged` («Sin cambios») si no, como el script de consola. Con la cabecera suelta falla con «El repositorio no está en ninguna rama». Nunca crea un commit de mezcla: si la rama local no puede avanzar sin más, `git` falla y la copia local queda como estaba. |
| RG-25 | **Cambiar de rama** exige que la rama esté en `branches` (RG-13): si no, el trabajo falla con «La rama «<rama>» no existe». Si los cambios locales lo impiden, `git` falla y no se pierde nada. |
| RG-26 | **Descartar cambios** deshace los cambios de los ficheros con seguimiento. Los ficheros sin seguimiento no se tocan. |
| RG-27 | **Actualizar todas** hace en cada repositorio, en su orden, lo que hacía el script: cambiar a su rama por defecto y actualizarla. Un repositorio `missing` o `not_git` se salta (`skipped`) y lo dice; uno que falla no detiene los demás. **Consultar todas** hace lo mismo con la consulta al remoto. |
| RG-28 | Cada trabajo abre una consola de la plataforma (P-25) con el nombre de la acción y, si es de un repositorio, el suyo («Actualizar · <nombre>», «Actualizar todas»). Escribe cada comando y su salida, y en los trabajos de varios repositorios, `## <nombre>` antes de cada uno y un resumen al final. La consola termina como `succeeded` si ningún repositorio falla, `failed` si alguno falla y `cancelled` si se cancela. |
| RG-29 | Al terminar «Actualizar todas», «Consultar todas» o «Clonar» se emite una notificación de la plataforma (P-21) que lleva a la mini app: de tipo `success` con el resumen («3 actualizados, 5 sin cambios», «Repositorio clonado: <nombre>») o de tipo `error` si algún repositorio falla («2 de 8 repositorios han fallado»). Los demás trabajos son inmediatos y no emiten ninguna; uno cancelado, tampoco. |
| RG-30 | `POST /job/cancel` termina el comando en curso y sus procesos hijos, y el trabajo queda `cancelled`; los repositorios que no se llegaron a tratar quedan `pending`. 409 `no_job` si no hay ninguno en marcha. Al apagarse la aplicación se cancela el que esté en marcha (P-10), y mientras dura la mini app está ocupada (P-20) con el motivo «hay un trabajo de git en marcha». |
| RG-31 | `GET /job` devuelve el trabajo en marcha o el último terminado: número, acción, estado (`running`, `succeeded`, `failed` o `cancelled`), fechas, mensaje, el identificador de su consola (`consoleId`) y, por cada repositorio, su identificador, su nombre, su resultado (`pending`, `running`, `updated`, `unchanged`, `done`, `skipped` o `failed`) y su detalle. `succeeded` quiere decir que ningún repositorio ha fallado. |
| RG-32 | En el registro del shell solo quedan el número del trabajo, la acción, los identificadores de los repositorios y los estados; ni carpetas, ni URL, ni salida de `git` (S-21). |

| Acción | `action` | Parámetros | Estado necesario | Comandos |
|---|---|---|---|---|
| Consultar el remoto | `fetch` | `repoId` | `ok` | `git -C <carpeta> fetch --prune origin` |
| Actualizar | `pull` | `repoId` | `ok` | `git -C <carpeta> pull --ff-only origin <rama actual>` |
| Cambiar de rama | `switch` | `repoId`, `branch` | `ok` | `git -C <carpeta> switch <rama>` |
| Descartar cambios | `discard` | `repoId` | `ok` | `git -C <carpeta> reset --hard HEAD` |
| Usar el remoto configurado | `set-remote` | `repoId` | `ok` | `git -C <carpeta> remote set-url origin <URL>`, o `remote add origin <URL>` si no hay `origin` |
| Clonar | `clone` | `repoId` | `missing` | `git clone --branch <rama por defecto> -- <URL> <carpeta>` |
| Consultar todas | `fetch-all` | | | El de `fetch` en cada repositorio `ok` |
| Actualizar todas | `update-all` | | | En cada repositorio `ok`: `git -C <carpeta> switch <rama por defecto>` y `git -C <carpeta> pull --ff-only origin <rama por defecto>` |

## Interfaz

| ID | Requisito |
|---|---|
| RG-40 | La mini app tiene una sola pantalla con la tabla de repositorios: «Nombre», «Rama», «Estado», «Pendientes» y sus acciones. Encima, «Actualizar todas», «Consultar todas», «Refrescar» y «Nuevo repositorio». Sin repositorios, lo dice e invita a crear uno. |
| RG-41 | «Rama» es un desplegable con las ramas de RG-13 y la actual elegida; elegir otra inicia «Cambiar de rama». Con la cabecera suelta muestra el commit. «Estado» dice «Limpio», «<N> cambios» (con «<M> sin seguimiento» si los hay), «Sin clonar», «No es un repositorio» o el error. «Pendientes» dice «Al día», «↓ <N>» por detrás y «↑ <M>» por delante, o «—» si no se sabe. |
| RG-42 | Cada repositorio `ok` tiene «Actualizar» y, en un menú, «Consultar el remoto», «Descartar cambios» (solo con cambios), «Editar» y «Eliminar». Uno `missing` tiene «Clonar» en lugar de «Actualizar». Si `remoteMatches` es falso, se avisa con «El remoto «origin» no es el configurado» y «Usar el configurado». «Descartar cambios» y «Eliminar» piden confirmación; la de «Descartar cambios» dice cuántos ficheros se van a deshacer y que no se puede recuperar. |
| RG-43 | Con un trabajo en marcha, todas las acciones que inician otro están desactivadas y arriba se ve su nombre con «Ver consola» (P-12) y «Cancelar». En los trabajos de varios repositorios, cada fila muestra su resultado. Al terminar un trabajo que estaba viendo, avisa con el resultado (U-05) y refresca el estado. Del último trabajo terminado se ve el mensaje, con «Ver consola». |
| RG-44 | El estado se pide al abrir, al pulsar «Refrescar», al terminar un trabajo, tras guardar o eliminar un repositorio y cuando la mini app vuelve a verse (N-05). El trabajo se consulta cada segundo mientras hay uno en marcha y la mini app está visible; oculta, no consulta. |
| RG-45 | «Nuevo repositorio» y «Editar» muestran un formulario con los campos de RG-02, «Guardar» y «Cancelar». Un error de formato se muestra junto a su campo. |

## API

Todas las rutas cuelgan de `/api/apps/repos` (P-06) y siguen A-01 a A-03.

| Método | Ruta | Descripción |
|---|---|---|
| GET | /repos | `{"repos": […]}` (RG-03) |
| POST | /repos | Crea un repositorio. 201; 400 `invalid_repo`, 409 `too_many_repos` o `job_running` |
| PUT | /repos/{id} | Modifica un repositorio. 400 `invalid_repo`, 404 `repo_not_found`, 409 `job_running` |
| DELETE | /repos/{id} | Lo quita de la lista. 404 `repo_not_found`, 409 `job_running` |
| GET | /status | `{"statuses": […], "warning": null}` (RG-10 a RG-15) |
| GET | /job | `{"job": …}`: el trabajo en marcha o el último terminado, o `null` (RG-31) |
| POST | /jobs | `{"action": "pull", "repoId": 3}`. 202; 400 `invalid_request`, 404 `repo_not_found`, 409 `job_running` (RG-20) |
| POST | /job/cancel | Cancela el trabajo en marcha (RG-30). 409 `no_job` |

## Fuera de alcance

- Enviar al remoto (`push`), confirmar cambios (`commit`), mezclar, reorganizar o resolver conflictos (ADR-0019).
- Pedir o guardar el usuario y la contraseña de git: se usan los que el equipo ya tenga configurados.
- Crear o borrar ramas, guardar cambios aparte (`stash`) o borrar ficheros sin seguimiento.
- Convertir en repositorio una carpeta con contenido que no lo es.
- Ver el historial, las diferencias o el contenido de los ficheros.
- Remotos que no sean `origin`, y URL que no sean HTTPS o SSH.
- Detectar repositorios recorriendo una carpeta, o importar la lista de un `.sh`.
- Actualizar de forma periódica o al arrancar: solo cuando el usuario pulsa un botón.
