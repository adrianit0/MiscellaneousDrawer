# Cajón de sastre

Cajón de sastre es una aplicación local para un único usuario que reúne varias **mini apps** de utilidad bajo una misma ventana: un lanzador para elegirlas, una barra lateral para cambiar de una a otra y una navegación común.

En esta versión están la base de la aplicación y el catálogo de las mini apps previstas, que aparecen como «En preparación»:

- **Base de datos**, un gestor de bases de datos.
- **Tareas**, un gestor de tareas.

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

Todo se guarda en la máquina local y la aplicación no se conecta a internet.

## Requisitos

- JDK 21
- Node.js 24 o superior (solo para compilar)
- Para la ventana de aplicación: Google Chrome (si no está, se usa el navegador por defecto)

## Compilar y probar

```bash
./mvnw verify
```

Compila el backend y la interfaz y ejecuta todas las pruebas. Con `-Dskip.frontend` se omite la interfaz.

## Desarrollo

```bash
scripts/dev.sh
```

Arranca el servidor en `http://127.0.0.1:47800/` y la interfaz con recarga en caliente en `http://127.0.0.1:5174/`.

Opciones de línea de comandos. El comando `cajonsastre` llegará con la instalación; mientras tanto se pasan con `./mvnw -Dskip.frontend exec:java -Dexec.mainClass=dev.cajonsastre.Main -Dexec.args="…"`.

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
| Copias previas a cada migración | `~/.local/share/cajonsastre/backups/` |
| Registro | `~/.local/state/cajonsastre/cajonsastre.log` (rota a 5 MB, 3 ficheros) |

## Especificación

La especificación completa está en [`specs/`](specs/). El desarrollo sigue un método guiado por especificación: cada funcionalidad tiene un requisito con identificador y al menos una prueba que lo cita. Cómo se integra una mini app está en [`specs/diseno/mini-apps.md`](specs/diseno/mini-apps.md).

## Licencia

[MIT](LICENSE)
