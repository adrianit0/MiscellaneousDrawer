# Sprint 10: «Gestask»: día a día y calendario

## Objetivo

Llevar a la mini app «Gestask» el trabajo diario de su versión web, sobre el mismo Supabase y sin tocar su backend: el parte del día, el horario que sale de él, las tareas diarias recurrentes y el calendario de puntos completados. Es el segundo de tres sprints (ADR-0020, ADR-0022).

## Requisitos cubiertos

- Gestask: GT-80 a GT-114 (nuevos); GT-20, GT-22 y GT-24 (ampliados).

Documentos: [requisitos/gestask.md](../requisitos/gestask.md), [ADR-0022](../decisiones/ADR-0022-gestask-dia-a-dia-y-calendario.md), [ADR-0020](../decisiones/ADR-0020-mini-app-gestask.md).

## Tareas

1. **Especificación.** Requisitos GT, ADR-0022, la nota de ADR-0020 y este sprint.
2. **Lógica**, en `frontend/src/apps/gestask/logic.ts`: jornada y horario (GT-90 a GT-94), resumen de pendientes (GT-103, GT-106) y objetivo y color de cada día (GT-112, GT-113), portados de la web con sus pruebas.
3. **Interfaz**, carpeta `frontend/src/apps/gestask/`: «Tareas diarias», «Horario diario», «Diarias» con su formulario y «Calendario» con el diálogo del día; los selectores de día y de mes; y en `GestaskApp`, las secciones, las cargas, las recargas y el número de pendientes.
4. **Catálogo.** La descripción y las palabras clave del manifiesto dicen lo que hace ahora.
5. **Pruebas** de interfaz en `frontend/src/test/gestaskDaily.test.tsx`, con la API simulada.
6. **Documentación.** `README.md`.
7. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada.

El servidor no cambia: las funciones ya están en la lista cerrada (GT-11) y sus pruebas comprueban su método.

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- Las secciones nuevas tienen su subruta y su nombre en la miga de pan.
- «Nuevo día» crea el parte de hoy; cambiar de día muestra el parte de ese día, de solo lectura si es anterior.
- El horario coincide con el de la web para los mismos parámetros: «Daily», descanso, tareas partidas, jornada intensiva e «Incluir horas».
- Marcar una diaria en el horario o en «Diarias» la saca de las pendientes y cambia el número de la pestaña.
- Crear, editar, finalizar, reactivar y eliminar una tarea diaria envía lo mismo que la web.
- El calendario muestra los días laborables del mes con sus puntos frente al objetivo del día, y cambiar el tipo de un día lo guarda.
- Ninguna prueba contacta con un servidor.
- Con el Supabase real del usuario: el parte, el horario, las diarias y el calendario coinciden con los de la web, y un cambio en un lado se ve en el otro.

## Resultado

Fecha: 2026-11-17. Hecho en el código y probado con Supabase simulado, en las pruebas y con la aplicación arrancada. Sin commits todavía. Falta la verificación con el Supabase real del usuario.

### Hecho

- **Especificación:** `requisitos/gestask.md` (GT-80 a GT-114; GT-20, GT-22 y GT-24 ampliados; tabla de funciones y fuera de alcance), ADR-0022 aceptada, la nota del punto 4 de ADR-0020 y este sprint.
- **Lógica (`logic.ts`):** jornada y horario portados de `dailySchedule.js` (`workday`, `isIntensive`, `buildSchedule`, `formatClock`), resumen de pendientes, cuerpo de una diaria, semana laborable del calendario y color de cada día.
- **Interfaz (`frontend/src/apps/gestask/`):** `Daily.tsx` (parte con selector de día, ordenación, estado y PR en la tabla y modo histórico), `Schedule.tsx` (agenda e «Incluir horas», con la lista de diarias del parte), `Routine.tsx` y `DailyTaskForm.tsx` (pendientes, activas, finalizadas y formulario reducido), `Calendar.tsx` (cuadrícula, leyenda y diálogo del día) y `Pickers.tsx` (selectores de día y de mes). En `GestaskApp`, las cuatro secciones, la carga de todo al abrir, las recargas parciales al cambiar de día o de mes y el número de pendientes en la pestaña «Diarias».
- **Catálogo:** descripción «Tareas, parte diario, horario y calendario sobre Supabase» y palabras clave nuevas; `AppCatalogTest` comprueba la descripción.
- **Servidor:** sin cambios; las funciones ya estaban en la lista cerrada.
- **Documentación:** `README.md`.
- **Pruebas:** `./mvnw verify` en verde, con 460 de backend (19 omitidas en Windows, las mismas de antes) y 361 de interfaz.
  - Nuevas de interfaz: 23 en `frontend/src/test/gestaskDaily.test.tsx`, 6 de ellas de las reglas portadas.
  - Adaptadas: 5 de `gestaskApp.test.tsx`, que ahora esperan las cargas nuevas (GT-22, GT-23, GT-24).
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados y un Supabase simulado en `http://127.0.0.1` (un servidor de prueba fuera del repositorio): las nueve pestañas; «Diarias» con una pendiente atrasada y la pestaña en rojo; «Nuevo día» crea el parte, que muestra sus tareas con estado y PR, y la pestaña sube a 3; el horario coincide con el cálculo a mano (Minute_PE 30, cuatro tareas de 3 PE de 9:00 a 16:00 con el descanso de 14:00 a 15:00, `12 / 12 PE`); marcar una diaria en el horario la tacha, avisa y baja el número, y solo pide las pendientes y el parte; pulsar un bloque abre el detalle; el calendario de noviembre muestra los viernes con objetivo 9, el día con 12 PE en verde, el festivo con su nota y las horas con el formato de la imputación; guardar un día como «Vacaciones» solo vuelve a pedir el mes; y «Marcar todas como realizadas» pide confirmación, vacía las pendientes y quita el número. Los registros no contienen la contraseña ni el token.

### Pendiente

- **Verificación con el Supabase real**: comprobar que el parte, el horario (con los parámetros de jornada del usuario), las diarias y el calendario coinciden con los de la web, y que marcar una diaria o cambiar un día en un lado se ve en el otro. Sigue pendiente también la del sprint 9.
- No se recorrieron con la aplicación arrancada la ordenación del parte, el modo histórico, «Incluir horas», el cambio de mes, ni crear, editar, finalizar, reactivar y eliminar una diaria: están cubiertos por las pruebas.
- Sprint 11: «Rendimiento», la configuración de parámetros y las horas revisadas de la imputación.

### Desviaciones y decisiones

- **ADR-0022 (aceptada):** entran «Diarias» y el «Calendario», que pasa del sprint 11 al 10; «objetivo cumplido» es llegar al objetivo del día y no 4 PE fijos; aviso de pendientes en la pestaña; sin «Ir al Backlog»; horas del calendario con el formato de GT-75; tras un cambio se recarga todo menos los parámetros.
- **El selector de día también está en el horario**: en la web, el horario muestra el día elegido en el parte sin decir cuál.
- **GT-90 se ajustó al resultado de la web**: una tarea sin orden cuenta como 0 (`Number(null)`), no va al final.
- **GT-95 se ajustó a la web**: el aviso «No hay tareas con esfuerzo…» solo sale si la agenda queda vacía; con parte y sin tareas, la agenda muestra el bloque «Daily».
- **Palabras clave:** el manifiesto admite diez; entran «diarias», «horario», «calendario» y «parte», y salen «tickets» e «imputar».
