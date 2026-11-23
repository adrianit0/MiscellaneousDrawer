# Cajón de sastre

Cajón de sastre es una aplicación local para un único usuario que reúne varias **mini apps** de utilidad bajo una misma ventana: un lanzador para elegirlas, una barra lateral para cambiar de una a otra y una navegación común.

Mini apps:

- **Base de datos** prepara la base de datos local de desarrollo y guarda copias de sus volcados (ver «Base de datos»).
- **Calidad del dato** comprueba los datos de la base local con scripts SQL de validación (ver «Calidad del dato»).
- **Cerrar procesos** cierra un programa colgado y los procesos que dejó en sus puertos (ver «Cerrar procesos»).
- **Repositorios** mantiene al día las copias locales de varios repositorios git (ver «Repositorios»).
- **Gestask** lleva el backlog, el tablero, el cierre de tareas, el parte diario, el horario, las tareas diarias y el calendario de Gestask, sobre el mismo Supabase que su versión web (ver «Gestask»).
- **Tableros Jira** junta en tableros propios los tickets de varios proyectos de Jira Cloud, con las columnas que elijas y los estados de cada proyecto en cada una (ver «Tableros Jira»).
- **Reenviar PR** vuelve a pedir en Bitbucket los PR de corrección que se rechazaron al cerrar una versión, con sus commits sobre la rama `hotfix` nueva (ver «Reenviar PR»).
- **Lootboxes** e **Inventario**, en «Ocio», son un rato de descanso para la Daily: cofres que se consiguen con los PE cerrados en «Gestask» y los objetos que salen de ellos (ver «Ocio»).

## Uso

- **Inicio** muestra el buscador y las mini apps fijadas, las recientes y todas, por categoría.
- Las mini apps abiertas siguen en la barra lateral y conservan su estado al cambiar de una a otra.
- **Ir a…** (Ctrl+K) abre cualquier mini app escribiendo parte de su nombre.
- Los enlaces a páginas externas, como el ticket o el PR de una tarea, se abren en el Chrome habitual y no en la ventana de Cajón de sastre.

| Atajo | Acción |
|---|---|
| Ctrl+K | Ir a… |
| Alt+0 | Inicio |
| Alt+1 … Alt+9 | Mini app fijada en esa posición |
| Alt+RePág, Alt+AvPág | Elemento anterior y siguiente de la barra lateral |
| Alt+W | Cerrar la mini app activa |
| Alt+←, Alt+→ | Atrás y adelante |

Todo se guarda en la máquina local, salvo las tareas de «Gestask», que viven en el proyecto de Supabase que se configure en ella. La aplicación solo se conecta a internet en seis casos: para buscar e instalar actualizaciones (ver «Actualizar»), para descargar un volcado de S3 desde «Base de datos» y para traer los cambios de los repositorios git configurados en «Repositorios», los tres porque se pulsa un botón y sin enviar nunca nada; para leer y guardar las tareas de «Gestask» en su Supabase mientras se usa; para que «Tableros Jira» lea los tickets de Jira Cloud, sin cambiar nunca nada; y para que «Reenviar PR» liste los PR en Bitbucket y, cuando se confirma un reenvío, suba las ramas nuevas y cree los PR.

## Base de datos

Prepara la base de datos local en tres pasos, que se pueden marcar por separado:

1. **Descargar** el volcado de una rama (`develop`, `hotfix` o las dos) desde S3. Por bloques, para poder reanudar una descarga interrumpida, o directa.
2. **Importar** un volcado en un contenedor MySQL de Docker. Borra el contenedor y su volumen y los crea de nuevo, así que pide confirmación.
3. **Ejecutar scripts** SQL de la carpeta de pendientes o de una versión, todos o los que se elijan.

Mientras el trabajo corre se ven el estado de cada paso, el progreso de la descarga, el resultado de cada script y el registro de los comandos. Si un paso falla, los siguientes no se ejecutan. Cerrar la ventana no interrumpe un trabajo en marcha.

**Copias.** Al descargar un volcado nuevo, el que había pasa a ser la copia anterior, así que siempre queda el inmediatamente anterior. Además se puede conservar cualquier volcado con un nombre: no se borra solo y no ocupa más disco mientras exista el volcado del que salió. Al importar se elige el actual, el anterior o uno conservado.

**Configuración.** Todo lo que depende del equipo se escribe a mano en la sección «Configuración» de la mini app: carpetas, ruta de S3, contenedor, imagen, puertos, contraseña y scripts iniciales. Se guarda en `~/.config/cajonsastre/apps/database/config.json`, con permisos 600, y la contraseña no vuelve a mostrarse.

«Importar de un .sh…» rellena el formulario con el fichero de configuración de los scripts de consola (`BASE_DIR`, `S3_PATH`, `MYSQL_IMAGE`…; la lista completa está en `specs/requisitos/database.md`, BD-66). El fichero se lee en la ventana y no se envía a ningún sitio. No guarda: dice qué ha rellenado y qué ha omitido, como los scripts iniciales que no traen la ruta completa, y hay que pulsar «Guardar». Si se cambia de sección con cambios sin guardar, pregunta si guardarlos, descartarlos o seguir en «Configuración».

Necesita instalados y en el `PATH`:

- `aws`, la CLI de AWS, con unas credenciales que puedan leer el bucket. Cajón de sastre no pide ni guarda credenciales de AWS: usa las que tenga el usuario, y solo para leer.
- `docker`.

Al terminar un trabajo deja una notificación en la campana de la barra superior. Con `notify-send` y `paplay` instalados, que son opcionales, aparece además en el escritorio y suena; las dos cosas se desactivan en «Ajustes → Notificaciones».

Los comandos de cada trabajo y su salida se ven en el panel «Consolas», que se despliega desde la barra inferior de la ventana: a la izquierda, las consolas con su estado; a la derecha, la salida de la elegida. Solo viven en memoria: se pierden al apagar la aplicación.

## Calidad del dato

Sustituye a `calidad_dato.sh`: ejecuta cada `.sql` de la carpeta de calidad contra el contenedor MySQL de Docker. Un script que no devuelve filas está bien; uno que devuelve filas o falla es una incidencia.

- **Comprobar** lista los scripts de la carpeta, todos marcados. «Filtrar» deja ver los que contienen un texto, como el parámetro del script de consola, y «Ejecutar» comprueba los marcados que se ven. Antes de empezar comprueba que el contenedor está levantado.
- Cada script muestra su resultado: «Correcto», «N filas» o «Error», y arriba aparece el resumen, o «La base de datos tiene correctamente todos sus datos». «Solo con incidencias» oculta los correctos. Al pulsar un script con filas se ven en una tabla (hasta 1000), y al pulsar uno con error, el error.
- Los comandos y las incidencias, como los mostraba el script, van a una consola del panel «Consolas». Al terminar deja una notificación con el resultado.
- **Configuración**: contenedor, contraseña de root, base de datos y carpeta de scripts de calidad, en `~/.config/cajonsastre/apps/quality/config.json` con permisos 600. Son independientes de los de «Base de datos». «Importar de un .sh…» los toma de `CONTAINER_NAME`, `MYSQL_ROOT_PASSWORD`, `DATABASE_NAME` y `QUALITY_SQL_FOLDER`.

Necesita `docker` instalado y en el `PATH`. Los resultados solo viven en memoria hasta la siguiente comprobación.

## Cerrar procesos

Sustituye a `cerrarIntelliJ.sh`: cierra a la fuerza, como `kill -9`, un programa que se ha quedado colgado y los procesos que dejó escuchando en sus puertos.

- Qué se cierra lo dice un **perfil**: un patrón que se busca en la línea de comandos de cada proceso (como `pkill -f`), un rango de puertos TCP, o las dos cosas. Viene uno creado, «IntelliJ IDEA», con el patrón `idea|IntelliJ` y los puertos 8080 a 8090. Se pueden crear, editar y eliminar; se guardan en `~/.config/cajonsastre/apps/processes/profiles.json`.
- Al elegir un perfil se ven los procesos que cerraría en ese momento, con su PID, sus puertos y su comando. **Cerrar todo** cierra los de la tabla y dice cuántos ha cerrado.
- No usa `sudo`: solo cierra procesos del usuario. Un puerto ocupado por un proceso de otro usuario se indica, pero no se puede liberar.
- Cajón de sastre nunca se cierra a sí mismo.

Los puertos se buscan con `ss`, que Ubuntu trae instalado.

## Repositorios

Sustituye a `actualizarAPIS.sh`: mantiene al día las copias locales de varios repositorios git, por ejemplo las API de las que depende un proyecto.

- La **lista** se escribe en la mini app: de cada repositorio, su nombre, su carpeta, la URL de su remoto (HTTPS o SSH, sin contraseña) y su rama por defecto (`develop` si no se dice otra). Se guarda en `~/.config/cajonsastre/apps/repos/repos.json`.
- La tabla muestra de cada uno la rama, si tiene cambios sin confirmar y cuántos commits va por detrás o por delante del remoto según la última consulta. Esto solo lee la copia local.
- Por repositorio: **Actualizar** (`git pull --ff-only` de la rama en la que está), cambiar de rama con el desplegable, **Consultar el remoto** (`git fetch`), **Clonar** el que falta y **Descartar cambios** (`git reset --hard`, con confirmación; no borra ficheros sin seguimiento). Si el `origin` de una copia no es la URL configurada, lo avisa y ofrece cambiarlo.
- **Actualizar todas** pone cada repositorio en su rama por defecto y lo actualiza, sin pararse si uno falla. **Consultar todas** consulta el remoto de todos.
- Solo trae cambios: nunca hace `push`. Nunca crea un commit de mezcla: si una rama no puede avanzar sin más, el comando falla y la copia queda como estaba.
- Cada trabajo escribe sus comandos y su salida en una consola del panel «Consolas» y se puede cancelar. «Actualizar todas», «Consultar todas» y «Clonar» dejan además una notificación al terminar.

Necesita `git` instalado y en el `PATH`, con las credenciales ya configuradas (un ayudante de credenciales o claves SSH). Cajón de sastre no pide ni guarda contraseñas de git: si git necesitara preguntar una, el trabajo falla y la consola lo dice.

## Gestask

Es la aplicación web Gestask dentro de Cajón de sastre. Usa el mismo proyecto de Supabase y las mismas funciones que la web, sin cambiar nada en él: lo que se hace en un lado se ve en el otro.

- **Conexión**: la URL del proyecto de Supabase, su clave publicable, y el email y la contraseña de la cuenta de Gestask (la cuenta se crea en la web). Se guardan en `~/.config/cajonsastre/apps/gestask/config.json`, un fichero privado; la contraseña no vuelve a mostrarse. «Probar conexión» comprueba que se puede iniciar sesión.
- No hay pantalla de acceso: la sesión se inicia sola y, si caduca, se vuelve a iniciar sin que se pierda lo que se estaba haciendo.
- **Backlog**: todas las tareas, con búsqueda y filtros inmediatos, ordenación, y crear (`Alt+N`), editar, clonar y eliminar. El detalle de una tarea permite cambiar su estado y añadir comentarios.
- **Kanban**: una columna por estado; arrastrar una tarjeta a otra columna cambia su estado.
- **Ordenar**: el orden manual de las tareas pendientes, con flechas o arrastrando, y «Ordenar automáticamente».
- **Completar**: el cierre de las tareas terminadas (informar el PR, imputar las horas y cerrar), con «Copiar para Jira» y la imputación masiva.
- **Tareas diarias**: el parte de cada día, con «Nuevo día» para crear el de hoy. En el de hoy se cambia el estado de las tareas; los de días anteriores son de solo lectura.
- **Horario diario**: la agenda del parte según los puntos de esfuerzo y la jornada configurada en Gestask (inicio, fin, descanso y jornada intensiva), con «Incluir horas» para planificar horas extra. Arriba, las tareas diarias del parte para marcarlas como realizadas.
- **Diarias**: las tareas recurrentes que se añaden a cada parte hasta que se finalizan, y las que quedan por realizar, de hoy y atrasadas. La pestaña muestra cuántas faltan: en ámbar si son de hoy y en rojo si hay alguna atrasada.
- **Calendario**: los días laborables del mes con los puntos completados frente al objetivo del día; pulsar un día lo marca como vacaciones, festivo o ausencia.
- `Alt+R` actualiza los datos. No hay copia local: sin conexión con Supabase la mini app no muestra tareas.

«Rendimiento» y la configuración de parámetros de la web llegarán en una versión próxima.

## Tableros Jira

Tableros propios sobre varios proyectos de Jira Cloud a la vez, aunque cada proyecto tenga su flujo y sus estados. Solo lee de Jira: no mueve, asigna ni cambia ningún ticket.

- **Conexión**: la dirección de Jira Cloud (`https://<empresa>.atlassian.net`), el email de tu cuenta de Atlassian y un token de API, que se crea en `id.atlassian.com`, en «Seguridad» › «Tokens de API». Se guarda en `~/.config/cajonsastre/apps/jira/config.json`, un fichero privado; el token no vuelve a mostrarse. «Probar conexión» dice con qué cuenta entra. Los tokens caducan: si deja de funcionar, crea otro y guárdalo.
- **Configurar tableros**: hasta 20 tableros, cada uno con su nombre, de 1 a 10 proyectos y hasta 12 columnas. En cada columna se eligen los estados de cada proyecto que le corresponden: «testing» de un proyecto y «En pruebas» de otro pueden ir juntos en «Testing». «Estados sin columna» dice qué estados no están en ninguna, porque sus tickets no se verán. Cada estado tiene su color, elegido entre ocho (al añadirlo, gris, azul o verde según su categoría de Jira). En «Prioridades» se eligen las prioridades de tu Jira que quieres ver en ese tablero, cada una con su color.
- La **última columna** es la de cerrados: solo muestra los tickets actualizados en los últimos 14 días, para que no crezca sin fin.
- **Tableros**: el tablero elegido con una tarjeta por ticket: la clave y el estado de Jira como etiqueta de su color; el resumen; el asignado con un círculo con sus iniciales, de un color propio de cada persona; y la prioridad con `⌃` en su color (en gris si el tablero no la tiene). La clave abre el ticket en el Chrome habitual. «Agrupar por» reparte los tickets en filas por proyecto o por asignado, y el filtro busca por clave, resumen o asignado. Se consulta al abrirlo, al cambiar de tablero y con «Actualizar», hasta 1000 tickets por tablero.
- Si en Jira desaparece un estado que estaba en una columna, el tablero lo avisa y lleva a su configuración.

## Reenviar PR

Para equipos que piden los PR de corrección contra una rama `hotfix`, con una rama por ticket de Jira (`bug/<CLAVE>`), y que al cerrar una versión borran `hotfix`, la crean otra vez desde `develop` y dejan rechazados los PR que no entraron. La mini app los vuelve a pedir en un paso.

- **Conexión**: la URL de Bitbucket Data Center, un token de acceso HTTP con permiso de escritura en el repositorio, el proyecto, el repositorio, tu usuario de Bitbucket y la carpeta de tu copia local. Opcionales: la rama destino (`hotfix`) y el prefijo de las ramas (`bug/`). Se guarda en `~/.config/cajonsastre/apps/resubmit/config.json`, un fichero privado; el token no vuelve a mostrarse. «Probar conexión» lee el repositorio.
- **PR rechazados**: tus PR contra la rama destino rechazados en los últimos 30 días que aún no has vuelto a pedir, con la rama nueva que tendrá cada uno: `bug/TICKET-0001` pasa a `bug/TICKET-0001-2`, y a `-3` si esa ya existe. Los que no se pueden reenviar (una rama con otro formato o un PR desde un fork) se ven atenuados con el motivo.
- **Reenviar seleccionados** pide confirmación y, por cada PR, aplica sus commits con `git cherry-pick` sobre la rama destino nueva, sube la rama nueva y crea el PR con el mismo título, los mismos revisores y la misma descripción, terminada en «Procede de: <enlace al PR anterior>». Son sus commits los que no están ya en la rama destino, sin los de mezcla.
- Creado el PR nuevo, añade al final de la descripción del rechazado «Nuevo PR: <enlace>» y «**Pendiente de eliminar esta rama**», para saber qué ramas se pueden borrar. La rama no la borra: eso queda para ti. Si Bitbucket no deja editar el rechazado, el resultado dice «PR anterior sin anotar».
- Si un commit da conflicto, ese PR no se sube ni se anota: se avisa con el commit y los ficheros, y se sigue con el siguiente. Ese se rehace a mano.
- Los commits se aplican en una copia aparte que se borra al terminar: tu copia local no cambia de rama ni de ficheros. Solo se sube la rama nueva, sin forzar y nunca sobre una que ya exista.
- El trabajo escribe sus comandos en una consola del panel «Consolas», se puede cancelar y deja una notificación con el resumen («2 recreados, 1 con conflictos»).

Necesita `git` con las credenciales del repositorio ya configuradas, como «Repositorios», y que el `origin` de la carpeta sea el repositorio configurado. Si Bitbucket usa un certificado de una autoridad propia de la empresa, Java debe confiar en ella.

## Ocio

Dos mini apps para despejarse unos minutos durante la Daily, sin que interfieran en el trabajo. Todo cabe en 20 minutos al día como mucho.

- **Lootboxes**: cada PE cerrado en «Gestask» da un cofre, hasta 8 al día. Los PE de un día son los que muestra su calendario, y llegan cuando se abre «Gestask» en Cajón de sastre: cuentan también las tareas cerradas desde la web. Los cofres de un día se desbloquean a las 8:00 del día siguiente y no caducan. Hasta entonces no se ven: conseguir uno no se anuncia en ningún sitio.
- Cada cofre da de 1 a 3 orbes: blanco (80 %), verde (16 %), azul (3,2 %), morado (0,65 %) o dorado (0,15 %). «Abrir» muestra una animación de 3 s como mucho, que se salta pulsando o con Enter, Espacio o Esc; «Abrir todos» los abre de una vez y resume lo obtenido. Solo cuentan los días desde que se abrió «Lootboxes» por primera vez.
- **Inventario**: los orbes conseguidos, con cuántos hay de cada uno, del más raro al más común.

## Requisitos

- JDK 21
- Node.js 24 o superior (solo para compilar)
- Para la ventana de aplicación: Google Chrome (si no está, se usa el navegador por defecto)

## Instalar en Ubuntu

La instalación es para el usuario actual y no necesita `sudo`. Desde la carpeta del proyecto:

```bash
sudo apt install openjdk-21-jdk
```

```bash
scripts/install.sh
```

Compila el proyecto (hace falta además Node.js 24 o superior) y deja:

- la aplicación en `~/.local/opt/cajonsastre/`, con su propio runtime de Java si el JDK incluye `jpackage`;
- el comando `cajonsastre` en `~/.local/bin/`;
- el icono «Cajón de sastre» en «Mostrar aplicaciones», que se puede anclar al dock.

Si en ese equipo no se puede compilar, se genera el JAR en otro con `./mvnw -Pdist package`, se copia `target/dist/cajonsastre.jar` a la carpeta del proyecto y se instala sin Maven ni Node.js (basta con Java 21):

```bash
scripts/install.sh cajonsastre.jar
```

Volver a ejecutar el instalador apaga la aplicación si está en marcha y la sustituye. Para desinstalarla, `scripts/uninstall.sh`; los datos y los ajustes se conservan.

## Actualizar

Cada cambio que llega a la rama `master` publica en GitHub una versión firmada, siempre que pasen todas las pruebas. Para instalarla desde la aplicación:

1. En «Ajustes → Actualizaciones», escribe la URL del repositorio (`https://github.com/<propietario>/<repositorio>`) y pulsa «Guardar».
2. Vuelve a «Ajustes → Actualizaciones» y pulsa «Buscar actualizaciones». Si hay una versión nueva, se muestran su build, su fecha y sus cambios.
3. «Actualizar» pide confirmación, descarga la versión, comprueba su firma y su hash y reinicia la aplicación. La ventana se recarga sola.

La aplicación solo contacta con GitHub al pulsar esos botones, no envía ningún dato tuyo y nunca se actualiza sola. Solo funciona en la instalación de Ubuntu. Si la versión nueva no arranca en 60 s, vuelve a la anterior y lo explica en `~/.local/state/cajonsastre/update.log`. Actualizar solo sustituye la aplicación: los cambios en el instalador o en el lanzador siguen exigiendo `scripts/install.sh`.

La primera vez hay que instalar a mano una versión que ya traiga el actualizador, por ejemplo el `cajonsastre.jar` de la última release:

```bash
scripts/install.sh cajonsastre.jar
```

Para publicar, el repositorio necesita el secreto de GitHub Actions `CAJONSASTRE_RELEASE_KEY` con la clave privada Ed25519 cuya pública está en `src/main/resources/dev/cajonsastre/update/release-key.pub`. La clave privada nunca entra en el repositorio.

## Compilar y probar

```bash
./mvnw verify
```

Compila el backend y la interfaz y ejecuta todas las pruebas. Con `-Dskip.frontend` se omite la interfaz. `./mvnw -Pdist package` genera además el JAR único `target/dist/cajonsastre.jar`, que se ejecuta con `java -jar`.

## Desarrollo

```bash
scripts/dev.sh
```

Arranca el servidor en `http://127.0.0.1:47800/` y la interfaz con recarga en caliente en `http://127.0.0.1:5174/`.

Opciones de línea de comandos. Sin instalar, se pasan con `./mvnw -Dskip.frontend exec:java -Dexec.mainClass=dev.cajonsastre.Main -Dexec.args="…"`.

```text
cajonsastre                 arranca y abre la ventana; si ya está en marcha, solo abre la ventana
cajonsastre --no-window     arranca sin abrir ventana
cajonsastre --port 47900    usa otro puerto (por defecto, el de «Ajustes», 47800)
cajonsastre --stop          apaga la instancia en marcha
```

## Dónde están los datos

| Qué | Dónde |
|---|---|
| Ajustes | `~/.config/cajonsastre/config.json` |
| Estado de la interfaz | `~/.local/share/cajonsastre/cajonsastre.db` |
| Datos de cada mini app | `~/.local/share/cajonsastre/apps/<id>/` |
| Configuración de cada mini app | `~/.config/cajonsastre/apps/<id>/` |
| Volcados de «Base de datos» y sus copias | La carpeta de trabajo que se indique en su configuración, y `backups/` dentro de ella |
| Copias previas a cada migración | `~/.local/share/cajonsastre/backups/` |
| Registro | `~/.local/state/cajonsastre/cajonsastre.log` (rota a 5 MB, 3 ficheros) |
| Registro de la última actualización | `~/.local/state/cajonsastre/update.log` |

## Especificación

La especificación completa está en [`specs/`](specs/). El desarrollo sigue un método guiado por especificación: cada funcionalidad tiene un requisito con identificador y al menos una prueba que lo cita. Cómo se integra una mini app está en [`specs/diseno/mini-apps.md`](specs/diseno/mini-apps.md).

## Licencia

[MIT](LICENSE)
