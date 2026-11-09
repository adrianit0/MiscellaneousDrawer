# Sprint 0: Base de la aplicación y plataforma de mini apps

## Objetivo

La base de Cajón de sastre: un shell donde se eligen las mini apps y se navega entre ellas, y una plataforma con un contrato bien definido para integrar las mini apps futuras sin tocar el shell. Ninguna mini app tiene aún funcionalidad: el catálogo trae las previstas como «En preparación».

## Requisitos cubiertos

- Seguridad: S-10 a S-16, S-20, S-21, S-30 a S-35.
- API: A-01 a A-04.
- Plataforma: P-01 a P-19.
- Navegación y lanzador: N-01 a N-10, L-01 a L-07.
- Interfaz: U-01 a U-08.
- Ciclo de vida: C-01 a C-10.
- Datos: D-01 a D-07.

Documentos: [requisitos/](../requisitos/), [diseno/arquitectura.md](../diseno/arquitectura.md), [diseno/mini-apps.md](../diseno/mini-apps.md), [diseno/modelo-datos.md](../diseno/modelo-datos.md).

## Tareas

1. Analizar LiteDD y adoptar su método (SDD, constitución, requisitos con identificador, ADR, sprints) y su stack.
2. Especificación: constitución, requisitos, diseño y ADR-0001 a ADR-0008.
3. Maven Wrapper y `pom.xml` con las versiones de ADR-0001; `.gitignore`, `.gitattributes`, `LICENSE`.
4. Servidor Javalin con las protecciones S-10 a S-14 y el formato de errores A-02.
5. Ciclo de vida: instancia única, ventana, presencia, apagado y `--stop`, con nombres, puerto y carpetas propios (C-08).
6. Plataforma en el servidor: manifiesto, catálogo, registro con arranque aislado, rutas acotadas, una base SQLite por mini app y estado de interfaz por mini app.
7. Interfaz: shell (barra superior, barra lateral, lanzador, paleta, ajustes, avisos), rutas, mini apps abiertas montadas y plataforma de interfaz (`useMiniApp`, `useAppState`, `useAppShortcut`, cliente acotado).
8. Pruebas de fronteras de las mini apps en Java y en la interfaz.
9. `scripts/dev.sh`, `CLAUDE.md` y `README.md`.

## Criterios de aceptación

- `./mvnw verify` termina en verde.
- Con la aplicación arrancada: el lanzador muestra «Base de datos» y «Tareas» como «En preparación», se pueden abrir, fijar, buscar y cerrar, y la barra lateral, la miga de pan y el título de la ventana siguen la navegación.
- Una mini app de prueba que falla al arrancar no impide que funcionen el shell y las demás (pruebas).
- Las pruebas de fronteras fallan ante una importación prohibida (pruebas con código de ejemplo).
- Puede estar en marcha a la vez que LiteDD: puerto, carpetas, token y ventana distintos.

## Resultado

Fecha: 2026-11-09.

### Hecho

- Especificación completa en `specs/` y ADR-0001 a ADR-0008. El contrato de las mini apps está en `diseno/mini-apps.md`, con el procedimiento para añadir una.
- Backend (`dev.cajonsastre`):
  - `platform`: `MiniApp`, `AppManifest` (validado al construirse), `AppColor`, `AppCategory`, `AppContext`, `AppRoutes` (rutas acotadas a `/api/apps/<id>`), `Store` y `Migrator` (copia previa con el nombre de cada base), `PrivateFile` y `ApiError`.
  - `catalog`: `AppCatalog` con las dos mini apps en preparación, `AppRegistry` (arranque aislado, 503 para las que fallan, apagado en orden inverso), `GET /api/catalog` y `GET`/`PUT /api/app-state/{id}`.
  - `http`, `lifecycle`, `settings`: servidor, seguridad local, presencia, `--stop`, `config.json` y tabla `setting`.
- Interfaz (`frontend/src`):
  - `shell`: barra superior con miga de pan, fijar y cerrar; barra lateral; lanzador con buscador, fijadas, recientes y categorías; paleta «Ir a…»; «Ajustes»; avisos; rutas en el fragmento; mini apps abiertas montadas (máximo 5) y restauración de la última ruta.
  - `platform`: `useMiniApp`, `useAppState`, `useAppShortcut`, cliente acotado y tipos públicos.
  - Carga bajo demanda de cada mini app por convención de carpeta y marco con límite de errores y «Reintentar».
- Pruebas: 95 de backend (1 omitida en Windows: permisos POSIX) y 135 de interfaz, todas citando su requisito.

### Criterios de aceptación

- `./mvnw verify` en verde en Windows 10.
- Recorrido con la aplicación empaquetada en http://127.0.0.1:47800/ y datos aislados con las variables XDG: lanzador, apertura de «Tareas» y «Base de datos», fijar, Ctrl+K, Alt+W, Alt+0, «Ajustes» y Esc. Sin errores en la consola. Tras `--stop` y un nuevo arranque se conservan fijadas y recientes, y al abrir `/` sin ruta se vuelve a la última visitada.
- Sin token, `GET /api/catalog` responde 403.

### Pendiente

- Verificación en Ubuntu 22.04: ventana de Chrome con su clase, permisos 600 de `instance.json` (la prueba se omite en Windows).
- Instalación (`install.sh`, lanzador `.desktop`, imagen `jpackage`) y actualizaciones: sprint propio, como en LiteDD.
- La funcionalidad de cada mini app: cada una con su especificación y su sprint.

### Desviaciones y decisiones

- ADR-0002 (propuesta): puerto 47800, Vite 5174 y nombre visible «Cajón de sastre».
- ADR-0005 (aceptada): mini apps como porciones verticales con catálogo declarado en el servidor.
- ADR-0006 (aceptada): una base SQLite por mini app.
- ADR-0007 (propuesta): rutas en el fragmento, máximo de 5 abiertas y restauración de la última ruta.
- ADR-0008 (propuesta): catálogo inicial con «Base de datos» y «Tareas» en preparación.
- N-10: Esc no queda reservado, para que cada mini app pueda usarlo; U-08: el logotipo es decorativo y el enlace a Inicio se llama «Cajón de sastre». Los dos ajustes se hicieron en la especificación antes que en el código.
- Los ficheros del IDE (`.idea/`, `CajonSastre.iml`) quedan fuera del repositorio, como en LiteDD.

### Cómo probarlo a mano

1. `./mvnw verify` → BUILD SUCCESS.
2. `scripts/dev.sh` y abrir http://127.0.0.1:5174/ → lanzador con las dos mini apps.
3. Abrir «Tareas», fijarla con ☆, volver con Alt+0: aparece en «Fijadas» y en «Recientes».
4. Ctrl+K, escribir «datos» e Intro → «Base de datos». Alt+W la cierra y vuelve a la anterior.
5. `curl http://127.0.0.1:47800/api/health` → `{"app":"CajonSastre",…}`.
