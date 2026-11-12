# Requisitos de «Base de datos»

La mini app «Base de datos» (`database`) prepara la base de datos local de desarrollo en tres pasos: **descarga** un volcado desde S3, lo **importa** en un contenedor MySQL de Docker y **ejecuta** los scripts SQL pendientes. Además guarda una **biblioteca de copias** de los volcados descargados. Las decisiones están en [ADR-0011](../decisiones/ADR-0011-mini-app-base-de-datos.md).

Todo lo que depende del equipo (carpetas, ruta de S3, contenedor, contraseña…) se escribe a mano en su «Configuración» y no está en el código ni en el repositorio (S-32). Los ejemplos usan marcadores. Prefijo de requisitos: **BD**.

Términos:

- **Rama**: `develop` o `hotfix`. Cada una tiene su volcado y sus copias.
- **Volcado actual**: el último descargado de una rama, en `<carpeta de trabajo>/BBDD_<rama><sufijo local>`.
- **Copia anterior**: el volcado que era el actual antes de la última descarga. Es automática y hay como mucho una por rama.
- **Copia conservada**: un volcado que el usuario ha guardado con un nombre. Nunca se borra sola.
- **Trabajo**: una ejecución de uno o varios pasos.

## Configuración

| ID | Requisito |
|---|---|
| BD-01 | La sección «Configuración» guarda los valores de la tabla siguiente en `<config>/apps/database/config.json`, con permisos 600 (S-20, P-09). Todos nacen vacíos. Se pueden guardar a medias: lo que se valida al guardar es el formato de cada valor escrito, y un valor con formato incorrecto impide guardar e indica el campo. |
| BD-02 | La contraseña nunca sale del servidor: `GET /config` devuelve `rootPasswordSet` en su lugar. Al guardar, si `rootPassword` no viene o es `null`, se conserva la guardada; si viene, la sustituye, y la cadena vacía la borra. |
| BD-03 | Cada paso necesita sus campos (columna «Pasos»). `GET /config` devuelve, por paso, los que faltan. Un paso al que le faltan campos aparece desactivado en la interfaz con la lista de lo que falta, y el servidor rechaza un trabajo que lo incluya con 409 `not_configured`. |
| BD-04 | Mientras hay un trabajo en marcha no se puede guardar la configuración: 409 `job_running`. |

| Campo | Clave | Formato | Pasos |
|---|---|---|---|
| Carpeta de trabajo | `workDir` | Ruta absoluta | Descargar, importar, copias |
| Ruta de S3 | `s3Path` | `s3://<bucket>` o `s3://<bucket>/<prefijo>`, sin `/` final | Descargar |
| Sufijo del fichero en S3 | `s3Suffix` | 1 a 100 caracteres, sin `/` ni `\` | Descargar |
| Sufijo del fichero local | `localSuffix` | 1 a 100 caracteres, sin `/` ni `\` | Descargar, importar, copias |
| Contenedor | `containerName` | `[A-Za-z0-9][A-Za-z0-9_.-]*`, hasta 63 caracteres | Importar, ejecutar |
| Imagen de MySQL | `mysqlImage` | Letras, cifras y `_ . : / @ -`; empieza por letra o cifra; hasta 200 caracteres | Importar |
| Contraseña de root | `rootPassword` | 1 a 200 caracteres | Importar, ejecutar |
| Puerto en la máquina | `hostPort` | 1 a 65535 | Importar |
| Puerto del contenedor | `containerPort` | 1 a 65535 | Importar |
| Zona horaria | `timeZone` | `[A-Za-z0-9_+/-]`, 1 a 64 caracteres | Importar |
| Script inicial | `initSqlFile` | Ruta absoluta | Importar |
| Segundo script inicial | `secondInitSqlFile` | Ruta absoluta | Importar |
| Base de datos | `databaseName` | `[A-Za-z0-9_$-]`, 1 a 64 caracteres, sin empezar por `-` | Ejecutar |
| Carpeta de scripts pendientes | `pendingSqlDir` | Ruta absoluta | Ejecutar |
| Carpeta de versiones | `versionsSqlDir` | Ruta absoluta; solo hace falta para ejecutar los scripts de una versión | Ejecutar |

## Trabajos

| ID | Requisito |
|---|---|
| BD-10 | Un trabajo tiene una rama y de uno a tres pasos, que se ejecutan siempre en este orden: descargar, importar y ejecutar scripts. Solo puede haber un trabajo en marcha: pedir otro responde 409 `job_running`. |
| BD-11 | La rama es `develop`, `hotfix` o `both` («Ambas»). Con «Ambas» solo se puede descargar: un trabajo con «Ambas» que incluya importar o ejecutar se rechaza con 400 `invalid_request`. |
| BD-12 | Si un paso falla, los siguientes no se ejecutan y quedan como omitidos. El trabajo termina como `failed`. La excepción son los scripts SQL entre sí (BD-52). |
| BD-13 | `GET /job` devuelve el trabajo en marcha o el último terminado: estado (`running`, `succeeded`, `failed` o `cancelled`), fechas, y cada paso con su estado (`pending`, `running`, `done`, `failed` o `skipped`), su mensaje y su progreso, y el identificador de su consola (`consoleId`, BD-14). El último trabajo terminado se conserva en memoria hasta que empieza otro o se apaga la aplicación. |
| BD-14 | Cada trabajo abre una consola de la plataforma (P-25, ADR-0014) con el nombre «Trabajo <número> · <rama>» («Hotfix», «Develop» o «Ambas»), y escribe en ella los comandos ejecutados y su salida, línea a línea: ese es el registro del trabajo. Al terminar el trabajo, la consola termina con su mismo estado: `succeeded`, `failed` o `cancelled`. El registro solo vive en memoria (P-26): no va al registro del shell (S-21) ni a disco. |
| BD-15 | «Cancelar» termina el comando en curso y sus procesos hijos, y el trabajo queda `cancelled`. Una descarga a medias se conserva para reanudarla (BD-24). Las esperas del paso de importación también se cancelan. |
| BD-16 | La contraseña nunca aparece en una línea de comandos ni en ningún registro: se pasa a `docker` por variables de entorno (`MYSQL_ROOT_PASSWORD` y `MYSQL_PWD`). |
| BD-17 | Al terminar un trabajo se emite una notificación de la plataforma (P-21, ADR-0013) que lleva a «Preparar»: «El trabajo ha terminado correctamente», de tipo `success`, o «El trabajo ha terminado con errores», de tipo `error`. Un trabajo cancelado no emite ninguna. El sonido y la notificación de escritorio son cosa del shell (P-24). |
| BD-18 | Al apagarse la aplicación se cancela el trabajo en marcha (P-10). |
| BD-19 | Los comandos externos (`aws`, `docker`) se ejecutan sin las variables `_JPACKAGE_LAUNCHER` y `LD_LIBRARY_PATH` que la aplicación hereda de su lanzador. Si un comando no existe, el paso falla y lo dice: «No se encontró el comando «aws»». |

## Descarga

| ID | Requisito |
|---|---|
| BD-20 | La descarga usa el comando `aws` instalado, con las credenciales que ya tenga el usuario. La mini app no pide, lee ni guarda credenciales de AWS. Solo contacta con S3 dentro de un trabajo que incluye «Descargar»: nunca al arrancar, al abrir la mini app ni de forma periódica. Solo lee: `s3api head-object`, `s3api get-object` y `s3 cp` de S3 a local (ADR-0011). |
| BD-21 | El volcado de una rama es el objeto `<prefijo>/BBDD_<rama><sufijo en S3>` del bucket de `s3Path`, y se guarda como volcado actual. Con «Ambas» se descarga primero `hotfix` y después `develop`. |
| BD-22 | Antes de descargar se consulta el objeto: tamaño, fecha de modificación y ETag. Si el volcado actual tiene ese tamaño y esa fecha, no se descarga ni se rota (BD-31) y el registro dice «Ya tienes el último volcado». Con la opción «Descargar aunque no haya cambiado» se descarga igualmente y sustituye al actual sin rotar. |
| BD-23 | Modo «Por bloques», el predeterminado: descarga a `<destino>.part` en bloques de 100 MiB con `get-object --range` y `--if-match <ETag>`. Cada bloque va a un fichero temporal, se comprueba su tamaño exacto y solo entonces se añade. Un bloque se reintenta hasta 10 veces, con 10 s de espera. Si agota los reintentos, la descarga falla y lo ya descargado se conserva. |
| BD-24 | Junto a `<destino>.part` se guarda `<destino>.part.json` con el ETag y el tamaño del objeto. Una descarga a medias se reanuda solo si coinciden con los del objeto actual y no es mayor que él. Si no, se descarta y se empieza de cero. |
| BD-25 | Al completar una descarga se comprueba el tamaño total y se pone al fichero la fecha de modificación del objeto. Después se rota (BD-31) y `<destino>.part` pasa a ser el volcado actual. Si algo falla antes de ese momento, el volcado actual y sus copias quedan como estaban. |
| BD-26 | Modo «Directa»: una sola llamada `aws s3 cp` a `<destino>.part`, sin reanudación; una descarga a medias anterior se descarta. Al completar, igual que BD-25. |
| BD-27 | El paso informa del progreso del volcado en curso. En el modo «Por bloques», con los bytes descargados y totales. En el modo «Directa», con el texto de progreso que va dando la propia CLI: las líneas que un comando sobrescribe en la consola se muestran como mensaje del paso y no llenan el registro. |
| BD-28 | Después de los volcados se descargan `<s3Path>/dynamodb/Dockerfile` y `<s3Path>/dynamodb/dynamo-db-dump.tar.bz2` a `<carpeta de trabajo>/dynamodb/`. Cada uno se descarga a un `.part` que sustituye al fichero anterior solo si la descarga termina bien. |
| BD-29 | Dentro del paso se intentan todas las descargas aunque una falle. El paso termina como `failed` si falló alguna. |

## Biblioteca de copias

| ID | Requisito |
|---|---|
| BD-30 | Las copias de una rama están en `<carpeta de trabajo>/backups/<rama>/`: la anterior como `auto-<AAAAMMDD-HHmmss>.tar.gz` y las conservadas como `kept-<AAAAMMDD-HHmmss>-<nombre>.tar.gz`, con la fecha de modificación del volcado en la hora local. El sistema de ficheros es la única fuente de verdad: no hay base de datos. Los ficheros que no siguen ese patrón se ignoran. |
| BD-31 | **Rotación.** Cuando una descarga sustituye al volcado actual, el que había pasa a ser la copia anterior, renombrándolo, y la copia anterior que hubiera se borra. Se borra al final, cuando el volcado nuevo ya está en su sitio. Así siempre queda como copia el volcado inmediatamente anterior. Si no se puede colocar el nuevo, el que había vuelve a su sitio. |
| BD-32 | **Conservar.** A partir del volcado actual o de la copia anterior se crea una copia conservada con un nombre. Es un enlace duro: no duplica el espacio en disco y el original sigue en su sitio. Si el sistema de ficheros no admite enlaces duros, se informa y no se copia. |
| BD-33 | El nombre de una copia conservada tiene de 1 a 40 caracteres: letras, cifras, espacios, `-`, `_` y `.`; empieza y acaba por letra o cifra. No se puede repetir dentro de una rama, sin distinguir mayúsculas: 409 `name_taken`. |
| BD-34 | **Eliminar.** Se puede borrar la copia anterior o una conservada. El volcado actual no se puede borrar desde la mini app. |
| BD-35 | `GET /dumps` devuelve, por rama, el volcado actual, la copia anterior y las conservadas, de la más reciente a la más antigua, cada una con tamaño y fecha. También la descarga a medias, si la hay, con sus bytes y su total. |
| BD-36 | Mientras hay un trabajo en marcha no se puede conservar ni eliminar: 409 `job_running`. |
| BD-37 | La rama y el nombre de fichero que llegan por la API se validan contra BD-30 antes de tocar el disco. Nunca se usa una ruta recibida del cliente. |

## Importación

| ID | Requisito |
|---|---|
| BD-40 | Se importa un volcado de la rama elegida: el actual (por defecto), la copia anterior o una conservada. Si el fichero no existe, el paso falla sin tocar Docker. |
| BD-41 | La secuencia es esta, y cada comando y su salida van a la consola del trabajo (BD-14):<br>1. `docker stop <contenedor>`, `docker rm <contenedor>` y `docker volume rm <contenedor>-data`. Sus fallos se ignoran, porque puede que no existan.<br>2. `docker volume create <contenedor>-data`.<br>3. `docker run -d -p <puerto máquina>:<puerto contenedor> --name <contenedor> --restart always -e MYSQL_ROOT_PASSWORD -e TZ=<zona> --mount src=<contenedor>-data,dst=/var/lib/mysql <imagen> --lower-case-table-names=1 --sql_mode=NO_ENGINE_SUBSTITUTION`.<br>4. Espera de 20 s.<br>5. `docker stop <contenedor>`.<br>6. `docker run --rm --volumes-from <contenedor> -v <volcado>:/dump.tar.gz:ro ubuntu bash -c "cd /var/lib/mysql && tar xzvf /dump.tar.gz --strip 3"`.<br>7. `docker start <contenedor>`.<br>8. Espera de 20 s.<br>9. El script inicial y el segundo script inicial, en ese orden, con `docker exec -i -e MYSQL_PWD <contenedor> mysql --default-character-set=utf8 -uroot` y el fichero por la entrada estándar.<br>Un fallo en los pasos 2 a 9 detiene la importación. |
| BD-42 | Importar borra el contenedor y su volumen. La interfaz pide confirmación antes de iniciar un trabajo que incluya «Importar», con el resumen de lo que se va a hacer (U-05). |

## Scripts SQL

| ID | Requisito |
|---|---|
| BD-50 | Los scripts se toman de una carpeta: «Pendientes» (`pendingSqlDir`) o una versión, que es una subcarpeta directa de `versionsSqlDir`. `GET /scripts` devuelve las versiones, de la más alta a la más baja comparando sus números, y los ficheros `.sql` de la carpeta pedida, por orden de nombre. |
| BD-51 | Se ejecutan todos los `.sql` de la carpeta o solo los elegidos, siempre por orden de nombre, cada uno con `docker exec -i -e MYSQL_PWD <contenedor> mysql --default-character-set=utf8 -uroot <base de datos>` y el fichero por la entrada estándar. |
| BD-52 | Si un script falla, se anota su error y se sigue con el siguiente. Cada script queda con su resultado, `ok` o `error`, y las últimas líneas de su salida de error. El paso termina como `failed` si falló alguno. |
| BD-53 | La versión y los nombres de fichero que llegan por la API son nombres simples, sin `/`, `\` ni `..`, y deben existir en su carpeta: si no, 400 `invalid_request`. |
| BD-54 | Si la carpeta no existe, el paso falla y lo dice. Si no tiene ningún `.sql`, el paso termina bien con «No hay scripts que ejecutar». |

## Interfaz

| ID | Requisito |
|---|---|
| BD-60 | La mini app tiene tres secciones con su subruta (N-01) y su nombre en la miga de pan (N-07): «Preparar» (`#/apps/database`), «Copias» (`#/apps/database/dumps`) y «Configuración» (`#/apps/database/settings`). |
| BD-61 | «Preparar» muestra la rama («Develop», «Hotfix» o «Ambas») y los tres pasos, cada uno con su casilla: «Descargar», con el modo y «Descargar aunque no haya cambiado»; «Importar», con el volcado a importar; y «Ejecutar scripts», con la carpeta y la lista de sus ficheros, todos marcados al principio. «Iniciar» está desactivado si no hay ningún paso marcado. La rama, los pasos marcados y el modo se recuerdan (P-14). |
| BD-62 | Con un trabajo en marcha o terminado, «Preparar» muestra cada paso con su estado, la barra de progreso de la descarga con bytes y porcentaje, el resultado de cada script y «Ver consola», que despliega el panel de consolas del shell con la del trabajo (P-12, N-15); el registro ya no se muestra en la mini app. Al iniciar un trabajo se muestra su consola. Con un trabajo en marcha se muestra «Cancelar» en lugar de «Iniciar». |
| BD-63 | El estado del trabajo se consulta cada segundo mientras hay uno en marcha y la mini app está visible. Oculta, no consulta (N-05); al volver a verse, consulta de inmediato. Al terminar un trabajo que estaba viendo, avisa con el resultado (U-05). |
| BD-64 | «Copias» muestra, por rama, el volcado actual, la copia anterior y las conservadas, con nombre, fecha (dd/MM/yyyy HH:mm) y tamaño (U-02). Acciones: «Conservar», que pide el nombre; «Importar», que lleva a «Preparar» con esa rama y ese volcado elegidos; y «Eliminar», que pide confirmación (U-05). |
| BD-65 | «Configuración» es un formulario con los campos de BD-01 agrupados en «Descarga», «Docker y MySQL» y «Scripts», con «Guardar». El campo de la contraseña está siempre vacío e indica si hay una guardada; solo se envía si se escribe. Un error de formato se muestra junto a su campo. |

## API

Todas las rutas cuelgan de `/api/apps/database` (P-06) y siguen A-01 a A-03.

| Método | Ruta | Descripción |
|---|---|---|
| GET | /config | Configuración sin la contraseña, `rootPasswordSet` y los campos que faltan por paso (BD-02, BD-03) |
| PUT | /config | Guarda la configuración. 400 `invalid_config` con el campo; 409 `job_running` (BD-01, BD-04) |
| GET | /dumps | Biblioteca por rama (BD-35). 409 `not_configured` |
| POST | /dumps/keep | `{"branch", "source", "name"}`: conserva el volcado actual (`"current"`) o la copia anterior (su nombre de fichero) (BD-32, BD-33). 409 `name_taken` o `links_unsupported` |
| DELETE | /dumps/{branch}/{file} | Borra una copia (BD-34). 404 `dump_not_found` |
| GET | /scripts | Versiones y ficheros de la carpeta de `?version=`; sin parámetro, «Pendientes» (BD-50) |
| GET | /job | Trabajo en marcha o último terminado, con el identificador de su consola (BD-13, BD-14) |
| POST | /job | Inicia un trabajo. 400 `invalid_request`, 409 `job_running` o `not_configured` (BD-10, BD-11) |
| POST | /job/cancel | Cancela el trabajo en marcha (BD-15). 409 `no_job` si no hay ninguno |

Cuerpo de `POST /job`. Un paso que no viene o es `null` no se ejecuta:

```json
{
  "branch": "hotfix",
  "download": { "mode": "chunked", "force": false },
  "import": { "dump": "current" },
  "scripts": { "version": null, "files": null }
}
```

- `download.mode`: `chunked` («Por bloques») o `direct` («Directa»).
- `import.dump`: `current` o el nombre de fichero de una copia de esa rama (BD-30).
- `scripts.version`: `null` para «Pendientes» o el nombre de una versión. `scripts.files`: `null` para todos o la lista de nombres.

## Fuera de alcance

- Guardar una instantánea de la base de datos en uso (el volumen de Docker) antes de importar.
- Adoptar los ficheros `.backup` que dejaban los scripts de consola: no se tocan y se pueden borrar a mano.
- Consultar la base de datos, editar scripts o moverlos de «Pendientes» a una versión.
- Subir nada a S3, o cualquier otro uso de AWS.
- Un perfil o una región de AWS propios de la mini app: se usan los del usuario.
