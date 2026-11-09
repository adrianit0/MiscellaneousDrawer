# ADR-0009: Instalación en Ubuntu

- Estado: propuesta (pendiente de confirmar por el usuario)
- Fecha: 2026-11-09
- Requisitos: C-11 a C-15

## Contexto

El usuario pidió un instalador `.sh` que, a partir del proyecto, instale el programa en el equipo con Ubuntu 22.04. La arquitectura lo dejaba para un sprint propio, «como en LiteDD».

- jpackage no genera imágenes para otro sistema: una imagen construida en Windows lleva un ejecutable y un runtime de Windows. El JAR único, en cambio, es portable: incluye la interfaz construida y la librería nativa de SQLite para Linux.
- Compilar el proyecto exige un JDK 21, Node.js 24 o posterior y acceso a los repositorios de Maven y npm. Ubuntu 22.04 trae Java 21 en sus paquetes, pero no Node.js 24, y no se sabe si en ese equipo se podrá compilar. En el de LiteDD no se podía usar Maven.
- `mvnw` y `scripts/dev.sh` estaban en el repositorio sin permiso de ejecución, así que en un clon de Ubuntu no se podían lanzar con `./`.

## Decisión

1. **Por usuario y sin `sudo`.** Aplicación en `~/.local/opt/cajonsastre/`, comando en `~/.local/bin/cajonsastre` (Ubuntu añade esa carpeta al `PATH` al iniciar sesión si existe), lanzador en `~/.local/share/applications/cajonsastre.desktop` e icono en `~/.local/share/icons/hicolor/scalable/apps/`. Las mismas rutas que LiteDD, con el nombre `cajonsastre` (C-08).
2. **Dos entradas en un solo script.** Sin argumentos, `scripts/install.sh` compila el proyecto en el propio equipo con `sh ./mvnw -q -Pdist -DskipTests package` y lo instala; antes comprueba que hay un JDK 21 y Node.js 24, y si no, explica qué falta y la alternativa. Con la ruta de un JAR único, instala ese JAR sin Maven ni Node.js: basta con compilarlo en otro equipo con `./mvnw -Pdist package` y copiarlo junto al proyecto. Las pruebas no se ejecutan al instalar: son cosa de `./mvnw verify`.
3. **`-Pdist` solo genera el JAR único** con `maven-shade-plugin` (complemento de compilación, sin dependencias de ejecución nuevas; versión en ADR-0001). A diferencia de LiteDD, `-Pdist` no ejecuta jpackage: la imagen solo sirve en el sistema donde se genera, así que la genera el instalador en el equipo de destino, venga el JAR de donde venga.
4. **jpackage si se puede, y si no, el JAR.** El instalador busca un Java 21 con `jpackage` al lado y genera la imagen con runtime propio y `-Xmx384m -XX:+UseSerialGC`. Si no lo encuentra, si falla (por ejemplo, un JDK sin los módulos que necesita jlink) o si la imagen no trae `bin/cajonsastre`, instala el JAR con un comando que lo ejecuta con el Java 21 encontrado, por su ruta real y con las mismas opciones. Así no depende de que ese Java sea el predeterminado del sistema.
5. **El icono es el SVG de la interfaz** (`frontend/public/cajonsastre-icon.svg`), instalado en `hicolor/scalable`. jpackage solo acepta PNG en Linux y el icono de la imagen no se usa, porque el lanzador es el nuestro, así que se genera sin `--icon` y no hace falta un PNG en el repositorio.
6. **Sustitución segura.** Primero se compila y se prepara la nueva instalación en una carpeta temporal; solo después se apaga la instancia en marcha con `--stop` y se cambia la carpeta. Si algo falla antes, la instalación anterior sigue intacta.
7. **Permisos de ejecución.** `mvnw`, `scripts/dev.sh`, `scripts/install.sh` y `scripts/uninstall.sh` se guardan en git con modo 755. El instalador llama al wrapper con `sh ./mvnw` para no depender de ello.
8. **Desinstalar no borra datos.** `scripts/uninstall.sh` quita la aplicación, el comando, el lanzador y el icono, y deja los datos, ajustes, copias, registro y perfil de Chrome, como en LiteDD.

## Alternativas descartadas

- **Paquete `.deb` con `jpackage --type deb`.** Exige `sudo`, `fakeroot` y `dpkg-deb`, y no aporta nada a un único usuario.
- **Solo instalar desde un JAR, como LiteDD.** Obliga a compilar en otro equipo aunque en este se pueda; se mantiene como segunda entrada.
- **Ejecutar jpackage en `-Pdist`.** En Windows genera una imagen que no sirve en Ubuntu y duplica lo que ya hace el instalador.

## Consecuencias

- Las pruebas del instalador (`InstallerTest`) ejecutan los scripts de verdad, con `HOME` temporal y un `jpackage` falso, solo en Linux; en Windows se comprueban el lanzador y el contenido de los scripts.
- No hay actualización automática: se actualiza con `git pull` y `scripts/install.sh`, o con un JAR nuevo. Las actualizaciones siguen fuera de alcance. ADR-0010 las añade más tarde: la instalación conserva esta disposición y la actualización solo sustituye su JAR.
- El instalador no instala Java ni Node.js: si faltan, lo dice y termina.
