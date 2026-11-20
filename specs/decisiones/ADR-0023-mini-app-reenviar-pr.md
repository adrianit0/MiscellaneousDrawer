# ADR-0023: Mini app «Reenviar PR», Bitbucket Data Center y subir ramas como destinos

- Estado: aceptada (2026-11-20)
- Requisitos: RP-01 a RP-45 (nuevos), S-15, P-02 (icono nuevo `resubmit`), constitución (principio 4)
- Modifica: constitución (principio 4), que añade a la lista de destinos el servidor de Bitbucket Data Center configurado y el envío de ramas al servidor git de su repositorio; S-15; el reparto de sprints de ADR-0020 y ADR-0022 («Rendimiento» y parámetros de «Gestask» pasan al sprint 12). No cambia la plataforma, «Repositorios» (que sigue sin `push`, ADR-0019) ni las otras mini apps

## Contexto

El equipo del usuario pide los PR de corrección contra una rama `hotfix`, con una rama por ticket de Jira (`bug/TICKET-0001`). El día de subida se cierra `hotfix`, se mezcla en `develop`, se borra y se crea otra vez desde `develop`. Los PR que no habían entrado quedan rechazados, y cada uno hay que pedirlo otra vez: rama nueva con el sufijo de la iteración (`bug/TICKET-0001-2`), cherry-pick de todos sus commits, push y PR con el mismo título y la misma descripción. Con ocho PR, más de una hora de trabajo mecánico.

Pidió automatizarlo como mini app de Cajón de sastre.

## Decisión

El usuario respondió a siete preguntas (2026-11-20):

1. **Bitbucket Data Center**, con un token de acceso HTTP.
2. **Autoriza dos destinos nuevos.** El servidor de Bitbucket configurado, para listar sus PR, y el servidor git de ese repositorio, para subir las ramas nuevas: es el primer `push` de Cajón de sastre.
3. **Mini app, no script**, para usar Cajón de sastre.
4. **La descripción termina con «Procede de: <enlace al PR anterior>»**, para que QA encuentre el historial.
5. **Se copian los revisores** del PR rechazado.
6. **Un conflicto se aborta y se avisa**: el PR se marca «Con conflictos» y el trabajo sigue con el siguiente. Ese PR se rehace a mano.
7. **Solo los PR del usuario**: recrear el de un compañero lo dejaría a nombre del usuario.

Diseño:

- **Identidad**: `resubmit`, «Reenviar PR», «Vuelve a pedir los PR de hotfix rechazados al cerrar una versión», icono nuevo `resubmit`, color `green` (el único libre) y categoría `utilities`.
- **La conexión es configuración**: un fichero JSON privado en la carpeta de configuración de la mini app, como la de «Gestask». El token no vuelve a la interfaz.
- **Los commits los da git, no la API.** Los de un PR son los que llegan a su último commit sin estar en la `hotfix` nueva (`rev-list … --not origin/hotfix`). Como la `hotfix` nueva sale de `develop`, que ya tiene la anterior, quedan fuera los commits de otros que entraron en la rama por una mezcla, y también los que ya llegaron por otro camino. No depende de que Bitbucket siga calculando los commits de un PR cuya rama destino se borró.
- **Cuál es pendiente lo dice la lista de PR.** Se agrupan los PR del usuario contra la rama destino por clave de Jira, y de cada clave cuenta el más reciente: si se rechazó en los últimos 30 días, está pendiente. Cuando la mini app lo reenvía, el nuevo pasa a ser el más reciente y el rechazado deja de aparecer, sin guardar nada en la mini app.
- **La iteración no se confunde con la clave.** `TICKET-0001` termina en `-0001`; la regla lee la clave como letras, guion y números, y solo lo que viene después es la iteración.
- **La copia del usuario no se toca.** El trabajo usa un `git worktree` desacoplado en la carpeta de datos de la mini app y sube con `HEAD:refs/heads/<rama nueva>`: no cambia la rama del usuario ni crea ramas locales.
- **El envío está acotado**: solo la rama nueva, sin `--force` y nunca a una rama que ya exista en el remoto (se comprueba después de consultarlo). Los demás comandos solo leen.
- **Las credenciales de git son las del usuario**, como en ADR-0019. El token de Bitbucket solo se usa para su API.
- **Se comprueba que la carpeta es el repositorio configurado** antes de subir nada: si el `origin` de la copia no termina en `<proyecto>/<repositorio>`, el trabajo falla sin hacer nada.
- **Si Bitbucket rechaza a un revisor** (un usuario dado de baja), el PR se crea sin revisores y el detalle lo dice: es mejor tener el PR que no tenerlo.
- **Se reordenan los sprints**: este es el 11 y el de «Rendimiento» de «Gestask» pasa al 12.

## Alternativas descartadas

- **Un script con `curl` y `git`.** Más rápido de escribir, pero el usuario prefirió la mini app.
- **No borrar `hotfix`, sino moverla al commit de `develop`.** Los PR seguirían abiertos y no habría nada que reenviar, pero es un cambio del proceso del equipo, que no depende del usuario. Se le propuso aparte.
- **Los commits de la API de Bitbucket** (`/pull-requests/{id}/commits`). Con la rama destino borrada puede no calcularlos, e incluye commits que ya están en la `hotfix` nueva.
- **Dejar el conflicto a medias para resolverlo en la mini app.** Más trabajo para un caso que el usuario prefiere resolver a mano.
- **Subir la rama con el token por HTTPS.** Evitaría depender de las credenciales de git, pero obligaría a construir la URL con el token, que acabaría en la línea de comandos.
- **Reutilizar la lista de «Repositorios».** Una mini app no lee los datos de otra (constitución, principio 3).
- **Guardar qué PR ya se reenviaron.** La lista de Bitbucket ya lo dice (RP-12).

## Consecuencias

- **Quinto destino autorizado y primer envío de código.** La mini app sube ramas al servidor git y crea PR en Bitbucket con el título, la descripción y los revisores de los del usuario. Lo acotan RP-27, que dice qué se sube y cómo, y que solo ocurre dentro de un trabajo que el usuario inicia tras confirmar. Como en ADR-0011 y ADR-0019, ninguna prueba puede impedir que una mini app ejecute un comando: la garantía es la especificación y las pruebas que comprueban los comandos que emite.
- **El token da acceso a Bitbucket** con los permisos con que se creó. Se guarda en un fichero privado (S-20) y no aparece en el registro ni en la consola.
- **Un PR con conflictos sigue siendo manual**, igual que antes.
- **Si la rama del PR rechazado se borró del remoto** y su último commit no está en la copia local, sus commits no se pueden recuperar: el PR falla y lo dice.
- **Depende del certificado del servidor.** Si Bitbucket usa un certificado de una autoridad propia de la empresa, Java debe confiar en ella.
- **Código repetido**: `Command`, `CommandRunner` y `ProcessRunner` por cuarta vez (P-18), y un `Transport` HTTP por segunda. Pasarlos a la plataforma sigue siendo una mejora propia, con su ADR, si el usuario la pide.
- **Las pruebas no contactan con ningún servidor.** La API se prueba con un Bitbucket simulado; el git real, con repositorios en una carpeta temporal y un remoto que es otra carpeta.
