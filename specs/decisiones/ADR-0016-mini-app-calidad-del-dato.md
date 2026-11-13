# ADR-0016: Mini app «Calidad del dato»

- Estado: aceptada (2026-11-13)
- Requisitos: CD-01 a CD-45 (nuevos), P-02 (icono nuevo `quality`)
- Modifica: nada; no cambia la plataforma ni «Base de datos»

## Contexto

El usuario comprueba los datos de su base local con un script de consola, `calidad_dato.sh`: ejecuta cada `.sql` de una carpeta contra el contenedor MySQL con `mysql -N -B` y solo muestra los que devuelven filas o errores. Si ninguno lo hace, dice «La base de datos tiene correctamente todos sus datos». Admite un nombre para ejecutar solo los ficheros que lo contienen y `--list` para listarlos.

Pidió lo mismo dentro de Cajón de sastre, de la forma más manejable para una aplicación visual y usando las notificaciones y las consolas. El script lee la misma configuración que los de importación: contenedor, contraseña y base de datos, que ya están en «Base de datos», más la carpeta `QUALITY_SQL_FOLDER`.

## Decisión

El usuario respondió a dos preguntas (2026-11-13):

1. **Es una mini app propia, con su configuración.** «Calidad del dato» (`quality`) guarda sus cuatro valores en su carpeta de configuración y los importa de un `.sh` como «Base de datos». El contenedor, la contraseña y la base se escriben en los dos sitios.
2. **Lista y tabla.** Una lista de scripts con casillas y su resultado; al pulsar uno con filas se ven en una tabla. La salida completa va a la consola, y al terminar se emite una notificación.

Diseño:

- **Identidad**: `quality`, «Calidad del dato», «Comprueba los datos de la base local con scripts SQL», icono nuevo `quality`, color `cyan` y categoría `data`.
- **`mysql --xml` en lugar de `-N -B`.** Para pintar una tabla hacen falta los nombres de las columnas y separar los conjuntos de resultados de un script con varios `SELECT`. En formato tabulado, la cabecera de un segundo conjunto no se distingue de una fila, y `NULL` no se distingue de la cadena «NULL». El XML de `mysql` marca cada conjunto, cada columna y cada nulo. Se lee con StAX, sin DTD ni entidades externas.
- **La salida se acota.** Se guardan 1000 filas por script y se leen como mucho 32 MiB de salida: un script de calidad mal escrito puede devolver la tabla entera.
- **Mismos criterios que el script de consola.** Una incidencia es un script con filas o con salida de error. Se comprueba antes que el contenedor esté levantado.
- **«Filtrar» sustituye al parámetro y a `--list`**: la lista siempre está a la vista y el filtro deja ver los que contienen el texto.
- **Los resultados viven en memoria**, como las consolas: pueden contener datos de la base, que no deben quedar en la carpeta de datos ni en el registro.

## Alternativas descartadas

- **Una sección «MySQL local» en «Ajustes» del shell** que la plataforma ofrezca a las mini apps. Una sola fuente para los tres valores, pero amplía la plataforma y obliga a migrar la configuración de «Base de datos». Se puede hacer más adelante si llega una tercera mini app que los necesite.
- **Una sección dentro de «Base de datos».** Comparte la configuración sin más, pero no aparece como mini app propia en el lanzador, y el usuario pidió una aplicación nueva.
- **Leer la configuración de «Base de datos».** Lo prohíbe el principio 3 de la constitución (P-18).
- **Solo lista y consola.** Más sencillo, pero obliga a buscar en la consola las filas de cada script.

## Consecuencias

- **Código repetido.** La ejecución de comandos (`Command`, `CommandRunner`, `ProcessRunner`), la importación del `.sh`, el diálogo de confirmación y parte de los estilos se repiten en `apps/quality/`, porque una mini app no puede importar el código de otra (P-18). Si una tercera mini app necesita ejecutar comandos, se valorará pasarlo a la plataforma con su ADR.
- **La configuración se escribe dos veces.** Si cambia la contraseña del contenedor, hay que cambiarla en las dos mini apps. Importar el mismo `.sh` en las dos lo hace en dos pasos.
- **No hay destino nuevo.** Solo se ejecuta `docker` en la máquina local: el principio 4 de la constitución no cambia.
- **La verificación real solo puede hacerse en el equipo con Ubuntu.** En el de desarrollo no hay `docker`: allí se prueban las secuencias con comandos simulados y la interfaz con la aplicación arrancada. El formato XML de `mysql` está cubierto con salidas de ejemplo.
