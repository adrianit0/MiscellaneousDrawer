# ADR-0018: Mini app «Cerrar procesos»

- Estado: aceptada (2026-11-13)
- Requisitos: CP-01 a CP-34 (nuevos), P-02 (icono nuevo `processes`)
- Modifica: nada; no cambia la plataforma ni las otras mini apps

## Contexto

IntelliJ IDEA se queda colgado a menudo y hay que matarlo. Las API que tenía levantadas siguen vivas y ocupan sus puertos, y había que cerrarlas a mano. El usuario lo resolvió con un script de consola, `cerrarIntelliJ.sh`: `pkill -9 -f 'idea|IntelliJ'` y, para cada puerto de 8080 a 8090, `sudo lsof` y `sudo kill -9` del proceso que escucha.

Pidió lo mismo dentro de Cajón de sastre, ampliable a otros programas, aunque hoy solo lo usa con IntelliJ. Durante las pruebas no se debe cerrar ninguna aplicación del equipo de desarrollo.

## Decisión

El usuario respondió a tres preguntas (2026-11-13):

1. **Perfiles editables.** Una lista de perfiles que se crean y editan en la mini app, cada uno con nombre, patrón de procesos y rango de puertos. Viene uno de IntelliJ ya creado.
2. **Ver y cerrar.** La mini app muestra los procesos encontrados en ese momento y «Cerrar todo» los mata. Así se ve qué va a caer, porque el patrón `idea` puede coincidir con procesos inesperados.
3. **Sin `sudo`.** Solo se cierran procesos del usuario, que es el caso de las API lanzadas desde IntelliJ. Un puerto ocupado por un proceso de otro usuario se indica y no se puede cerrar.

Diseño:

- **Identidad**: `processes`, «Cerrar procesos», «Cierra programas colgados y libera sus puertos», icono nuevo `processes`, color `orange` y categoría `utilities`.
- **Los perfiles son configuración**: un fichero JSON en la carpeta de configuración de la mini app, sin base de datos. El de IntelliJ existe mientras no hay fichero, así que el usuario puede cambiarlo o eliminarlo.
- **El patrón se busca con la API de procesos de Java** (`ProcessHandle`), sin ejecutar `pkill`: da la línea de comandos de cada proceso y permite enseñarlos antes de cerrarlos.
- **Los puertos se buscan con `ss`** en lugar de `lsof`. Sin `sudo`, `lsof` no enseña los puertos de otro usuario; `ss` enseña todos los que escuchan y solo dice el proceso de los del usuario, así que se puede avisar de un puerto ocupado que no se puede liberar. `ss` es parte de `iproute2`, que Ubuntu trae instalado.
- **El cierre no se fía del cliente.** La petición lleva los identificadores que el usuario ha visto, y el servidor repite la búsqueda y solo cierra los que siguen en ella. Sin esto, la ruta serviría para matar cualquier proceso del usuario.
- **Cajón de sastre no se cierra a sí mismo.** Lanzado desde IntelliJ en desarrollo, su línea de comandos contiene `idea_rt.jar` y coincidiría con el patrón.
- **Sin consola ni notificación de la plataforma.** El cierre es inmediato y el usuario está delante: basta un aviso de la interfaz (U-05).

## Alternativas descartadas

- **Un cierre fijo de IntelliJ.** Más sencillo, pero otro programa exigiría cambiar el código y la especificación.
- **Un clic directo, sin vista previa**, como el script. Más rápido, pero el patrón se compara con la línea de comandos entera y puede coincidir con procesos que no son IntelliJ.
- **`sudo -n`.** Solo sirve con `NOPASSWD` en `sudoers`, y da a la aplicación más permisos de los que necesita.
- **Pasar la ejecución de comandos a la plataforma.** ADR-0016 lo dejó para cuando una tercera mini app ejecutara comandos. Esta ejecuta uno solo, corto y sin entrada ni cancelación, y lo hace detrás de su propia interfaz `ProcessTable`. Mover `CommandRunner` a la plataforma obligaría a cambiar «Base de datos» y «Calidad del dato» sin que esta mini app lo necesite. Se mantiene la decisión de valorarlo cuando haya un uso que lo pida.
- **Leer `/proc` en lugar de ejecutar `ss`.** Evita el comando, pero hay que cruzar a mano los sockets de `/proc/net/tcp` y `tcp6` con los descriptores de cada proceso.

## Consecuencias

- **No hay destino nuevo.** Todo ocurre en la máquina: el principio 4 de la constitución no cambia.
- **Es la mini app más peligrosa del catálogo**: un patrón demasiado amplio cierra de más. Lo acotan la vista previa, el rechazo de un patrón que coincide con el texto vacío y que solo se cierran procesos del usuario.
- **Las pruebas no cierran nada del equipo.** La búsqueda y el cierre van detrás de `ProcessTable`, y las pruebas usan una tabla simulada. La única prueba con procesos reales cierra uno que ella misma ha lanzado.
- **La verificación real solo puede hacerse en el equipo con Ubuntu.** En el de desarrollo no hay `ss` y no se debe cerrar nada: allí la salida de `ss` se cubre con ejemplos.
