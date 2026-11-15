# Sprint 8: Mini app «Repositorios»

## Objetivo

Mantener al día desde Cajón de sastre los repositorios git de las API del proyecto, como hacía `actualizarAPIS.sh`, con una lista editable y pudiendo ver el estado de cada uno, cambiar de rama, actualizar, clonar y descartar cambios.

## Requisitos cubiertos

- Repositorios: RG-01 a RG-45.
- Seguridad: S-15 (tercer destino autorizado).
- Plataforma: P-02 (icono `repos`).

Documentos: [requisitos/repos.md](../requisitos/repos.md), [ADR-0019](../decisiones/ADR-0019-mini-app-repositorios.md), [diseno/mini-apps.md](../diseno/mini-apps.md).

## Tareas

1. **Especificación.** Requisitos RG, ADR-0019, este sprint, el principio 4 de la constitución, S-15 y la arquitectura.
2. **Catálogo.** Manifiesto de `repos` en `AppCatalog` e icono `repos.svg`. `AppCatalogTest` se adapta.
3. **Servidor**, paquete `dev.cajonsastre.apps.repos`, sin base de datos.
   - `Repo` y `RepoStore`: valores, formato y guardado con `PrivateFile` (RG-01 a RG-06).
   - `Command`, `CommandRunner` y `ProcessRunner`: copias reducidas, con el entorno de RG-21.
   - `RepoStatus`: el estado local de un repositorio (RG-10 a RG-15).
   - `JobRunner`: los trabajos, su consola, su notificación y su cancelación (RG-20 a RG-32).
   - `ReposApp`: el `MiniApp` y sus rutas.
4. **Interfaz**, carpeta `frontend/src/apps/repos/`: tabla, acciones, trabajo en marcha, formulario y confirmaciones (RG-40 a RG-45).
5. **Documentación.** `README.md` y `CLAUDE.md`.
6. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada.

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- «Repositorios» aparece en el lanzador, en «Utilidades», con la lista vacía.
- Se puede crear, editar y eliminar un repositorio; un formato incorrecto se indica junto a su campo, y una URL con contraseña se rechaza.
- Con comandos simulados, cada acción emite exactamente los comandos de su tabla, y ninguna emite `push`.
- Con un `git` real y un remoto que es otra carpeta temporal: clonar, ver los commits pendientes tras consultar, actualizar («Actualizado» y «Sin cambios»), cambiar de rama y descartar cambios hacen lo que dicen.
- «Actualizar todas» sigue con los demás cuando uno falla, y el resumen y la notificación lo dicen.
- Un trabajo se puede cancelar, y con uno en marcha no se inicia otro ni se edita la lista.
- Ninguna prueba contacta con un servidor.
- En Ubuntu, con las API reales: «Actualizar todas» deja lo mismo que `actualizarAPIS.sh`, sin escribir la contraseña en ningún sitio.

## Resultado

Fecha: 2026-11-15. Hecho en el código y probado con git simulado y con el git instalado contra un remoto en una carpeta temporal. Sin commits todavía. Falta la verificación en Ubuntu con las API y sus servidores reales.

### Hecho

- **Especificación:** `requisitos/repos.md` (RG-01 a RG-45), ADR-0019 aceptada, este sprint, el principio 4 de la constitución, S-15, la arquitectura y `CLAUDE.md`.
- **Catálogo:** `repos` disponible, con el icono nuevo `repos.svg`, color `blue` y categoría `utilities`.
- **Servidor (`dev.cajonsastre.apps.repos`):** `Repo` y `RepoStore`, con la lista vacía al principio; `Command`, `CommandRunner` y `ProcessRunner` (copias reducidas, con el entorno de git); `RepoInspector`, que lee el estado local; `JobRunner`, que ejecuta los trabajos con su consola, su notificación y su cancelación; y `ReposApp` con sus rutas.
- **Interfaz (`frontend/src/apps/repos/`):** tabla con rama, estado y pendientes; «Actualizar», «Clonar», el desplegable de ramas y el menú de cada fila; «Actualizar todas», «Consultar todas» y «Refrescar»; el trabajo en marcha con «Ver consola» y «Cancelar»; formulario y confirmaciones.
- **Documentación:** `README.md`.
- **Pruebas:** `./mvnw verify` en verde, con 437 de backend (19 omitidas en Windows, las mismas de antes) y 293 de interfaz.
  - Nuevas de backend: 21 en `ReposAppTest`, 3 en `RealGitTest` y 5 en `ProcessRunnerTest` de `repos`; `AppCatalogTest` comprueba el manifiesto.
  - Nuevas de interfaz: 20 en `test/reposApp.test.tsx`.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados y un repositorio de prueba cuyo remoto es otra carpeta: la mini app aparece vacía; una URL con contraseña se rechaza junto a su campo; el repositorio guardado muestra su rama, «Limpio» y «Al día», y avisa de que su `origin` no es el configurado; tras tocar un fichero muestra «1 cambio, 1 sin seguimiento» y «Descartar cambios» pide confirmación y deja solo el fichero sin seguimiento; el desplegable cambia a `hotfix`; y «Actualizar» trae un commit nuevo, dice «Actualizado» y su consola muestra el `git pull --ff-only`.

### Pendiente

- **Verificación en Ubuntu**, con las API reales: que «Actualizar todas» deja lo mismo que `actualizarAPIS.sh` y que la autenticación funciona con las credenciales ya configuradas en git, sin escribir la contraseña en ningún sitio. Si la aplicación se lanza desde el escritorio y las credenciales dependen del entorno de la terminal, puede fallar (ADR-0019, «Consecuencias»).
- No se recorrieron con la aplicación arrancada «Clonar», «Actualizar todas», «Consultar todas», «Usar el configurado» ni «Cancelar»: están cubiertas por las pruebas.

### Desviaciones y decisiones

- **ADR-0019 (aceptada):** servidores git como destino solo de lectura, credenciales del git del usuario, lista editable y vacía, y las cuatro operaciones pedidas.
- **Color `blue`** en lugar del `violet` previsto, que ya usa «Base de datos».
- **«Actualizar» lee el estado local antes y después** para saber la rama y si el commit ha cambiado: RG-24 se amplió para decirlo.
- **`RealGitTest` construye el `Repo` a mano**, porque una carpeta no pasa RG-02 como URL del remoto. Se omite si no hay git instalado.
- **No se pasa la ejecución de comandos a la plataforma**, aunque es la tercera mini app que la copia (ADR-0019, «Alternativas descartadas»).
