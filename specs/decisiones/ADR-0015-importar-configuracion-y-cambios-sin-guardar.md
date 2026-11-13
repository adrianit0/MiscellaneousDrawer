# ADR-0015: «Base de datos»: importar la configuración de un .sh y avisar de los cambios sin guardar

- Estado: aceptada (2026-11-13)
- Requisitos: BD-66 y BD-67 (nuevos), BD-65
- Modifica: ADR-0011 (punto 4: la configuración se escribe a mano)

## Contexto

La configuración de «Base de datos» se escribe a mano campo a campo (ADR-0011). El usuario ya tiene esos valores en el fichero de configuración de sus scripts de consola, un `.sh` con asignaciones como `BASE_DIR="…"`, y al pasarlos a mano no consiguió que funcionara. Pidió dos cosas:

1. Importar los ajustes de un `.sh`: elegir el fichero y que se rellenen solos los campos.
2. Que al cambiar de pestaña con valores sin guardar salga un diálogo que avise de que se perderán, con «Guardar», «Salir sin guardar» y «Cancelar».

## Decisión

El usuario respondió a tres preguntas (2026-11-13):

1. **Importar rellena el formulario, pero no guarda.** Los valores quedan como cambios sin guardar: se revisan y se pulsa «Guardar». Si se sale sin guardar, salta el aviso de BD-67.
2. **Un valor que no es una ruta absoluta se omite y se avisa.** En el `.sh` de los scripts, `INITDB_FILE` y `NAME_FILE` traen solo el nombre del fichero. La importación deja esos campos como estaban y su resumen dice que hay que escribir la ruta a mano.
3. **El aviso sale solo al cambiar de sección dentro de la mini app.** Con «Atrás» y «Adelante» (N-02) no hay aviso: «Configuración» sigue montada y oculta, y lo escrito se conserva. Cerrar la mini app (N-06) o la ventana sigue descartando lo que no se haya guardado.

Diseño:

- **El fichero se lee en el navegador y no se envía al servidor.** Solo se toman las variables de la tabla de BD-66; las demás se ignoran sin leer su valor. Entre ellas, las credenciales que pueda tener el `.sh` para otros sistemas: no llegan ni al formulario ni al servidor. Lo importado se trata igual que lo escrito a mano: llega al servidor de Cajón de sastre, en la misma máquina, solo al pulsar «Guardar», y sigue BD-01 y BD-02.
- **No hace falta cambiar el servidor.** El formulario ya valida al guardar (BD-01). La importación solo descarta lo que no podría pasar esa validación por motivos que ya conoce: rutas relativas, puertos fuera de rango y valores que dependen de la shell.
- **No se ejecuta ni se interpreta la shell.** Se leen asignaciones simples, una por línea. Un valor que usa variables (`$VAR`, `${VAR}`, `~`) o comandos (`` ` ``, `$(…)`) se omite, porque su valor real solo se conoce ejecutando el script.
- **El diálogo reutiliza `Confirm`**, que gana un tercer botón opcional para «Salir sin guardar».

## Alternativas descartadas

- **Enviar el fichero al servidor y leerlo en Java.** Haría salir del navegador todo el `.sh`, credenciales ajenas incluidas, para nada: leerlo en el navegador basta.
- **Expandir las variables definidas antes en el mismo fichero.** Cubre más casos, pero no los que dependen del entorno (`$HOME`) ni los comandos, y el `.sh` del usuario no lo necesita. Se puede añadir si hace falta.
- **Que la importación guarde en el acto.** El usuario prefirió revisar antes de guardar.
- **Escribir tal cual los valores que no son rutas absolutas.** La validación los marcaría al guardar, pero el campo quedaría con un valor que nunca vale.
- **Avisar también al cerrar la mini app o la ventana.** Exige que el shell pregunte a la mini app antes de desmontarla, una ampliación de la plataforma que queda fuera de alcance.

## Consecuencias

- **Los nombres de las variables del `.sh` pasan al código público**, igual que el prefijo `BBDD_` y las ramas (ADR-0011). No son datos reales (S-30): las pruebas usan valores inventados (S-31).
- **Si el `.sh` cambia de nombres de variable, la importación deja de reconocerlos.** Se ve en el resumen, que dice cuántos campos ha rellenado. Habría que actualizar la tabla de BD-66.
- **«Configuración» queda montada siempre**, como «Preparar», para conservar lo escrito al cambiar de sección con «Atrás» y «Adelante».
