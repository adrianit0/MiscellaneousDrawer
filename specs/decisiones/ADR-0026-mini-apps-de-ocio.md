# ADR-0026: Mini apps de ocio: «Lootboxes» e «Inventario»

- Estado: aceptada (2026-11-22, con las respuestas del usuario y la aprobación del plan del sprint 12)
- Requisitos: LB-01 a LB-27, IN-01 a IN-21 y GT-120 (nuevos); P-02 y L-01 (categoría «Ocio»)
- Modifica: «Gestask», que lee los PE cerrados del calendario para «Lootboxes» (GT-120); el reparto de sprints de ADR-0023 («Rendimiento» de «Gestask» pasa al sprint 13). No cambia Supabase, la lista de destinos ni las otras mini apps

## Contexto

El usuario pidió (2026-11-22) dos mini apps «de antiproductividad», al contrario que las demás: un sistema de juegos para relajarse un rato durante la Daily.

- **Lootboxes**: abrir cofres de forma animada; cada uno da entre 1 y 3 objetos al azar. El contenido crecerá con las versiones; al principio son cinco orbes.
- **Inventario**: las recompensas conseguidas en los cofres.

Reglas que dio:

1. Un cofre por cada PE conseguido en las tareas de «Gestask», hasta 8 al día.
2. No se toca el backend de Gestask: los datos se obtienen y se guardan en la máquina, como en las demás mini apps.
3. Los cofres nuevos están bloqueados hasta las 8:00 del día siguiente.
4. Todo cabe en 20 minutos como mucho; si lo que se añada en el futuro lo supera, se reduce o se simplifica.
5. Son distracciones breves y concretas que no pueden afectar al trabajo: mientras se resuelven tareas no se informa de los cofres conseguidos.
6. Probabilidades: orbe blanco 80 %, verde 16 %, azul 3,2 %, morado 0,65 % y dorado 0,15 %.

## Decisión

Preguntas hechas al usuario y sus respuestas (2026-11-22):

1. **Dos mini apps**, unidas por el buzón de la plataforma (ADR-0025).
2. **Los PE de un día son los cerrados ese día según el calendario de «Gestask»** (`completed_points` de `calendar-month-get`), que el servidor de «Gestask» ya reenvía cada vez que se abre o cambia una tarea (GT-22, GT-24). Cuentan también las tareas cerradas desde la web, en cuanto se abre «Gestask» en Cajón de sastre. Si el número de un día baja después, los cofres ya conseguidos se quedan.
3. **Los 20 minutos son un límite de diseño, no un temporizador.** Animaciones y contenido se dimensionan para que abrir los cofres de un día y mirar el inventario lleve bastante menos. Cada función nueva se mide contra ese límite.
4. **Los cofres desbloqueados se acumulan** y no caducan. «Abrir todos» los abre de una vez para no alargar la sesión.

Decisiones tomadas sin preguntar, por ser lo más conservador o lo más simple:

- **Sin cofres retroactivos.** Solo cuentan los días desde el primer arranque de «Lootboxes»: el calendario tiene meses de historial que darían de golpe decenas de cofres, en contra del límite de 20 minutos.
- **Número de recompensas**: 1, 2 o 3, cada uno con probabilidad 1/3. Cada recompensa se sortea por separado con la tabla de botín.
- **El azar está en el servidor** (`SecureRandom`), y la apertura se guarda antes de mostrar la animación: cerrar la ventana a mitad no pierde ni repite un cofre (principio 7).
- **Los cofres bloqueados no se ven.** «Lootboxes» solo muestra los desbloqueados, sin contador de los que vienen. No hay notificaciones, consolas, avisos ni marcas en el lanzador o en «Gestask». Así, conseguir un cofre no se nota mientras se trabaja (regla 5).
- **La hora de desbloqueo es fija, las 8:00 locales**, como pidió el usuario, y no la `hora_inicio` de «Gestask».
- **El inventario guarda nombre y rareza de cada objeto** tal como llegan en el mensaje. Así, añadir un objeto nuevo en una versión futura solo cambia la tabla de botín de «Lootboxes».
- **Categoría nueva «Ocio»** (`leisure`) en el lanzador, la última: separa estas mini apps de las de trabajo.
- **Identidad**: `lootboxes`, «Lootboxes», icono nuevo `chest`, color `orange`; `inventory`, «Inventario», icono nuevo `inventory`, color `violet`. Prefijos LB e IN.

## Presupuesto de tiempo

Con los 8 cofres de un día:

| Acción | Tiempo |
|---|---|
| Abrir un cofre (animación completa, LB-22) | 3 s como mucho; se puede saltar |
| Los 8 cofres, uno a uno | menos de 30 s de animación |
| «Abrir todos» (LB-23) | 2 s como mucho |
| Mirar el inventario | una pantalla, sin navegación |

Queda margen de sobra en los 20 minutos para los juegos que lleguen después. Una función nueva que no quepa en el margen restante se simplifica antes de añadirse.

## Alternativas descartadas

- **Un temporizador o una ventana horaria** de 20 minutos. El usuario prefirió el límite de diseño.
- **Contar solo las tareas pasadas a `Done` desde Cajón de sastre.** Perdería las cerradas desde la web y se descuadraría al reabrir una tarea.
- **Cofres retroactivos desde el historial del calendario**: véase arriba.
- **Mostrar los cofres bloqueados con su hora de apertura.** Es justo el aviso que el usuario no quiere durante el trabajo.
- **Que «Lootboxes» pida a «Gestask» los PE** cuando se abre. Exigiría que «Gestask» llame a Supabase por petición de otra mini app; con GT-120, los PE llegan solos cuando el usuario ya trabaja con «Gestask».

## Consecuencias

- **«Gestask» interpreta una respuesta** por primera vez: lee `completed_points` de `calendar-month-get`. Si falla la lectura o el envío, la respuesta a la interfaz no cambia.
- **Los cofres dependen de abrir «Gestask» en Cajón de sastre**: un día trabajado solo desde la web no da cofres hasta que se abre «Gestask» aquí y se carga su mes.
- **El sprint 12 es el de estas mini apps**; «Rendimiento», los parámetros y las horas revisadas de «Gestask» pasan al 13.
