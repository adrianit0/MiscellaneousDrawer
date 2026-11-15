# ADR-0019: Mini app «Repositorios» y servidores git como destino

- Estado: aceptada (2026-11-14)
- Requisitos: RG-01 a RG-45 (nuevos), S-15, P-02 (icono nuevo `repos`), constitución (principio 4)
- Modifica: constitución (principio 4), que añade a la lista de destinos los servidores git de los repositorios configurados; S-15. No cambia la plataforma ni las otras mini apps

## Contexto

La aplicación principal del usuario depende de varias API pequeñas, cada una en su repositorio git, y todas deben estar al día para que funcione. Lo resolvía con un script de consola, `actualizarAPIS.sh`: una lista fija de nombres, carpetas y remotos; en cada una, `git checkout develop` y `git pull`, con el usuario y la contraseña metidos en la URL, y al final «actualizado» o «no hay nueva versión» según cambiara el commit.

Pidió una mini app con todas sus API, en la que se pueda configurar el git de cada una, cambiar de rama y actualizar.

## Decisión

El usuario respondió a cuatro preguntas (2026-11-14):

1. **Autoriza los servidores git como destino, solo para leer.** El principio 4 de la constitución añade a su lista cerrada el servidor del remoto de cada repositorio configurado, solo para esta mini app y solo para traer cambios: `fetch`, `pull` y `clone`. Nunca `push`.
2. **Las credenciales son las de su git.** La mini app ejecuta el `git` instalado con lo que el usuario ya tenga configurado (ayudante de credenciales o claves SSH), como «Base de datos» hace con `aws`. Cajón de sastre no pide, lee ni guarda contraseñas de git.
3. **La lista es editable y nace vacía.** Cada repositorio se crea en la mini app con nombre, carpeta, URL del remoto y rama por defecto. Los nombres reales no pueden estar en un repositorio público (S-30).
4. **Operaciones**: además de ver la rama y el estado, cambiar de rama y actualizar, pidió «Actualizar todas», clonar el que falta, ver los commits pendientes y descartar los cambios locales.

Diseño:

- **Identidad**: `repos`, «Repositorios», «Mantiene al día los repositorios git del proyecto», icono nuevo `repos`, color `blue` y categoría `utilities`. El nombre es genérico porque sirve para cualquier repositorio, no solo para una API.
- **La lista es configuración**: un fichero JSON en la carpeta de configuración de la mini app, sin base de datos, como los perfiles de «Cerrar procesos».
- **El estado es local y los trabajos no.** Ver la rama, los cambios y los commits pendientes solo lee la copia local, así que se puede pedir siempre que se abre la mini app. Lo que contacta con el remoto o modifica la copia es un trabajo: uno a la vez, en un hilo propio, con su consola, cancelable, y solo cuando el usuario pulsa un botón.
- **Los commits pendientes son los de la última consulta.** Saber cuánto falta exige un `fetch`; no se hace solo. «Consultar todas» lo hace en todos.
- **`pull --ff-only`.** El script hacía un `pull` normal, que puede crear un commit de mezcla o dejar la copia a medias con conflictos. Estas copias están para ejecutarse, no para desarrollar en ellas: si la rama no puede avanzar sin más, el comando falla y no toca nada.
- **`git` no puede quedarse esperando una contraseña.** Sin entrada, con `GIT_TERMINAL_PROMPT=0` y SSH en modo desatendido: si las credenciales no están configuradas, el trabajo falla y la consola dice por qué.
- **Lo que escribe el usuario no puede leerse como una opción de `git`**: los nombres de rama y las URL se validan, y la URL y la carpeta de `clone` van detrás de `--`.
- **El remoto de la copia es `origin`.** Si su URL no es la configurada, se avisa y se ofrece cambiarla. Así «configurar el git» de un repositorio ya clonado es un clic, y la mini app no cambia nada por su cuenta.
- **«Descartar cambios» es `reset --hard`, sin `clean`.** Deshace lo modificado y deja los ficheros sin seguimiento, que suelen ser configuración local.

## Diferencias con el script

- **La contraseña no va en la URL.** El script la metía en la línea de comandos de `git pull`, visible en la lista de procesos.
- **Un fallo se ve.** El script enviaba la salida de `git` a `/dev/null`: un `pull` fallido se mostraba como «no hay nueva versión».
- **No se cambia de rama si no se pide.** «Actualizar» actualiza la rama en la que está el repositorio; solo «Actualizar todas» vuelve a la rama por defecto, como el script.
- **Clonar** sustituye al bloque comentado del script (`git init`, `fetch` y `reset --hard`), y solo en una carpeta vacía o que no existe.

## Alternativas descartadas

- **Guardar usuario y token en la mini app** y pasarlos a `git` por variables de entorno. Funciona sin configurar nada fuera, pero Cajón de sastre pasaría a guardar un secreto que da acceso al código. El usuario prefirió no guardarlo.
- **JGit.** No depende del `git` instalado, pero añade una dependencia pesada, no usa el ayudante de credenciales del usuario y obliga a decidir de dónde salen las claves.
- **Una lista fija o inicial de API**, como el perfil de IntelliJ de «Cerrar procesos». Aquí los nombres y las URL son datos reales (S-30, S-32).
- **Detectar los repositorios de una carpeta base.** Se ofreció y el usuario eligió la lista escrita a mano.
- **Pasar la ejecución de comandos a la plataforma.** Es la tercera mini app con un `CommandRunner` propio, el momento que ADR-0016 señaló para valorarlo. Se mantiene la copia: moverlo obliga a cambiar «Base de datos» y «Calidad del dato» dentro de un sprint que no las toca. Queda como mejora propia, con su ADR, si el usuario la pide.
- **Permitir `push`.** Se ofreció y el usuario eligió solo lectura.

## Consecuencias

- **Tercer destino autorizado**, y el primero que no es un servicio fijo: son los servidores que el usuario escriba. Lo acotan que la URL solo puede ser HTTPS o SSH y que la mini app solo ejecuta `fetch`, `pull` y `clone` contra ella. Como en ADR-0011, ninguna prueba puede impedir que una mini app ejecute un comando: la garantía es su especificación (RG-22) y las pruebas que comprueban los comandos que emite.
- **`git` ejecuta código del usuario.** Los ganchos del repositorio y el ayudante de credenciales se ejecutan como en una terminal. Es lo que el usuario ya hace a mano con esos mismos repositorios.
- **Depende del entorno con que arranca la aplicación**, como «Base de datos»: lanzada desde el escritorio, un agente SSH que solo exista en la terminal no está disponible.
- **«Descartar cambios» pierde trabajo sin recuperación.** Lo acotan la confirmación, que dice cuántos ficheros se deshacen, y que no borra ficheros sin seguimiento.
- **Código repetido**: `Command`, `CommandRunner` y `ProcessRunner` por tercera vez (P-18).
- **Las pruebas no contactan con ningún servidor.** Las secuencias se prueban con comandos simulados; las que usan un `git` real trabajan con repositorios creados en una carpeta temporal y un remoto que es otra carpeta.
