# Sprint 9: Mini app «Gestask» (conexión y «Tareas»)

## Objetivo

Usar Gestask desde Cajón de sastre sobre el mismo Supabase que la web, sin tocar su backend: conexión con credenciales guardadas, reinicio de sesión transparente y las cuatro pantallas de «Tareas» (Backlog, Kanban, Ordenar y Completar). Es el primero de tres sprints (ADR-0020).

## Requisitos cubiertos

- Gestask: GT-01 a GT-79.
- Seguridad: S-15 (cuarto destino autorizado).
- Constitución: principio 4.

Documentos: [requisitos/gestask.md](../requisitos/gestask.md), [ADR-0020](../decisiones/ADR-0020-mini-app-gestask.md), [diseno/mini-apps.md](../diseno/mini-apps.md).

## Tareas

1. **Especificación.** Requisitos GT, ADR-0020, este sprint, el principio 4 de la constitución, S-15, la arquitectura y la nota de ADR-0008.
2. **Catálogo.** Manifiesto de `gestask` en `AppCatalog` en lugar de `tasks`. `AppCatalogTest` se adapta.
3. **Servidor**, paquete `dev.cajonsastre.apps.gestask`, sin base de datos.
   - `GestaskConfig` y `ConfigStore`: valores, formato y guardado con `PrivateFile` (GT-01 a GT-05).
   - `Transport` y `HttpTransport`: la única salida, detrás de una interfaz para las pruebas (GT-16).
   - `Functions`: la lista cerrada con su método (GT-11).
   - `Session`: inicio de sesión, reenvío y reinicio ante un 401 (GT-12 a GT-15).
   - `GestaskApp`: el `MiniApp` y sus rutas.
4. **Interfaz**, carpeta `frontend/src/apps/gestask/`: «Conexión», Backlog con formulario y detalle, Kanban, Ordenar y Completar (GT-20 a GT-79).
5. **Documentación.** `README.md` y `CLAUDE.md`.
6. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada.

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- «Gestask» aparece en el lanzador, en «Productividad», y «Tareas» ya no.
- Sin conexión guardada, las secciones de tareas llevan a «Conexión» y no se contacta con ningún servidor.
- La contraseña no vuelve a la interfaz ni aparece en ningún registro.
- Con Supabase simulado: cada llamada lleva el método, la consulta, el cuerpo y las cabeceras que llevaría la de la web; una función fuera de la lista no sale de la máquina.
- Con Supabase simulado: una sesión caducada se reinicia y la llamada en curso devuelve su resultado; varias llamadas a la vez inician sesión una sola vez.
- Ninguna prueba contacta con un servidor.
- Con el Supabase real del usuario: se ve el mismo backlog que en la web, y crear, editar, ordenar y completar una tarea en un lado se ve en el otro.

## Resultado

Fecha: 2026-11-16. Hecho en el código y probado con Supabase simulado, en las pruebas y con la aplicación arrancada. Sin commits todavía. Falta la verificación con el Supabase real del usuario.

### Hecho

- **Especificación:** `requisitos/gestask.md` (GT-01 a GT-79), ADR-0020 aceptada, este sprint, el principio 4 de la constitución, S-15, la arquitectura, la nota de ADR-0008 y `CLAUDE.md`.
- **Catálogo:** `gestask` disponible, con el icono `tasks`, color `gold` y categoría `productivity`. La mini app en preparación `tasks` ya no está.
- **Servidor (`dev.cajonsastre.apps.gestask`):** `GestaskConfig` y `ConfigStore`; `Transport` y `HttpTransport` (el `HttpClient` del JDK, sin dependencias nuevas); `Functions`, la lista cerrada de 17 funciones con su método; `Session`, que inicia sesión, reenvía y reinicia la sesión ante un 401; y `GestaskApp` con sus rutas.
- **Interfaz (`frontend/src/apps/gestask/`):** «Conexión» con «Probar conexión»; Backlog con filtros inmediatos, ordenación, formulario (crear, editar, clonar, eliminar) y detalle con estado y comentarios; Kanban con arrastre; Ordenar con flechas y arrastre; Completar con los tres pasos, «Copiar para Jira» y las acciones masivas. Las reglas portadas de la web están en `logic.ts`.
- **Documentación:** `README.md`.
- **Pruebas:** `./mvnw verify` en verde, con 455 de backend (19 omitidas en Windows, las mismas de antes) y 333 de interfaz.
  - Nuevas de backend: 18 en `GestaskAppTest`, con `FakeSupabase`; `AppCatalogTest` comprueba el manifiesto.
  - Nuevas de interfaz: 40 en `test/gestaskApp.test.tsx`.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados y un Supabase simulado en `http://127.0.0.1` (un servidor de prueba fuera del repositorio): sin conexión, las secciones llevan a «Conexión»; una contraseña equivocada se dice como «No se pudo iniciar sesión en Supabase: Invalid login credentials»; con la correcta, «Probar conexión» responde y el Backlog muestra las tareas con sus colores y enlaces; «Crear tarea» propone ticket y orden, la crea y avanza el contador; con la sesión caducada en el servidor, cambiar el estado desde el detalle funciona sin aviso y el servidor recibe la llamada rechazada, un `auth-login` y la misma llamada otra vez; el Kanban agrupa por estado; «Mover abajo» en Ordenar envía una sola llamada; y Completar muestra pasos, horas y acciones. Los registros no contienen la contraseña ni ningún token.

### Pendiente

- **Verificación con el Supabase real**: escribir en «Conexión» la URL, la clave publicable, el email y la contraseña, y comprobar que se ve el mismo backlog que en la web y que un cambio en un lado se ve en el otro. En particular, que `auth-login` responde `{session: {access_token}}`: esa función no está en el repositorio de Gestask y su contrato se tomó del cliente de la web.
- No se recorrieron con la aplicación arrancada el arrastre en Kanban y Ordenar, los diálogos de Completar, «Copiar para Jira», la imputación masiva ni «Eliminar tarea»: están cubiertos por las pruebas.
- Sprints 10 («Día a día») y 11 («Seguimiento» y parámetros).

### Desviaciones y decisiones

- **ADR-0020 (aceptada):** Supabase como destino, conexión en la mini app, sustituye a `tasks`, tres sprints y sin «Gestor de tiempos».
- **Color `gold`** en lugar del naranja de Gestask, que ya usa «Cerrar procesos», e **icono `tasks`**, el de la mini app a la que sustituye: no hace falta uno nuevo.
- **Un inicio de sesión fallido no se repite por cada llamada en paralelo.** En el recorrido, una contraseña equivocada provocaba cuatro `auth-login` seguidos al abrir, uno por lista. Ahora las llamadas que esperaban reciben el mismo error (GT-14 se amplió para decirlo).
- **Tras guardar el orden se recargan las listas** en lugar de usar la respuesta de `tasks-order-update`, como el resto de acciones (GT-63 se ajustó).
- **Las «horas revisadas» de la imputación quedan para el sprint 11**: dependen de las métricas de rendimiento y del horario diario.
- **«Hoy» es la fecha local**, no la UTC que usa la web con `toISOString()`, que cerca de medianoche da el día equivocado.
- **El estado PR del formulario** se puede cambiar solo si la tarea guardada ya está en `Done`, como en la web.
