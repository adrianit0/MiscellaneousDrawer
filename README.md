# Cajón de sastre

Cajón de sastre es una aplicación local para un único usuario que reúne varias **mini apps** de utilidad bajo una misma ventana: un lanzador para elegirlas, una barra lateral para cambiar de una a otra y una navegación común.

Mini apps:

- **Base de datos** prepara la base de datos local de desarrollo y guarda copias de sus volcados (ver «Base de datos»).
- **Tareas**, un gestor de tareas, aparece como «En preparación».

## Uso

- **Inicio** muestra el buscador y las mini apps fijadas, las recientes y todas, por categoría.
- Las mini apps abiertas siguen en la barra lateral y conservan su estado al cambiar de una a otra.
- **Ir a…** (Ctrl+K) abre cualquier mini app escribiendo parte de su nombre.

| Atajo | Acción |
|---|---|
| Ctrl+K | Ir a… |
| Alt+0 | Inicio |
| Alt+1 … Alt+9 | Mini app fijada en esa posición |
| Alt+RePág, Alt+AvPág | Elemento anterior y siguiente de la barra lateral |
| Alt+W | Cerrar la mini app activa |
| Alt+←, Alt+→ | Atrás y adelante |

Todo se guarda en la máquina local. La aplicación solo se conecta a internet en dos casos, y siempre porque se pulsa un botón: para buscar e instalar actualizaciones (ver «Actualizar») y para descargar un volcado de S3 desde «Base de datos».

## Base de datos

Prepara la base de datos local en tres pasos, que se pueden marcar por separado:

1. **Descargar** el volcado de una rama (`develop`, `hotfix` o las dos) desde S3. Por bloques, para poder reanudar una descarga interrumpida, o directa.
2. **Importar** un volcado en un contenedor MySQL de Docker. Borra el contenedor y su volumen y los crea de nuevo, así que pide confirmación.
3. **Ejecutar scripts** SQL de la carpeta de pendientes o de una versión, todos o los que se elijan.

Mientras el trabajo corre se ven el estado de cada paso, el progreso de la descarga, el resultado de cada script y el registro de los comandos. Si un paso falla, los siguientes no se ejecutan. Cerrar la ventana no interrumpe un trabajo en marcha.

**Copias.** Al descargar un volcado nuevo, el que había pasa a ser la copia anterior, así que siempre queda el inmediatamente anterior. Además se puede conservar cualquier volcado con un nombre: no se borra solo y no ocupa más disco mientras exista el volcado del que salió. Al importar se elige el actual, el anterior o uno conservado.

**Configuración.** Todo lo que depende del equipo se escribe a mano en la sección «Configuración» de la mini app: carpetas, ruta de S3, contenedor, imagen, puertos, contraseña y scripts iniciales. Se guarda en `~/.config/cajonsastre/apps/database/config.json`, con permisos 600, y la contraseña no vuelve a mostrarse.

Necesita instalados y en el `PATH`:

- `aws`, la CLI de AWS, con unas credenciales que puedan leer el bucket. Cajón de sastre no pide ni guarda credenciales de AWS: usa las que tenga el usuario, y solo para leer.
- `docker`.

Al terminar un trabajo deja una notificación en la campana de la barra superior. Con `notify-send` y `paplay` instalados, que son opcionales, aparece además en el escritorio y suena; las dos cosas se desactivan en «Ajustes → Notificaciones».

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
