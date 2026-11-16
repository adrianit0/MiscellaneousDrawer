# ADR-0020: Mini app «Gestask» y Supabase como destino

- Estado: aceptada (2026-11-16)
- Requisitos: GT-01 a GT-79 (nuevos), S-15, constitución (principio 4)
- Modifica: constitución (principio 4), que añade Supabase a la lista de destinos y deja de decir que ninguna conexión envía datos del usuario; S-15; ADR-0008 (la mini app en preparación `tasks` desaparece). No cambia la plataforma ni las otras mini apps

## Contexto

El usuario gestiona su trabajo con Gestask, una aplicación web propia: una SPA sin framework sobre Supabase (Auth, PostgreSQL y Edge Functions). Pidió adaptarla entera a una mini app, con tres condiciones:

- El frontal no tiene por qué ser idéntico: puede aprovechar lo que da Cajón de sastre.
- No se tocan los endpoints de Supabase: el backend debe comportarse igual para la mini app y para la web.
- La conexión se configura guardando usuario y contraseña como en otras mini apps, y si la sesión caduca se vuelve a iniciar sola, sin que se pierda la llamada en curso.

## Decisión

El usuario respondió a cuatro preguntas y aprobó el plan (2026-11-16):

1. **Autoriza Supabase como destino.** El principio 4 de la constitución añade a su lista cerrada el proyecto de Supabase que el usuario escriba en «Conexión», solo para esta mini app. Es el primer destino que **recibe datos del usuario**: sus tareas viven allí, porque es donde ya las tiene la web.
2. **La conexión está en la mini app**, en una sección «Conexión», como la «Configuración» de «Base de datos» y «Calidad del dato». «Ajustes» del shell sigue sin categorías de mini apps.
3. **Sustituye a `tasks`.** La mini app en preparación «Tareas» (ADR-0008) desaparece del catálogo y entra `gestask`.
4. **Tres sprints**: 9 (conexión y «Tareas»), 10 («Día a día») y 11 («Seguimiento» y parámetros). **El «Gestor de tiempos» queda fuera**: en la web solo guarda en el `localStorage` del navegador y no tiene endpoint.

Diseño:

- **El servidor de la mini app es un intermediario.** La interfaz llama a `/api/apps/gestask/fn/<función>` y el servidor reenvía la llamada a Supabase con el `HttpClient` del JDK. Así la CSP no cambia (S-14), el token no llega nunca al navegador y el reinicio de sesión se resuelve en un solo sitio.
- **Reenvío sin interpretar.** La cadena de consulta y el cuerpo pasan tal cual, y la respuesta también. El servidor no conoce los campos de una tarea: si una función cambia en Supabase, la mini app no tiene nada que duplicar ni que desincronizar.
- **Lista cerrada de funciones, con su método.** Solo se reenvían las 17 funciones que usa la web, y el método lo fija el servidor. La interfaz solo distingue lectura (`GET`) y escritura (`POST`): el cliente de la plataforma no envía cuerpo en `DELETE`, y `tasks-delete` lo exige.
- **Sesión en memoria y reinicio transparente.** El `access_token` se obtiene con `auth-login`, como la web, y no se guarda. Ante un 401 el servidor inicia sesión otra vez y repite la llamada una vez. La web, en cambio, manda al usuario a la pantalla de acceso (no refresca el token); aquí no hay pantalla de acceso.
- **Los filtros del Backlog se aplican en la interfaz.** La web ya filtraba dos veces, en Supabase y en el navegador, con el mismo resultado. Aquí solo la ordenación va a Supabase, porque el scoring se calcula allí.
- **Menos llamadas.** La web recarga sus nueve listas tras cada cambio. La mini app recarga las tres de tareas, y no sondea la sesión cada 5 minutos: no hace falta, porque un 401 ya no interrumpe nada.

## Diferencias con la web

- **Sin pantalla de acceso ni registro**: la cuenta se crea en la web y sus credenciales se escriben en «Conexión».
- **Sin menú lateral, tema ni avisos propios**: secciones con subruta, el tema del shell y sus avisos.
- **Kanban con arrastre** entre columnas para cambiar el estado.
- **Sin filas provisionales**: la web pinta la tarea con «Guardando…» antes de que Supabase responda. Aquí el diálogo se cierra, se indica que se está guardando y la lista se actualiza con la respuesta.
- **Confirmaciones con el diálogo de la mini app**, no con `window.confirm`.
- **Atajos**: `Alt+N` crea una tarea y `Alt+R` actualiza.

## Alternativas descartadas

- **Llamar a Supabase desde el navegador**, como la web. Obliga a abrir la CSP a un servidor externo, deja el token en el navegador y reparte el reinicio de sesión por la interfaz.
- **Rutas propias por operación** (`/tasks`, `/tasks/{id}`…) que traduzcan a las funciones. Duplica el contrato de Supabase en Java y obliga a tocar la mini app cada vez que cambie un campo.
- **`supabase-js` o un cliente de Supabase para Java.** Dependencias nuevas para hacer unas peticiones HTTP (principio 8).
- **Refrescar la sesión con `refresh_token`** contra `/auth/v1/token`. Añade una ruta más de Supabase y un segundo secreto que guardar; con las credenciales ya guardadas, volver a `auth-login` da lo mismo.
- **Guardar el token en disco** para no iniciar sesión en cada arranque. Es un inicio de sesión por arranque: no compensa guardar otro secreto.
- **Una copia local de las tareas** en SQLite, para trabajar sin conexión. Dos fuentes de verdad con la web en marcha; el usuario no lo pidió.
- **Una categoría en «Ajustes» del shell.** Se ofreció y el usuario eligió la sección propia.
- **Guardar los registros del «Gestor de tiempos» en SQLite.** Se ofreció y el usuario prefirió dejarlo fuera.

## Consecuencias

- **Cuarto destino autorizado, y el primero que recibe datos.** Lo acotan que solo se contacta con la URL escrita en «Conexión», que debe ser HTTPS (salvo un Supabase local), y solo en `auth-login` y las funciones de la lista (GT-17). Como en ADR-0011 y ADR-0019, ninguna prueba puede impedir que una mini app abra otra conexión: la garantía es su especificación y las pruebas que comprueban las peticiones que emite.
- **Cajón de sastre guarda una contraseña que da acceso a los datos del usuario en Supabase**, en un fichero con permisos 600, como la de MySQL de «Base de datos». En Windows esos permisos no se aplican (ADR-0004).
- **Sin conexión, la mini app no sirve**: no hay copia local.
- **Depende de funciones que no están en el repositorio de Gestask.** `auth-login` solo existe desplegada; su contrato (`{email, password}` → `{session: {access_token}}`) se toma del cliente de la web.
- **Si la contraseña cambia en la web**, la siguiente llamada falla con `login_failed` hasta que se actualice en «Conexión».
- **Las pruebas no contactan con ningún servidor**: el transporte HTTP se sustituye por un Supabase simulado.
- **El catálogo se queda sin mini apps en preparación.** El estado `planned` sigue en la plataforma y en sus pruebas.
