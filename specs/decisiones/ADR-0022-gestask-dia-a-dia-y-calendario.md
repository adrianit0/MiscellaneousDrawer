# ADR-0022: «Gestask»: día a día y calendario en el sprint 10

- Estado: aceptada (2026-11-17)
- Requisitos: GT-80 a GT-114 (nuevos); GT-20, GT-22 y GT-24 (ampliados)
- Modifica: ADR-0020, punto 4 (reparto de sprints): el «Calendario» pasa del sprint 11 al 10. No cambia el servidor, la lista de funciones ni las otras mini apps

## Contexto

El usuario pidió incluir en «Gestask» las tareas diarias, el horario diario y el calendario (2026-11-17). ADR-0020 había repartido la adaptación en tres sprints: el 10 para «Día a día» («Tareas diarias», «Horario diario» y «Diarias») y el 11 para «Seguimiento» (el calendario y el rendimiento) y los parámetros.

En la web, «Tareas diarias» es el parte del día; «Horario diario», la agenda de ese parte según los puntos de esfuerzo; y «Diarias», las tareas recurrentes de tipo `Diaria`, que se añaden a cada parte hasta que se finalizan. El horario muestra arriba las diarias del parte, y la cabecera de la web cuenta las pendientes.

Las siete funciones que usan ya estaban en la lista cerrada del servidor desde el sprint 9 (GT-11), con sus pruebas: el sprint es de especificación e interfaz.

## Decisión

El usuario aprobó el plan con dos respuestas (2026-11-17):

1. **Entran las tres secciones de «Día a día» y el «Calendario».** «Diarias» se incluye aunque no se nombró: sin ella no se pueden crear ni finalizar tareas diarias, y de ella dependen la lista del horario y el aviso de pendientes. El sprint 11 se queda con «Rendimiento», la configuración de parámetros y las horas revisadas de la imputación.
2. **«Objetivo cumplido» es llegar al objetivo del día.** La web colorea un día como cumplido con 4 puntos fijos, aunque la misma tarjeta muestre el objetivo (`3 / 12 PE`). Aquí un día está cumplido si sus puntos completados igualan o superan su objetivo: `PE_diario`, o `PE_diario_intensivo` en jornada intensiva (GT-113).

Diseño:

- **Las reglas del horario se portan sin cambiar su resultado**: el orden de las tareas, el bloque «Daily», el descanso, las tareas partidas, la jornada intensiva, «Incluir horas», el desplazamiento de las horas y los valores por defecto de los doce parámetros (GT-90 a GT-94).
- **Un solo día elegido** para «Tareas diarias» y «Horario diario», como en la web, pero con el selector de día también en el horario: en la web el horario muestra el día elegido en el parte sin decir cuál es.
- **Carga y recarga.** Al abrir se carga todo en paralelo, como en la web. Tras un cambio en una tarea se recarga todo menos los parámetros, porque ahora el parte, las diarias y el calendario también dependen de las tareas; ADR-0020 solo recargaba las tres listas de tareas. Cambiar de día o de mes pide solo esa lista, y marcar una diaria recarga solo las pendientes y el parte, como en la web.
- **Respuestas que llegan tarde.** Si se cambia de día o de mes antes de que llegue la respuesta anterior, esa respuesta se descarta y no se muestra el parte o el mes de otro día.

## Diferencias con la web

- **Aviso de diarias pendientes en la pestaña «Diarias»**, con el número, en rojo si hay atrasadas y en ámbar si son de hoy, en lugar de la píldora de la cabecera, que aquí no existe. Sin pendientes no muestra nada, como el número de «Completar».
- **Sin el botón «Ir al Backlog»** en el parte y el horario, y sin el salto al Backlog desde una tarea del calendario: pulsar la tarea abre su detalle, que es lo que se buscaba en el Backlog. Así no se sustituyen los filtros guardados del Backlog (GT-34).
- **Las horas del calendario con el formato de la imputación** (`2h 40m`, GT-75) en lugar de `2.67 hrs`.
- **Confirmaciones con el diálogo de la mini app**, no con `window.confirm`, y sin filas provisionales, como en ADR-0020.
- **«Hoy» es la fecha local**, como en el sprint 9. El parte que se puede editar y el día marcado como hoy en el calendario los decide Supabase (`editable`, `is_today`), que usa la fecha UTC; cerca de medianoche pueden no coincidir, igual que en la web.

## Alternativas descartadas

- **Dejar el calendario para el sprint 11**, como decía ADR-0020: el usuario lo pidió ahora.
- **Mantener los 4 puntos de la web** como umbral de «objetivo cumplido». Se ofreció y el usuario eligió el objetivo del día.
- **Cargar el parte y el calendario solo al entrar en su sección.** Ahorra llamadas al abrir, pero las pendientes hacen falta desde el principio para la pestaña, y la web también lo carga todo; con la carga en paralelo no se nota.
- **Recordar entre sesiones el día, el mes o la ordenación del parte.** La web no lo hace y nadie lo pidió.
- **Avisar de las diarias atrasadas con una notificación del shell** (P-21). Sería una función nueva que no existe en la web.

## Consecuencias

- **Más llamadas tras cada cambio**: siete lecturas en paralelo en lugar de tres. Siguen siendo menos que las nueve de la web.
- **El sprint 11 se acorta**: «Rendimiento», la configuración de parámetros y las horas revisadas.
- **El servidor no cambia**: las funciones ya estaban en la lista cerrada y sus pruebas ya comprobaban su método.
