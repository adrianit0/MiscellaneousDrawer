# Sprint 1: Instalación en Ubuntu

## Objetivo

Instalar Cajón de sastre en el equipo con Ubuntu 22.04 a partir del proyecto, con un comando y un icono en el escritorio, sin `sudo` y sin tocar los datos. Las actualizaciones automáticas quedan fuera.

## Requisitos cubiertos

- Ciclo de vida: C-11 a C-15.

Documentos: [requisitos/ciclo-de-vida.md](../requisitos/ciclo-de-vida.md), [diseno/arquitectura.md](../diseno/arquitectura.md), [ADR-0009](../decisiones/ADR-0009-instalacion-en-ubuntu.md).

## Tareas

1. Especificación: C-11 a C-15, ADR-0009 y `maven-shade-plugin` en ADR-0001.
2. Perfil `-Pdist` con el JAR único `target/dist/cajonsastre.jar`.
3. `packaging/cajonsastre.desktop`, `scripts/install.sh` y `scripts/uninstall.sh`.
4. Permisos de ejecución en git para `mvnw` y los scripts.
5. Pruebas `InstallerTest`.
6. `README.md` y `CLAUDE.md`.

## Criterios de aceptación

- `./mvnw verify` termina en verde.
- `./mvnw -Pdist package` genera un JAR que arranca con `java -jar`, sirve la interfaz y se apaga con `--stop`.
- En Ubuntu, `scripts/install.sh` deja el comando `cajonsastre` y el icono «Cajón de sastre», que arranca la aplicación con un clic y agrupa su ventana bajo ese icono.
- En Ubuntu, `scripts/install.sh target/dist/cajonsastre.jar` instala sin Maven ni Node.js.
- `scripts/uninstall.sh` quita la aplicación y conserva los datos.

## Resultado

Fecha: 2026-11-09.

### Hecho

- Especificación: C-11 a C-15 en `requisitos/ciclo-de-vida.md`, ADR-0009, `maven-shade-plugin` 3.6.2 en ADR-0001 y `diseno/arquitectura.md` actualizada.
- `pom.xml`: perfil `dist` con el JAR único `target/dist/cajonsastre.jar` (24 MB, con la interfaz, las dependencias y los `META-INF/services` unidos).
- `scripts/install.sh` (compila o recibe un JAR; imagen de jpackage o JAR con el Java encontrado; prepara aparte, apaga y sustituye), `scripts/uninstall.sh` y `packaging/cajonsastre.desktop`. El icono es el SVG de la interfaz.
- `mvnw`, `scripts/dev.sh`, `scripts/install.sh` y `scripts/uninstall.sh` con modo 755 en git.
- `InstallerTest`: 8 pruebas. Las 3 de lanzador y contenido de los scripts corren en todos los sistemas; las 5 que ejecutan los scripts con `HOME` temporal, un JAR mínimo y un jpackage falso, solo en Linux.
- `README.md` («Instalar en Ubuntu») y `CLAUDE.md`.

### Criterios de aceptación

- `./mvnw verify` en verde en Windows 10: 103 pruebas de backend (6 omitidas en Windows: la de permisos POSIX y las 5 de `InstallerTest` que ejecutan los scripts) y 135 de interfaz.
- `./mvnw -Pdist package`: el JAR arranca con `java -jar --no-window`, `/api/health` responde con la firma, sirve `index.html` con su token y sus recursos, `/api/catalog` devuelve las dos mini apps y `--stop` lo apaga sin errores en el registro.
- Recorridos en Git Bash con `HOME` temporal, que reproducen los escenarios de las pruebas de Linux:
  - `scripts/install.sh` sin argumentos compila con `sh ./mvnw` y el JDK encontrado, instala y el comando instalado arranca y se apaga con `--stop`. En Windows, jpackage genera una imagen de Windows sin `bin/cajonsastre` y el instalador pasa al JAR, como debe.
  - Con un jpackage falso: argumentos `--type app-image`, `--main-class dev.cajonsastre.Main` y las dos `--java-options`; imagen, enlace, icono y lanzador en su sitio, sin carpetas temporales sobrantes.
  - Reinstalar llama a `--stop` de la instalación anterior y la sustituye entera.
  - Uso con dos argumentos o una opción: código 2; JAR inexistente: código 1.
  - `scripts/uninstall.sh` llama a `--stop`, quita aplicación, comando, lanzador e icono y conserva datos, ajustes y perfil de Chrome.

### Pendiente

- Verificación en Ubuntu 22.04 (ADR-0004): imagen real de jpackage con runtime propio, icono en «Mostrar aplicaciones», ventana agrupada bajo el icono por `StartupWMClass`, y las 5 pruebas de `InstallerTest` que solo corren en Linux.
- Actualizaciones automáticas: sprint propio.

### Desviaciones y decisiones

- ADR-0009 (propuesta): instalación por usuario, dos entradas (compilar o JAR), `-Pdist` solo con el JAR, jpackage en el equipo de destino con vuelta al JAR, icono SVG sin `--icon` y sustitución segura.
- `mvnw` y `scripts/dev.sh` no tenían permiso de ejecución en git; se corrigió de paso, porque en un clon de Ubuntu `./mvnw` no arrancaba.

### Cómo probarlo a mano (en Ubuntu)

1. `sudo apt install openjdk-21-jdk` y Node.js 24.
2. `scripts/install.sh` → «Cajón de sastre instalado en ~/.local/opt/cajonsastre».
3. «Mostrar aplicaciones» → «Cajón de sastre» abre la ventana; en el dock aparece con su icono.
4. `scripts/install.sh` otra vez con la aplicación abierta → se apaga y se sustituye.
5. `scripts/uninstall.sh` → desaparece el icono y `~/.local/share/cajonsastre` sigue ahí.
6. Sin Node.js: en otro equipo `./mvnw -Pdist package`, copiar `target/dist/cajonsastre.jar` y `scripts/install.sh cajonsastre.jar`.
