# Requisitos de «Calidad del dato»

La mini app «Calidad del dato» (`quality`) comprueba los datos de la base local de desarrollo: ejecuta una carpeta de scripts SQL de validación contra el contenedor MySQL de Docker y muestra los que devuelven filas o fallan. Cada fila devuelta es un dato incorrecto. Sustituye al script de consola `calidad_dato.sh`. Las decisiones están en [ADR-0016](../decisiones/ADR-0016-mini-app-calidad-del-dato.md).

Todo lo que depende del equipo (contenedor, contraseña, base, carpeta) se escribe a mano en su «Configuración», o se importa de un `.sh` (CD-05), y no está en el código ni en el repositorio (S-32). Los ejemplos usan marcadores. Prefijo de requisitos: **CD**.

Términos:

- **Script de calidad**: un fichero `.sql` de la carpeta de calidad. Está bien si no devuelve ninguna fila.
- **Comprobación**: una ejecución de uno o varios scripts de calidad.
- **Incidencia**: un script que devuelve filas o que falla.

## Configuración

| ID | Requisito |
|---|---|
| CD-01 | La sección «Configuración» guarda los valores de la tabla siguiente en `<config>/apps/quality/config.json`, con permisos 600 (S-20, P-09). Todos nacen vacíos. Se pueden guardar a medias: lo que se valida al guardar es el formato de cada valor escrito, y un valor con formato incorrecto impide guardar e indica el campo (400 `invalid_config`). |
| CD-02 | La contraseña nunca sale del servidor: `GET /config` devuelve `rootPasswordSet` en su lugar. Al guardar, si `rootPassword` no viene o es `null`, se conserva la guardada; si viene, la sustituye, y la cadena vacía la borra. |
| CD-03 | Una comprobación necesita los cuatro campos. `GET /config` devuelve en `missing` los que faltan. Si falta alguno, «Comprobar» lo dice y no deja ejecutar, y el servidor rechaza la comprobación con 409 `not_configured`. |
| CD-04 | Mientras hay una comprobación en marcha no se puede guardar la configuración: 409 `run_running`. |
| CD-05 | **Importar de un .sh.** Igual que BD-66, con las variables de la segunda tabla. Las demás variables se ignoran. A la carpeta se le quita la `/` final y se omite si no es una ruta absoluta. |
| CD-06 | **Cambios sin guardar.** Igual que BD-67: al pulsar «Comprobar» con cambios sin guardar en «Configuración», el diálogo «Cambios sin guardar» ofrece «Guardar», «Salir sin guardar» y «Cancelar». |

| Campo | Clave | Formato |
|---|---|---|
| Contenedor | `containerName` | `[A-Za-z0-9][A-Za-z0-9_.-]*`, hasta 63 caracteres |
| Contraseña de root | `rootPassword` | 1 a 200 caracteres |
| Base de datos | `databaseName` | `[A-Za-z0-9_$-]`, 1 a 64 caracteres, sin empezar por `-` |
| Carpeta de scripts de calidad | `qualitySqlDir` | Ruta absoluta |

| Variable del .sh | Campo |
|---|---|
| `CONTAINER_NAME` | Contenedor |
| `MYSQL_ROOT_PASSWORD` | Contraseña de root |
| `DATABASE_NAME` | Base de datos |
| `QUALITY_SQL_FOLDER` | Carpeta de scripts de calidad |

## Scripts de calidad

| ID | Requisito |
|---|---|
| CD-10 | `GET /scripts` devuelve la carpeta, si existe y sus ficheros `.sql`, por orden de nombre. Sin carpeta configurada, 409 `not_configured`. |
| CD-11 | Los nombres de fichero que llegan por la API son nombres simples, sin `/`, `\` ni `..`, y deben existir en la carpeta: si no, 400 `invalid_request`. Nunca se usa una ruta recibida del cliente. |

## Comprobación

| ID | Requisito |
|---|---|
| CD-20 | `POST /run` con `{"files": null}` comprueba todos los scripts de la carpeta, y con una lista, solo esos, siempre por orden de nombre. La lista no puede estar vacía. Solo puede haber una comprobación en marcha: pedir otra responde 409 `run_running`. Se ejecuta en un hilo propio. |
| CD-21 | Antes de los scripts se comprueba que el contenedor está levantado, con `docker ps --format {{.Names}}`: alguna línea debe ser exactamente su nombre. Si no, la comprobación falla con «El contenedor no está levantado: <contenedor>» y no ejecuta ningún script. Si la carpeta no existe, falla y lo dice. Si no tiene ningún `.sql`, termina bien con «No hay scripts de calidad». |
| CD-22 | Cada script se ejecuta con `docker exec -i -e MYSQL_PWD <contenedor> mysql --default-character-set=utf8 -uroot --xml <base de datos>` y el fichero por la entrada estándar. La contraseña va en la variable de entorno `MYSQL_PWD` y nunca en una línea de comandos ni en un registro. El comando se ejecuta sin `_JPACKAGE_LAUNCHER` ni `LD_LIBRARY_PATH`; si `docker` no existe, la comprobación falla con «No se encontró el comando «docker»». |
| CD-23 | Cada script queda con uno de estos resultados, y uno que falla no detiene los demás:<br>- `clean` («Correcto»): termina con código 0, sin salida de error y sin filas.<br>- `rows` («N filas»): termina con código 0, sin salida de error, y alguno de sus `SELECT` devuelve filas.<br>- `error` («Error»): termina con otro código o escribe en la salida de error, como hacía el script de consola, o su salida no es el XML de `mysql`. Se guardan las últimas 20 líneas de error. |
| CD-24 | Las filas de un script son las de todos sus conjuntos de resultados, cada uno con sus columnas. Un valor `NULL` se distingue de la cadena «NULL». Se guardan como mucho 1000 filas por script, y el resultado dice cuántas devolvió en total. De una salida de más de 32 MiB solo se lee el principio: el resultado dice que hay al menos las filas leídas. |
| CD-25 | Cada comprobación abre una consola de la plataforma (P-25) llamada «Comprobación <número>», y escribe en ella cada comando, y por cada script con incidencias, `## <fichero>` seguido de sus columnas y sus filas separadas por tabuladores o de sus líneas de error, como el script de consola. Al final escribe el resumen. La consola termina como `succeeded` si no hay incidencias, `failed` si las hay o la comprobación falla, y `cancelled` si se cancela. |
| CD-26 | Al terminar se emite una notificación de la plataforma (P-21) que lleva a «Comprobar»: «La base de datos tiene correctamente todos sus datos», de tipo `success`, si no hay incidencias; «<N> scripts con incidencias» (o «1 script con incidencias»), de tipo `error`, con el texto «<X> con filas y <Y> con error»; o «No se ha podido comprobar la calidad del dato», de tipo `error`, con el motivo, si la comprobación falla. Una comprobación cancelada no emite ninguna. |
| CD-27 | `POST /run/cancel` termina el comando en curso y sus procesos hijos, y la comprobación queda `cancelled`; los scripts que no se llegaron a ejecutar quedan `pending`. 409 `no_run` si no hay ninguna en marcha. Al apagarse la aplicación se cancela la que esté en marcha (P-10), y mientras dura la mini app está ocupada (P-20). |
| CD-28 | `GET /run` devuelve la comprobación en marcha o la última terminada: número, estado (`running`, `succeeded`, `failed` o `cancelled`), fechas, mensaje, el identificador de su consola (`consoleId`) y cada script con su resultado (`pending`, `running`, `clean`, `rows` o `error`), su número de filas, si ese número es completo y su error. `succeeded` quiere decir que se ejecutaron todos los scripts, tengan incidencias o no; `failed`, que no se pudo comprobar (CD-21). |
| CD-29 | `GET /run/scripts/{fichero}` devuelve las filas guardadas de ese script en la última comprobación: sus conjuntos de resultados con columnas y filas. 404 `result_not_found` si no está en ella. |
| CD-30 | Los resultados solo viven en memoria: se conservan hasta que empieza otra comprobación o se apaga la aplicación, y no van a disco ni al registro del shell (S-21), que solo recibe el número de la comprobación y su estado. |

## Interfaz

| ID | Requisito |
|---|---|
| CD-40 | La mini app tiene dos secciones con su subruta (N-01) y su nombre en la miga de pan (N-07): «Comprobar» (`#/apps/quality`) y «Configuración» (`#/apps/quality/settings`). |
| CD-41 | «Comprobar» muestra los scripts de la carpeta, cada uno con su casilla, todos marcados al principio, y una casilla que marca o desmarca todos los que se ven. «Filtrar» deja ver solo los scripts cuyo nombre contiene el texto, sin distinguir mayúsculas, como el parámetro del script de consola. «Ejecutar» comprueba los marcados que se ven y está desactivado si no hay ninguno. Si falta configuración, lo dice con un enlace a «Configuración». El filtro y «Solo con incidencias» se recuerdan (P-14). |
| CD-42 | Con una comprobación en marcha o terminada, cada script muestra su resultado: «Pendiente», «En marcha», «Correcto», «N filas» («Más de N filas» si no es completo) o «Error». Arriba, el resumen: «La base de datos tiene correctamente todos sus datos», «<N> de <M> scripts con incidencias» o el motivo del fallo, con «Ver consola», que despliega la consola de la comprobación (P-12). Al iniciar se muestra la consola. Con una comprobación en marcha, «Cancelar» sustituye a «Ejecutar». «Solo con incidencias» oculta los scripts correctos. |
| CD-43 | Al pulsar un script con filas se ven debajo en una tabla, con una por conjunto de resultados, sus columnas y `NULL` distinto de la cadena «NULL», y «Se muestran 1000 de N filas» si hay más de las guardadas. Al pulsar uno con error se ven sus líneas de error. |
| CD-44 | El estado se consulta cada segundo mientras hay una comprobación en marcha y la mini app está visible. Oculta, no consulta (N-05); al volver a verse, consulta de inmediato. Al terminar una comprobación que estaba viendo, avisa con el resultado (U-05). |
| CD-45 | «Configuración» es un formulario con los campos de CD-01, «Importar de un .sh…» (CD-05) y «Guardar». El campo de la contraseña está siempre vacío e indica si hay una guardada; solo se envía si se escribe, y se puede marcar «Borrar la contraseña guardada». Un error de formato se muestra junto a su campo. |

## API

Todas las rutas cuelgan de `/api/apps/quality` (P-06) y siguen A-01 a A-03.

| Método | Ruta | Descripción |
|---|---|---|
| GET | /config | Configuración sin la contraseña, `rootPasswordSet` y los campos que faltan (CD-02, CD-03) |
| PUT | /config | Guarda la configuración. 400 `invalid_config` con el campo; 409 `run_running` (CD-01, CD-04) |
| GET | /scripts | Carpeta y ficheros `.sql` (CD-10). 409 `not_configured` |
| GET | /run | Comprobación en marcha o última terminada, o `null` (CD-28) |
| POST | /run | `{"files": null}` o `{"files": ["a.sql"]}`. 202; 400 `invalid_request`, 409 `run_running` o `not_configured` (CD-20) |
| POST | /run/cancel | Cancela la comprobación en marcha (CD-27). 409 `no_run` |
| GET | /run/scripts/{fichero} | Filas de un script en la última comprobación (CD-29). 404 `result_not_found` |

## Fuera de alcance

- Compartir la configuración con «Base de datos»: cada mini app tiene la suya (ADR-0016).
- Crear, editar o borrar scripts de calidad desde la mini app.
- Guardar el histórico de comprobaciones o exportar sus resultados.
- Comprobar otra base que no sea la del contenedor local, o programar comprobaciones periódicas.
