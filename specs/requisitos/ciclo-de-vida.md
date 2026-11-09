# Requisitos del ciclo de vida

CajonSastre es un único proceso Java. El ciclo de vida sigue el de LiteDD (instancia única, ventana de Chrome en modo aplicación, presencia y apagado ordenado), con nombres, rutas y puerto propios para convivir con ella.

| ID | Requisito |
|---|---|
| C-01 | Al lanzar, se comprueba `GET /api/health` en el puerto configurado (por defecto 47800). Si responde con la firma `"app":"CajonSastre"`, solo se abre la ventana. Cualquier otra respuesta, incluida la de LiteDD, no es una instancia de CajonSastre. |
| C-02 | Si no hay instancia: se abre la base del shell y se migra, se arrancan las mini apps (P-05, P-07), se arranca el servidor y se escribe `instance.json` con el puerto y el token, con permisos 600. Si el puerto está ocupado, se informa y el proceso termina con código 1. |
| C-03 | La ventana se abre con `google-chrome --app=<url>`, un perfil propio en `<estado>/chrome` y la clase de ventana `cajonsastre`. Si Chrome no está, se usa `xdg-open`. En Windows, solo para desarrollo, el navegador por defecto (ADR-0004). |
| C-04 | La interfaz mantiene abierto el canal `/api/events` (con `fetch`, para enviar el token) como señal de presencia. El servidor escribe un latido cada 5 s para descubrir las conexiones caídas. |
| C-05 | Al cerrar la ventana, la interfaz envía `POST /api/presence/bye`. Si a los 15 s no queda ninguna ventana conectada, el proceso se apaga de forma ordenada. Si la conexión se pierde sin despedida, el proceso sigue vivo, salvo que el ajuste «Apagado automático» indique un número de minutos (1 a 1440) sin ventanas. |
| C-06 | `cajonsastre --stop` lee `instance.json` y llama a `POST /api/shutdown` con su token. |
| C-07 | Opciones de línea de comandos: `cajonsastre [--no-window] [--port N]` y `cajonsastre --stop`. Una opción desconocida o un puerto fuera de 1 a 65535 muestran el uso y terminan con código 2. |
| C-08 | Convivencia con LiteDD: puerto por defecto 47800 (LiteDD usa 47600) y 5174 para la interfaz de desarrollo (LiteDD usa 5173); carpetas `cajonsastre` en `XDG_DATA_HOME`, `XDG_CONFIG_HOME` y `XDG_STATE_HOME`; cabecera `X-CajonSastre-Token`; clase de ventana y perfil de Chrome propios. |
| C-09 | El registro va a `<estado>/cajonsastre.log`, con rotación de 5 MB y 3 ficheros. |
| C-10 | El apagado ordenado para el servidor, avisa a las mini apps (P-10), cierra la base del shell y borra `instance.json`. El gancho de apagado de la JVM espera a que termine un apagado en curso. |

## Rutas en disco

| Contenido | Ruta |
|---|---|
| Ajustes | `~/.config/cajonsastre/config.json` |
| Configuración de cada mini app | `~/.config/cajonsastre/apps/<id>/` |
| Base del shell | `~/.local/share/cajonsastre/cajonsastre.db` |
| Datos de cada mini app | `~/.local/share/cajonsastre/apps/<id>/` (su base es `data.db`) |
| Copias | `~/.local/share/cajonsastre/backups/` |
| Registro, instancia en marcha y perfil de Chrome | `~/.local/state/cajonsastre/` |

Cada carpeta respeta `XDG_DATA_HOME`, `XDG_CONFIG_HOME` y `XDG_STATE_HOME` si están definidas.
