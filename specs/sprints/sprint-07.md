# Sprint 7: Mini app «Cerrar procesos»

## Objetivo

Cerrar desde Cajón de sastre un programa colgado y los procesos que dejó en sus puertos, como hacía `cerrarIntelliJ.sh`, con perfiles editables para poder usarlo con otros programas.

## Requisitos cubiertos

- Cerrar procesos: CP-01 a CP-34.
- Plataforma: P-02 (icono `processes`).

Documentos: [requisitos/processes.md](../requisitos/processes.md), [ADR-0018](../decisiones/ADR-0018-mini-app-cerrar-procesos.md), [diseno/mini-apps.md](../diseno/mini-apps.md).

## Tareas

1. **Especificación.** Requisitos CP, ADR-0018, este sprint y la arquitectura.
2. **Catálogo.** Manifiesto de `processes` en `AppCatalog` e icono `processes.svg`. `AppCatalogTest` se adapta.
3. **Servidor**, paquete `dev.cajonsastre.apps.processes`, sin base de datos.
   - `Profile` y `ProfileStore`: valores, formato, perfil inicial y guardado con `PrivateFile` (CP-01 a CP-04).
   - `ProcessTable` y `SystemProcesses`: los procesos del sistema, los que escuchan (`ss`) y el cierre forzado (CP-11, CP-12, CP-22).
   - `Scanner`: búsqueda y cierre de un perfil (CP-10 a CP-23).
   - `ProcessesApp`: el `MiniApp` y sus rutas.
4. **Interfaz**, carpeta `frontend/src/apps/processes/`: lista de perfiles, búsqueda, «Cerrar todo» y formulario (CP-30 a CP-34).
5. **Documentación.** `README.md` y `CLAUDE.md`.
6. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada.

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- «Cerrar procesos» aparece en el lanzador, en «Utilidades», con el perfil «IntelliJ IDEA» ya creado.
- Se puede crear, editar y eliminar un perfil; un formato incorrecto se indica junto a su campo.
- Con una tabla de procesos simulada, la búsqueda de un perfil devuelve los que coinciden con el patrón y los que escuchan en el rango, cada uno una vez, sin el proceso de Cajón de sastre.
- Un puerto del rango ocupado por un proceso que no se ve aparece como ocupado por otro usuario.
- «Cerrar todo» solo cierra procesos que siguen en la búsqueda, y dice cuántos ha cerrado y cuántos no.
- Ninguna prueba cierra un proceso que no haya lanzado ella.
- En Ubuntu, con IntelliJ y sus API en marcha: la búsqueda muestra lo mismo que cerraba `cerrarIntelliJ.sh`, y «Cerrar todo» lo cierra y deja libres los puertos.

## Resultado

Fecha: 2026-11-13. Hecho en el código y probado con una tabla de procesos simulada. Sin commits todavía. Falta la verificación en Ubuntu con IntelliJ y `ss` reales.

### Hecho

- **Especificación:** `requisitos/processes.md` (CP-01 a CP-34), ADR-0018 aceptada, este sprint, la arquitectura y `CLAUDE.md`.
- **Catálogo:** `processes` disponible, con el icono nuevo `processes.svg`, color `orange` y categoría `utilities`.
- **Servidor (`dev.cajonsastre.apps.processes`):** `Profile` y `ProfileStore`, con el perfil inicial de IntelliJ; `ProcessTable` y `SystemProcesses` (`ProcessHandle` y `ss`); `ProfileScanner`, que busca y cierra; y `ProcessesApp` con sus rutas.
- **Interfaz (`frontend/src/apps/processes/`):** lista de perfiles, perfil elegido con su búsqueda, «Cerrar todo», formulario y confirmación al eliminar.
- **Documentación:** `README.md`.
- **Pruebas:** `./mvnw verify` en verde, con 408 de backend (19 omitidas en Windows, las mismas de antes) y 273 de interfaz.
  - Nuevas de backend: 13 en `ProcessesAppTest` y 4 en `SystemProcessesTest`; `AppCatalogTest` comprueba el manifiesto.
  - Nuevas de interfaz: 18 en `test/processesApp.test.tsx`.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados: la mini app aparece con el perfil «IntelliJ IDEA», avisa de que no hay `ss`, un puerto mal escrito se indica junto a su campo y un perfil nuevo se guarda y queda elegido. No se pulsó «Cerrar todo».

### Pendiente

- **Verificación en Ubuntu**, con IntelliJ y sus API en marcha: que la búsqueda muestra lo que cerraba `cerrarIntelliJ.sh` y que «Cerrar todo» lo cierra y libera los puertos. El formato de `ss -H -l -t -n -p` está cubierto con salidas de ejemplo, no con una real.

### Desviaciones y decisiones

- **ADR-0018 (aceptada):** perfiles editables, ver y cerrar, y sin `sudo`.
- **`ss` en lugar de `lsof`**, para poder avisar de un puerto ocupado por otro usuario.
- **No se pasa la ejecución de comandos a la plataforma**, aunque ADR-0016 lo dejó para la tercera mini app que ejecutara comandos: esta ejecuta uno solo y no lo necesita.
- **Ninguna prueba cierra un proceso del equipo.** La única que cierra uno real, en `SystemProcessesTest`, cierra un proceso Java que lanza ella misma.
