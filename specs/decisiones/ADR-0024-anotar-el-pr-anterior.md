# ADR-0024: «Reenviar PR» anota en el PR rechazado el enlace al nuevo

- Estado: aceptada (2026-11-20)
- Requisitos: RP-36 (nuevo); RP-32, RP-34 y RP-44 (ampliados); S-15; constitución (principio 4)
- Modifica: ADR-0023, que no tocaba el PR rechazado. No cambia los destinos autorizados, que siguen siendo el Bitbucket y el servidor git configurados, ni las otras mini apps

## Contexto

Con «Reenviar PR» en uso, no todos los PR rechazados se pudieron reenviar: los que tenían conflictos se rehacen a mano. El usuario borra después las ramas de los PR rechazados que ya tienen PR nuevo, y para saber cuáles son pidió que la mini app lo deje escrito en el PR rechazado, solo cuando haya creado el nuevo:

```
Nuevo PR: <url>
**Pendiente de eliminar esta rama**
```

Borrar la rama lo hace él, por lo que implica.

## Decisión

1. **Se edita la descripción del PR rechazado**, no se comenta. El usuario comprobó que su Bitbucket Data Center deja editar un PR rechazado.
2. **Solo si el PR nuevo se creó.** Un PR con conflictos, con error o cancelado antes de crear el nuevo no se toca.
3. **El texto va al final**, tras una línea en blanco, exactamente como lo pidió. Si la descripción ya tiene la línea «Nuevo PR: <enlace>», no se repite.
4. **Se vuelve a pedir el PR antes de editarlo** (`GET …/pull-requests/<número>`): Bitbucket exige la versión actual, y la descripción puede haber cambiado desde la lista.
5. **Se envían su título y sus revisores**: en Bitbucket Data Center, una actualización sin revisores los quita.
6. **Un fallo al anotar no deshace nada.** El PR nuevo ya existe: queda `created`, el detalle dice «No se pudo anotar el PR anterior: <motivo>» y el resumen lo cuenta, para anotarlo a mano.
7. **La mini app nunca borra la rama del PR anterior.**

## Alternativas descartadas

- **Un comentario en el PR rechazado.** Se ofreció para el caso de que Bitbucket no dejara editarlo; el usuario comprobó que sí deja.
- **Reabrir, editar y volver a rechazar.** Avisaría a los revisores dos veces.
- **Borrar la rama del PR anterior.** El usuario prefiere hacerlo él.
- **Anotar también los PR reenviados antes de este cambio.** Ya no aparecen en la lista; se anotan a mano.

## Consecuencias

- **Se envía algo más al mismo destino**: la descripción del PR rechazado, con el enlace al nuevo. Son dos llamadas más por PR recreado.
- **La edición queda en la actividad del PR** a nombre del dueño del token, como si la hiciera a mano.
- **Si Bitbucket cambiara y no dejara editar PR rechazados**, la mini app seguiría funcionando: los PR nuevos se crean y cada uno avisa de que el anterior no se anotó.
