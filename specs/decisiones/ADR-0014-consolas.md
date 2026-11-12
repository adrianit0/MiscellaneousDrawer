# ADR-0014: Consolas de la plataforma

- Estado: aceptada (2026-11-12, con las respuestas del usuario al plan)
- Requisitos: P-25 a P-28 y N-14 a N-17 (nuevos); P-05, P-12, D-04, BD-13, BD-14, BD-62 y BD-63 (modificados)
- Modifica: ADR-0011, que dejó el registro del trabajo dentro de «Base de datos»

## Contexto

«Base de datos» muestra la salida de sus comandos en un registro propio dentro de «Preparar» (BD-14, BD-62). Solo se ve con esa sección abierta, solo conserva el último trabajo y cada mini app que llegue con trabajos largos tendría que repetir el registro, su ruta y su interfaz.

El usuario pidió (2026-11-12), igual que con las notificaciones, un visualizador general: un panel desplegable abajo, a todo el ancho y de altura variable, con la lista de consolas a la izquierda (nombre, mini app y estado) y la salida de la elegida a la derecha, de solo lectura, con un botón para limpiar las terminadas o con error. Un sitio único, visible y sencillo para la salida de todas las mini apps, con histórico.

Una **consola** es la salida de texto de una ejecución de una mini app, con un nombre y un estado. No es una terminal: no admite entrada.

## Decisión

Las consolas son un servicio de la plataforma. Preguntas hechas al usuario y sus respuestas:

1. **¿Dónde se guarda el histórico?** En memoria. Las consolas se conservan mientras la aplicación está en marcha y se pierden al apagarla. La salida de los comandos (rutas, nombres de bucket, errores de SQL) no toca el disco ni el registro del shell, como ya exigía BD-14.
2. **¿Qué pasa con el registro de «Preparar»?** Pasa a la consola. Cada trabajo de «Base de datos» abre una; «Preparar» conserva los pasos, el progreso y el resultado de los scripts, y gana «Ver consola».
3. **¿Qué estados hay?** Cuatro: «En progreso», «Terminado», «Error» y «Cancelado», que son los que produce hoy un trabajo. «Abierto» y «Pausado» se añadirán cuando una mini app los necesite (constitución, principio 8).

Para una mini app, usar una consola son tres llamadas:

```java
Console console = context.consoles().open("Trabajo 3 · Hotfix");
console.line("$ aws s3api head-object …");
console.finish(ConsoleState.SUCCEEDED);
```

Cambios:

- `platform`: `Consoles`, `Console`, `ConsoleState` y `AppContext.consoles()`.
- Paquete `dev.cajonsastre.consoles`: `ConsoleCenter` (abrir, escribir, terminar, listar, limpiar y repartir), todo en memoria.
- API: `GET` y `DELETE /api/consoles`, y `GET /api/consoles/{id}?after=N`. Los cambios en la lista llegan a las ventanas por `/api/events` como evento `consoles`.
- Interfaz: barra inferior con el botón «Consolas» y panel desplegable de altura variable. `useMiniApp().showConsole(id)` lo abre en una consola.
- «Base de datos»: `JobRunner` escribe en una consola; desaparecen `JobLog` y el registro de `GET /job`, que pasa a llevar `consoleId`.

Las líneas no viajan por `/api/events`: la ventana pide cada segundo las nuevas de la consola elegida, y solo con el panel abierto. Un trabajo puede escribir miles de líneas por segundo, y enviarlas todas a todas las ventanas, miren o no, no aporta nada.

## Alternativas

- **Guardar las consolas en disco**, como las notificaciones. Sobrevivirían a un reinicio, pero la salida de los comandos quedaría escrita en la carpeta de datos, en contra de BD-14.
- **Enviar las líneas por el canal de eventos.** Más inmediato, pero carga el canal de presencia con un volumen que casi nunca mira nadie.
- **Mantener además el registro en «Preparar».** Dos sitios para lo mismo y dos copias de las líneas en memoria.
- **Que cada mini app pinte su registro.** Es lo que se quiere evitar: el panel es uno y está en el shell.

## Consecuencias

- El contrato de las mini apps crece con `AppContext.consoles()` y `showConsole`. Tienen un uso real (`database`).
- `/api/events` lleva un segundo evento con nombre, `consoles`.
- El registro de un trabajo de «Base de datos» ya no se pierde al empezar el siguiente: se conservan hasta 20 consolas.
- Una consola cuya mini app se apaga sin terminarla queda «En progreso» hasta que se apaga la aplicación; como todo vive en memoria, no sobrevive al reinicio.
- La ventana pierde 28 px de alto para la barra inferior.
