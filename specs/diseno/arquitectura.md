# Arquitectura

## Producto y alcance

CajonSastre es una aplicación local para un único usuario que reúne varias **mini apps** de utilidad (un gestor de tareas, un gestor de bases de datos, etc.) bajo una misma ventana, con un lanzador y una navegación comunes. Sigue el método, el stack y el ciclo de vida de LiteDD, pero es una aplicación aparte que convive con ella (constitución, principio 5).

Contexto de uso: un único usuario, una única máquina con Ubuntu 22.04 y sesiones de varias horas sin cerrar la aplicación.

### Incluido en la base (Sprint 0)

- Shell: barra superior, barra lateral, lanzador con buscador, fijadas y recientes, paleta «Ir a…», «Ajustes» y avisos.
- Navegación por rutas, con historial, mini apps abiertas que conservan su estado y restauración de la última ruta.
- Plataforma de mini apps: catálogo, contrato de servidor y de interfaz, base de datos por mini app, estado de interfaz por mini app, aislamiento de rutas, de errores, de estilos y de importaciones.
- Catálogo inicial con dos mini apps en preparación: «Base de datos» y «Tareas» (ADR-0008).
- Ciclo de vida: instancia única, ventana propia, presencia, apagado ordenado y `--stop`.

### Instalación (Sprint 1)

- `scripts/install.sh` y `scripts/uninstall.sh`, lanzador `.desktop` con icono e imagen de `jpackage` (C-11 a C-15, ADR-0009).

### Fuera de la base

- La funcionalidad de cualquier mini app: cada una tendrá su especificación y su sprint.
- Actualizaciones: llegarán en un sprint propio, como en LiteDD. Mientras tanto se actualiza reinstalando.
- Lo que la plataforma aún no ofrece ([mini-apps.md](mini-apps.md), «Fuera de la plataforma, por ahora»).
- Tema claro y otros idiomas.

## Componentes

```text
┌──────────────────────── Ventana (Chrome --app) ────────────────────────┐
│  shell/  barra superior · barra lateral · lanzador · paleta · ajustes  │
│  platform/  useMiniApp · useAppState · useAppShortcut · cliente acotado │
│  apps/<id>/  interfaz de cada mini app (carga bajo demanda)             │
└───────────────┬────────────────────────────────────────────────────────┘
                │ HTTP + token (S-10 a S-14)
┌───────────────▼──────────────── Proceso Java ──────────────────────────┐
│  http        servidor Javalin, seguridad local, errores A-02            │
│  lifecycle   instancia, ventana, presencia, apagado                     │
│  settings    config.json y estado de interfaz del shell                 │
│  catalog     AppCatalog (declaración), AppRegistry (ejecución),         │
│              /api/catalog, /api/app-state                               │
│  platform    MiniApp, AppManifest, AppContext, AppRoutes, Store, ApiError│
│  apps.<id>   servidor de cada mini app                                  │
└───────┬─────────────────────────────────────┬──────────────────────────┘
        │                                     │
  cajonsastre.db (shell)            apps/<id>/data.db (una por mini app)
```

| Componente | Responsabilidad |
|---|---|
| `http` | Servidor en 127.0.0.1, ficheros estáticos, token, Host, Origin, CSP y formato de errores |
| `lifecycle` | Línea de comandos, `instance.json`, ventana de Chrome, presencia y apagado |
| `settings` | `config.json` (D-05) y tabla `setting` (D-04) |
| `catalog` | Lista de mini apps, su arranque aislado, su estado y sus rutas por mini app del shell |
| `platform` | Contrato público para las mini apps y acceso a SQLite (`Store`) |
| `apps.<id>` | Una mini app; solo depende de `platform` (P-18) |
| Interfaz `shell/` | Disposición, navegación, lanzador, paleta, ajustes, presencia |
| Interfaz `platform/` | API pública de interfaz para las mini apps |
| Interfaz `apps/<id>/` | Una mini app; solo depende de `platform/` (P-18) |

## Stack

El mismo que LiteDD (ADR-0001), sin lo que solo usaba LiteDD (MySQL, HikariCP, CodeMirror, Markdown, Mermaid…).

| Pieza | Elección | Motivo |
|---|---|---|
| Lenguaje | Java 21 (LTS) | Mismo ecosistema que LiteDD; jpackage incluido |
| Build | Maven con Maven Wrapper 3.9.x | La versión de Maven queda fijada en el repositorio |
| Servidor | Javalin 7.2.x | Ligero, sin contenedor |
| Datos propios | SQLite (org.xerial:sqlite-jdbc) | Un fichero por base |
| Acceso a datos | MyBatis 3.5.14 con anotaciones | El mismo patrón de mappers que LiteDD |
| JSON | Jackson | Serializador de Javalin |
| Registro | SLF4J + Logback con rotación | Fichero acotado en sesiones largas |
| Pruebas backend | JUnit 5 + AssertJ | |
| Interfaz | React + TypeScript + Vite | Carga bajo demanda de cada mini app |
| Estado | Zustand | Simple, sin ceremonia |
| Pruebas interfaz | Vitest + Testing Library | |

No se usa un enrutador de terceros: las rutas de N-01 son pocas y un módulo propio de unas decenas de líneas basta (ADR-0007).

## Ciclo de vida

Ver [requisitos/ciclo-de-vida.md](../requisitos/ciclo-de-vida.md). En resumen:

1. Se comprueba si ya hay una instancia en el puerto (C-01); si la hay, solo se abre la ventana.
2. Si no: base del shell, arranque aislado de las mini apps, servidor e `instance.json` (C-02).
3. Ventana de Chrome en modo aplicación con perfil y clase propios (C-03).
4. Presencia por `/api/events`; despedida y apagado a los 15 s (C-04, C-05).

### Memoria y sesiones largas

- JVM con `-Xmx384m -XX:+UseSerialGC`.
- Como máximo 5 mini apps montadas a la vez en la interfaz (N-05).
- Registro con rotación: 5 MB por fichero, 3 ficheros (C-09).

## Build

- `./mvnw verify` compila backend e interfaz y ejecuta todas las pruebas. La interfaz se construye con `npm ci && npm run build` y se copia a `web/` dentro del JAR.
- `scripts/dev.sh` arranca el backend en 47800 y Vite en 5174 con recarga en caliente.
- `./mvnw -Pdist package` genera además el JAR único `target/dist/cajonsastre.jar`, con la interfaz y las dependencias, que se ejecuta con `java -jar` en cualquier sistema.
- `scripts/install.sh` compila ese JAR (o recibe uno ya compilado), genera en la propia máquina la imagen de `jpackage` con runtime propio y la instala con su comando y su lanzador (C-11 a C-14, ADR-0009). `scripts/uninstall.sh` la quita sin tocar los datos (C-15).

## Convenciones de código

- Código, identificadores, tablas y rutas de API en inglés. Paquete raíz Java: `dev.cajonsastre`.
- Textos de interfaz, especificaciones y mensajes de commit en español.
- Prefijos de requisitos del shell: S (seguridad), A (API), P (plataforma), N (navegación), L (lanzador), U (interfaz), C (ciclo de vida), D (datos). Cada mini app elige un prefijo propio de dos o más letras al especificarse, para no chocar con estos.

## Método de desarrollo

El mismo que LiteDD: primero la especificación, después las pruebas y por último el código. Nada se implementa sin un identificador de requisito.

### Estructura

```text
cajonsastre/
├── CLAUDE.md                 instrucciones operativas para Claude Code
├── README.md, LICENSE (MIT), .gitignore, .gitattributes
├── mvnw, mvnw.cmd, .mvn/, pom.xml
├── specs/
│   ├── constitucion.md       principios que no se negocian
│   ├── requisitos/           seguridad, api, plataforma, navegacion, interfaz, ciclo-de-vida, datos
│   ├── diseno/               arquitectura, mini-apps, modelo-datos
│   ├── sprints/              sprint-00.md …
│   └── decisiones/           ADR-0001-….md
├── src/main/java/dev/cajonsastre/       shell y plataforma; apps/<id>/ para cada mini app
├── src/main/resources/db/shell/         migraciones del shell
├── src/main/resources/db/apps/<id>/     migraciones de cada mini app
├── src/test/java/dev/cajonsastre/
├── frontend/                 src/shell, src/platform, src/apps/<id>
├── packaging/                cajonsastre.desktop (plantilla del lanzador)
└── scripts/                  dev.sh, install.sh, uninstall.sh
```

### Flujo de un sprint

1. Leer CLAUDE.md, la constitución y el fichero del sprint.
2. Revisar el plan de tareas, presentarlo y esperar aprobación.
3. Escribir las pruebas de cada requisito y después el código.
4. Verificar: `./mvnw verify` en verde y criterios de aceptación recorridos con la aplicación arrancada.
5. Registrar cada decisión nueva como ADR y actualizar la especificación si cambió.
6. Rellenar «Resultado» en el fichero del sprint y hacer commits pequeños en español.

### Pruebas

| Nivel | Alcance | Obligatoria |
|---|---|---|
| Unitaria | Validación del catálogo, rutas acotadas, migraciones, configuración, línea de comandos, presencia | Sí |
| Integración | Servidor real en un puerto libre y SQLite en ficheros temporales | Sí |
| Fronteras | Importaciones y estilos de las mini apps (P-18) | Sí |
| Interfaz | Componentes y almacenes de estado con Vitest | Sí |
