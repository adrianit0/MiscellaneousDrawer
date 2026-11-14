# Requisitos de «Cerrar procesos»

La mini app «Cerrar procesos» (`processes`) cierra a la fuerza un programa que se ha quedado colgado y los procesos que dejó escuchando en sus puertos. Sustituye al script de consola `cerrarIntelliJ.sh`, que mataba IntelliJ IDEA y las API que tenía levantadas en los puertos 8080 a 8090. Las decisiones están en [ADR-0018](../decisiones/ADR-0018-mini-app-cerrar-procesos.md).

Qué se cierra lo dicen los **perfiles**, que el usuario crea y edita en la mini app: añadir otro programa no exige tocar el código. Prefijo de requisitos: **CP**.

Términos:

- **Perfil**: un nombre, un patrón de procesos, un rango de puertos, o las dos cosas.
- **Búsqueda**: los procesos que un perfil cerraría en ese momento.
- **Cierre**: terminar a la fuerza los procesos de una búsqueda, como `kill -9`.

## Perfiles

| ID | Requisito |
|---|---|
| CP-01 | Los perfiles se guardan en `<config>/apps/processes/profiles.json` (P-09), con permisos 600 y sustituyendo el fichero de golpe. Cada perfil tiene un identificador numérico que no se reutiliza y los valores de la tabla siguiente. |
| CP-02 | Mientras ese fichero no existe hay un perfil, «IntelliJ IDEA», con el patrón `idea\|IntelliJ` y los puertos 8080 a 8090: lo que hacía el script de consola. El fichero se escribe con el primer cambio; desde entonces la lista es la que deje el usuario, también vacía. Un fichero que no se puede leer o no cumple CP-03 se trata como si no existiera. |
| CP-03 | Al crear o modificar un perfil se valida el formato de cada valor. Un valor incorrecto impide guardar e indica el campo: 400 `invalid_profile` con `details.field`. Un perfil necesita un patrón, un rango de puertos, o las dos cosas. Los dos puertos se escriben juntos o ninguno, y el inicial no es mayor que el final. Un patrón que coincide con el texto vacío se rechaza, porque coincidiría con todos los procesos. |
| CP-04 | Se pueden crear, modificar y eliminar perfiles, hasta 50: crear otro responde 409 `too_many_profiles`. Un identificador que no existe responde 404 `profile_not_found`. `GET /profiles` los devuelve en el orden en que se crearon. |

| Campo | Clave | Formato |
|---|---|---|
| Nombre | `name` | 1 a 60 caracteres, sin contar los espacios de los extremos |
| Patrón de procesos | `processPattern` | Expresión regular de hasta 200 caracteres, o `null` |
| Puerto inicial | `portFrom` | Entero de 1 a 65535, o `null` |
| Puerto final | `portTo` | Entero de 1 a 65535, o `null` |

## Búsqueda

| ID | Requisito |
|---|---|
| CP-10 | `GET /profiles/{id}/scan` devuelve los procesos que el perfil cerraría en ese momento. No cierra nada. |
| CP-11 | **Por patrón.** Un proceso coincide si el patrón aparece en alguna parte de su línea de comandos, con mayúsculas y minúsculas distintas, como `pkill -f`. |
| CP-12 | **Por puertos.** Un proceso coincide si escucha en un puerto TCP del rango. Se obtienen con `ss -H -l -t -n -p`, sin `sudo`. El comando se ejecuta sin `_JPACKAGE_LAUNCHER` ni `LD_LIBRARY_PATH`. |
| CP-13 | Cada proceso aparece una vez, con su identificador (`pid`), su línea de comandos (`command`, hasta 300 caracteres), los puertos del rango en los que escucha (`ports`, en orden) y si coincide con el patrón (`byPattern`). Van por orden de `pid`. |
| CP-14 | El proceso de Cajón de sastre no aparece nunca en una búsqueda ni se cierra, aunque coincida con el patrón o escuche en el rango. |
| CP-15 | Sin `sudo` solo se ve el proceso de un puerto si es del usuario. Los puertos del rango ocupados por un proceso que no se ve van en `blockedPorts`, en orden. Si `ss` no existe o falla, la búsqueda por patrón sigue y `warning` lo dice: «No se encontró el comando «ss»: no se pueden buscar los procesos de los puertos». Sin aviso, `warning` es `null`. |

## Cierre

| ID | Requisito |
|---|---|
| CP-20 | `POST /profiles/{id}/close` con `{"pids": [1234, 5678]}` cierra esos procesos. La lista tiene de 1 a 500 enteros positivos: si no, 400 `invalid_request`. |
| CP-21 | Solo se cierra lo que el usuario ha visto y sigue ahí: antes de cerrar se repite la búsqueda, y un identificador pedido que ya no está en ella no se toca y va en `gone`. Así la API no sirve para cerrar un proceso cualquiera. |
| CP-22 | Cada proceso se termina a la fuerza, como `kill -9`, sin `sudo` y sin tocar a sus hijos, y se espera hasta 3 segundos a que desaparezca. Los que desaparecen van en `closed`; los que no se pueden terminar o siguen vivos, en `failed`, con su `pid` y su `command`. Uno que falla no detiene los demás. |
| CP-23 | En el registro del shell solo queda el identificador del perfil y cuántos procesos se cerraron, fallaron y ya no estaban, sin líneas de comandos (S-21). |

## Interfaz

| ID | Requisito |
|---|---|
| CP-30 | La mini app tiene una sola pantalla: a la izquierda, la lista de perfiles y «Nuevo perfil»; a la derecha, el perfil elegido. El elegido se recuerda (P-14); si ya no existe, se elige el primero. Su nombre va en la miga de pan (N-07). Sin perfiles, lo dice e invita a crear uno. |
| CP-31 | El perfil elegido muestra su patrón y sus puertos y, debajo, la búsqueda en una tabla con «PID», «Puertos» y «Comando». Sin procesos dice «No hay nada que cerrar». Los puertos de `blockedPorts` se avisan con «Ocupados por procesos de otro usuario, que no se pueden cerrar: <puertos>», y `warning` se muestra tal cual. |
| CP-32 | La búsqueda se hace al elegir un perfil, al pulsar «Actualizar», después de un cierre y cuando la mini app vuelve a verse (N-05). No se repite sola. |
| CP-33 | «Cerrar todo» cierra los procesos de la tabla, sin diálogo: la tabla es la confirmación. Está desactivado si no hay ninguno o mientras se cierra. Al terminar avisa (U-05) con «Se ha cerrado 1 proceso» o «Se han cerrado <N> procesos»; si alguno falla, con «No se han podido cerrar <M> de <N> procesos», de tipo error; y si no quedaba ninguno, con «Los procesos ya no estaban». Después repite la búsqueda. |
| CP-34 | «Nuevo perfil» y «Editar» muestran un formulario con los campos de CP-03, «Guardar» y «Cancelar». Un error de formato se muestra junto a su campo. Al guardar un perfil nuevo queda elegido. «Eliminar» pide confirmación (U-05). |

## API

Todas las rutas cuelgan de `/api/apps/processes` (P-06) y siguen A-01 a A-03.

| Método | Ruta | Descripción |
|---|---|---|
| GET | /profiles | `{"profiles": […]}` (CP-04) |
| POST | /profiles | Crea un perfil. 201 con el perfil; 400 `invalid_profile`, 409 `too_many_profiles` (CP-03, CP-04) |
| PUT | /profiles/{id} | Modifica un perfil. 400 `invalid_profile`, 404 `profile_not_found` |
| DELETE | /profiles/{id} | Elimina un perfil. 404 `profile_not_found` |
| GET | /profiles/{id}/scan | `{"processes": […], "blockedPorts": […], "warning": null}` (CP-10 a CP-15) |
| POST | /profiles/{id}/close | `{"pids": […]}` → `{"closed": […], "failed": […], "gone": […]}` (CP-20 a CP-22) |

## Fuera de alcance

- Cerrar con `sudo` procesos de otro usuario (ADR-0018).
- Un cierre ordenado (`SIGTERM`) antes del forzado, o cerrar también los procesos hijos.
- Elegir en la tabla qué procesos cerrar: se cierran todos los del perfil.
- Volver a abrir el programa después de cerrarlo.
- Cerrar un perfil desde fuera de la ventana: atajo global, línea de comandos o programación.
- Buscar por puertos en un sistema sin `ss`, como Windows, donde solo se desarrolla (ADR-0004).
