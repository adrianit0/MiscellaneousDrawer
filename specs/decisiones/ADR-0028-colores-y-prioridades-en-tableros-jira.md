# ADR-0028: Colores y prioridades en «Tableros Jira»

- Estado: aceptada (2026-11-23)
- Requisitos: JR-17, JR-18, JR-19 y JR-37 (nuevos), JR-45 (nuevo); cambian JR-14, JR-20, JR-21, JR-33, JR-41 y «Fuera de alcance»
- Modifica: [requisitos/jira.md](../requisitos/jira.md). No cambia la plataforma, ni el tema, ni el destino autorizado de ADR-0027

## Contexto

Con el sprint 13 el tablero funciona, pero el usuario lo ve «demasiado seco»: todas las tarjetas son iguales. Pidió tres cosas:

1. **Elegir el color de cada estado** del tablero y ver el estado de cada tarjeta como una etiqueta de ese color.
2. **Un círculo con las iniciales del asignado**, abajo a la derecha de la tarjeta y en la línea del asignado, de un color propio de cada persona y distinto entre personas.
3. **La prioridad de cada ticket.** En su Jira hay cuatro: «Supone un impedimento», «Crítica», «Importante» y «Trivial». Como cada Jira tiene las suyas, quiere elegirlas y darles color en la configuración de cada tablero, igual que las columnas.

Su ejemplo de tarjeta:

```
PROJECT0001       Abierta
Tarea de prueba
John Doe                JD
^ Importante
```

## Decisión

Diseño presentado con el plan del sprint 14 y aprobado por el usuario (2026-11-23):

- **Una paleta cerrada de ocho colores** (`gray`, `blue`, `green`, `violet`, `orange`, `cyan`, `gold`, `red`), hechos con las variables del tema. No hay selector de color libre: con el tema oscuro único (U-01), un color cualquiera podría no leerse. La prueba del tema comprueba el contraste del texto oscuro sobre cada uno.
- **El color va en cada par proyecto-estado**, no en la columna, porque el usuario quiere ver el estado concreto. Un estado nuevo toma el color de su categoría de Jira: gris, azul o verde.
- **Las prioridades son de cada tablero** y se guardan en su definición, con su identificador de Jira, su nombre y su color. Se eligen de la lista de Jira (`GET /rest/api/3/priority/search`, de lectura).
- **Una prioridad que el tablero no tiene se muestra en gris**, con su nombre, en lugar de ocultarse: así no se pierde el dato si falta configurar alguna. Un ticket sin prioridad no tiene esa línea.
- **Un mismo icono `⌃` para todas las prioridades**, como en el ejemplo, con el color de la prioridad.
- **El color del asignado se calcula, no se configura**: uno de 18 tonos que sale del nombre, para que la misma persona tenga siempre el mismo. Si dos personas del tablero coinciden, la segunda por orden alfabético toma el siguiente tono libre. Con más de 18 personas los tonos se repiten.
- **Los tableros guardados siguen valiendo**: un estado sin color es gris y un tablero sin prioridades no tiene ninguna. No hace falta migrar la base, porque la definición es JSON.

## Alternativas descartadas

- **Ocultar las prioridades que el tablero no tiene.** Más limpio, pero se pierde información sin aviso.
- **Iconos de prioridad de Jira** (o flechas según el orden). Exigen descargar imágenes de Jira o decidir un orden; el ejemplo del usuario usa un solo icono.
- **Colores de asignado configurables.** Más trabajo de configuración para algo que el usuario quiere automático.
- **Ordenar o filtrar por prioridad y colorear las columnas.** No se pidieron (constitución, principio 2).

## Consecuencias

- La búsqueda pide un campo más (`priority`) y la mini app hace una consulta de lectura más (`priority/search`), al mismo destino de ADR-0027.
- Si se renombra una prioridad en Jira, la tarjeta muestra el nombre nuevo con el color guardado, porque va por identificador. Si se borra, el editor la marca como inexistente.
