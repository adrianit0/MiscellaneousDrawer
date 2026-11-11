# ADR-0011: Mini app «Base de datos»: preparación de la base local, S3 y biblioteca de copias

- Estado: aceptada (2026-11-11)
- Requisitos: BD-01 a BD-65, S-15, P-02, constitución (principio 4)
- Modifica: constitución (principio 4), que añade S3 a la lista de destinos; S-15; ADR-0008, cuya mini app `database` deja de estar en preparación

## Contexto

El usuario prepara a diario su base de datos local con unos scripts de consola: un configurador que pregunta qué hacer y otros que descargan un volcado de S3, lo importan en un contenedor MySQL de Docker y ejecutan los scripts SQL pendientes. Pidió el mismo comportamiento dentro de Cajón de sastre, de forma visual, con la configuración escrita a mano en la aplicación, y un sistema de copias mejor: tener siempre el último volcado como copia y poder guardar otros.

Hasta ahora, los scripts guardaban una sola copia por rama, que se sobrescribía en cada descarga.

## Decisión

El usuario respondió a cuatro preguntas (2026-11-11):

1. **Va en la mini app `database`.** «Base de datos» deja de estar en preparación (ADR-0008) y pasa a ser esta. Conserva identificador, icono, color y categoría, así que las fijadas y las recientes siguen valiendo. Su descripción pasa a ser «Descarga, importa y prepara la base de datos local».
2. **Las copias son una biblioteca de volcados.** Por cada rama: el volcado actual, una copia anterior automática y las copias que el usuario conserve con nombre. Queda fuera guardar una instantánea de la base en uso antes de importar.
3. **Autoriza S3 como destino, con la CLI `aws`.** El principio 4 de la constitución añade S3 a su lista cerrada, solo para esta mini app y solo para descargar. La mini app ejecuta el comando `aws` ya instalado, con las credenciales que el usuario tenga: Cajón de sastre no pide, lee ni guarda claves de AWS, y no añade dependencias.
4. **La configuración va dentro de la mini app**, en una sección propia, y se guarda en su carpeta de configuración con permisos 600. No se amplía «Ajustes» del shell.

Diseño:

- **Sin base de datos.** La biblioteca de copias son ficheros con un nombre que lo dice todo (`auto-<fecha>.tar.gz`, `kept-<fecha>-<nombre>.tar.gz`). Lo que hay en la carpeta es lo que muestra la mini app, sin nada que pueda desincronizarse.
- **El volcado actual sigue en la misma ruta que usaban los scripts**, así que el que ya esté descargado se reconoce sin volver a bajarlo.
- **Rotar es renombrar y conservar es un enlace duro.** Ninguna de las dos operaciones copia gigas ni duplica el espacio en disco.
- **Un trabajo a la vez**, en un hilo propio, con su registro en memoria. La interfaz lo consulta por sondeo y solo mientras está visible: los eventos del servidor hacia una mini app siguen fuera de la plataforma (`diseno/mini-apps.md`).
- **Los comandos externos se ejecutan con `ProcessBuilder`** detrás de una interfaz, para poder probar las secuencias completas sin `aws` ni `docker`.

## Diferencias con los scripts

Se mantiene la secuencia de comandos, con estas correcciones:

- **La importación usa la rama elegida.** El script calculaba el nombre del fichero antes de leer sus argumentos, así que sin `--backup` importaba siempre el volcado de `hotfix`.
- **La reanudación comprueba el objeto.** El script reanudaba una descarga a medias con solo mirar que no fuera mayor que el fichero remoto. Si entre tanto se había publicado otro volcado, mezclaba los dos. Ahora se guarda el ETag y se exige en cada bloque (BD-23, BD-24).
- **No se rota si el volcado no ha cambiado.** Volver a descargar el mismo volcado dejaba como copia uno idéntico al actual y perdía el anterior de verdad (BD-22).
- **La descarga directa ya no deja al usuario sin volcado.** El script movía el actual a la copia antes de descargar; si la descarga fallaba, no quedaba volcado actual. Ahora todo se descarga a un `.part` (BD-25, BD-26).
- **Un paso fallido detiene los siguientes.** El configurador seguía importando aunque la descarga hubiera fallado, con el volcado antiguo (BD-12).
- **La contraseña no va en la línea de comandos.** Se pasa por variables de entorno, así que no se ve en la lista de procesos ni en el registro (BD-16).
- **Los scripts SQL admiten espacios en su ruta** y se puede elegir cualquier subconjunto, no solo «todos» o «uno».

No se trasladan la cabecera con el nombre y la versión del configurador ni el modo «responder no a todo», que solo tenían sentido en la consola.

## Alternativas descartadas

- **SDK de AWS para Java.** No depende de tener la CLI instalada, pero añade una dependencia pesada al JAR y obliga a decidir de dónde se leen las credenciales. La CLI es lo que el usuario ya usa y tiene configurado.
- **Una mini app nueva**, dejando `database` en preparación para un gestor de consultas. El usuario prefirió usar la que ya estaba prevista.
- **Una categoría en «Ajustes» del shell.** Exige ampliar la plataforma para que cada mini app tenga la suya. Una sección dentro de la mini app no toca el shell.
- **Guardar la biblioteca en SQLite.** Habría dos fuentes de verdad, la base y los ficheros, y habría que reconciliarlas cada vez que alguien tocara la carpeta a mano.
- **Copiar el fichero al conservar.** Son varios gigas y varios minutos por copia. El enlace duro es inmediato; a cambio, no funciona entre sistemas de ficheros distintos ni en FAT.
- **Esperar a que MySQL responda en lugar de 20 s fijos.** Es más rápido, pero cambia el comportamiento de una secuencia que hoy funciona. Se puede revisar más adelante.

## Consecuencias

- **Segundo destino autorizado.** `AppBoundariesTest` sigue impidiendo que una mini app use el actualizador del shell, pero ninguna prueba puede impedir que una mini app ejecute un comando. La garantía de que `database` solo contacta con S3, y solo para leer, es su especificación (BD-20) y las pruebas que comprueban los comandos que emite.
- **Depende de lo instalado en el equipo:** `aws`, `docker` y, para los avisos, `notify-send` y `paplay`. Si falta alguno, el paso lo dice (BD-19).
- **Depende del entorno con que arranca la aplicación.** Lanzada desde el escritorio no hereda las variables que el usuario defina solo en su terminal. Si sus credenciales de AWS dependen de ellas, habrá que añadir un campo de perfil; hoy queda fuera de alcance.
- **Los nombres fijos de los scripts pasan al código público:** el prefijo `BBDD_`, las ramas `develop` y `hotfix`, y los dos ficheros de `dynamodb/`. No son datos reales (S-30), pero describen la convención del origen. Si el usuario lo prefiere, se pueden pasar a la configuración.
- **Cerrar la ventana ya no interrumpe un trabajo.** El proceso se apagaba 15 s después de cerrar la última ventana (C-05). Con ADR-0012, la mini app se declara ocupada y el apagado espera a que termine. Un apagado pedido de forma expresa sí lo cancela (BD-18).
- **La verificación real solo puede hacerse en el equipo con Ubuntu.** En el de desarrollo no hay `aws` ni `docker`: allí se prueban las secuencias con comandos simulados y la interfaz con la aplicación arrancada.
