# Sprint 6: Mini app «Calidad del dato»

## Objetivo

Comprobar los datos de la base local desde Cajón de sastre, como hacía `calidad_dato.sh`: ejecutar los scripts SQL de validación contra el contenedor MySQL, ver de un vistazo cuáles devuelven filas o fallan, y ver esas filas en una tabla. La salida va a una consola y el resultado, a una notificación.

## Requisitos cubiertos

- Calidad del dato: CD-01 a CD-45.
- Plataforma: P-02 (icono `quality`).

Documentos: [requisitos/quality.md](../requisitos/quality.md), [ADR-0016](../decisiones/ADR-0016-mini-app-calidad-del-dato.md), [diseno/mini-apps.md](../diseno/mini-apps.md).

## Tareas

1. **Especificación.** Requisitos CD, ADR-0016, este sprint y la arquitectura.
2. **Catálogo.** Manifiesto de `quality` en `AppCatalog` e icono `quality.svg`. `AppCatalogTest` se adapta.
3. **Servidor**, paquete `dev.cajonsastre.apps.quality`, sin base de datos.
   - `QualityConfig` y `ConfigStore`: valores, formato, lo que falta y guardado con `PrivateFile` (CD-01 a CD-04).
   - `Command`, `CommandRunner` y `ProcessRunner`: comandos con entorno, entrada desde fichero y cancelación (CD-22, CD-27).
   - `MysqlXml`: lectura acotada de la salida XML de `mysql` (CD-24).
   - `QualityRunner`: comprobación, resultados, consola, notificación y cancelación (CD-20 a CD-30).
   - `QualityApp`: el `MiniApp` y sus rutas (CD-10, CD-11).
4. **Interfaz**, carpeta `frontend/src/apps/quality/`.
   - Secciones (CD-40), «Comprobar» (CD-41 a CD-44) y «Configuración» con la importación del `.sh` y el aviso de cambios sin guardar (CD-05, CD-06, CD-45).
5. **Documentación.** `README.md` y `CLAUDE.md`.
6. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada.

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- «Calidad del dato» aparece en el lanzador, en «Datos», y muestra sus dos secciones.
- Sin configuración, «Comprobar» dice qué falta y no deja ejecutar. Tras guardarla, la contraseña no vuelve a salir del servidor.
- Importar un `.sh` con las cuatro variables rellena el formulario sin guardar.
- Con comandos simulados, una comprobación ejecuta los scripts por orden de nombre con `--xml` y la contraseña en el entorno; los scripts sin filas quedan correctos, los que devuelven filas, con su número, y los que fallan, con su error, sin detener los demás.
- Con el contenedor parado no se ejecuta ningún script y la comprobación falla con el motivo.
- La consola «Comprobación N» recoge los comandos y las incidencias, y termina en el estado de CD-25. Al terminar llega la notificación de CD-26.
- Al pulsar un script con filas se ven en una tabla con sus columnas.
- «Filtrar» y «Solo con incidencias» reducen la lista y se conservan tras recargar.
- Pedir una segunda comprobación responde 409, y «Cancelar» detiene la que está en marcha.
- En Ubuntu, con `docker` real: una comprobación sobre la base importada da el mismo resultado que `calidad_dato.sh`.

## Resultado

Fecha: 2026-11-13. Hecho en el código y probado con docker simulado. Sin commits todavía. Falta el recorrido con la aplicación arrancada y la verificación con `docker` real en Ubuntu.

### Hecho

- **Especificación:** `requisitos/quality.md` (CD-01 a CD-45), ADR-0016 aceptada, este sprint, la arquitectura y `CLAUDE.md`.
- **Catálogo:** `quality` disponible, con el icono nuevo `quality.svg`, color `cyan` y categoría `data`.
- **Servidor (`dev.cajonsastre.apps.quality`):** `QualityConfig` y `ConfigStore`, `Command`, `CommandRunner` y `ProcessRunner` (copias reducidas de los de «Base de datos»), `MysqlXml` y `QualityRunner`, que comprueba el contenedor, ejecuta los scripts, guarda los resultados en memoria, escribe en la consola «Comprobación N», emite la notificación y se puede cancelar.
- **Interfaz (`frontend/src/apps/quality/`):** «Comprobar», con filtro, casillas, «Solo con incidencias», resumen, «Ver consola» y la tabla de filas; «Configuración», con «Importar de un .sh…» y el aviso de cambios sin guardar.
- **Documentación:** `README.md`.
- **Pruebas:** 391 de backend (19 omitidas en Windows, las mismas de antes) y 255 de interfaz.
  - Nuevas de backend: 20 en `QualityAppTest`, 7 en `MysqlXmlTest` y 3 en `ProcessRunnerTest` de `quality`; `AppCatalogTest` comprueba el manifiesto.
  - Nuevas de interfaz: 26 en `test/qualityApp.test.tsx`.

### Pendiente

- **Recorrido con la aplicación arrancada.** Había una instancia de desarrollo en marcha en 47800 y 5174, anterior a estos cambios, y no se paró.
- **Verificación en Ubuntu con `docker` real**, comparando el resultado con el de `calidad_dato.sh`. El formato de `mysql --xml` está cubierto con salidas de ejemplo; conviene confirmar con una base real un script con varios `SELECT` y uno que devuelva `NULL`.

### Desviaciones y decisiones

- **ADR-0016 (aceptada):** mini app propia con su configuración, lista y tabla, y `mysql --xml` para tener columnas, varios conjuntos de resultados y `NULL`.
- **Una salida que no es el XML de `mysql` es un error del script** (CD-23), para no darla por correcta.
- **Con `./mvnw verify` el `npm ci` falló** porque el servidor de Vite en marcha tenía abierto un binario de `node_modules`, y dejó las dependencias a medias. Se repusieron con `npm install`, sin cambiar `package-lock.json`, y la verificación se hizo por partes: `./mvnw -Dskip.frontend verify`, `npm test` y `npm run build`.
