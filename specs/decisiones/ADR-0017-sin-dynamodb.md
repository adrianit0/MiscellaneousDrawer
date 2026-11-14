# ADR-0017: «Base de datos» no descarga ni importa nada de DynamoDB

- Estado: aceptada (2026-11-13)
- Requisitos: BD-28 (cambia), BD-29 (aclara)
- Modifica: ADR-0011

## Contexto

Siguiendo los scripts de consola, BD-28 hacía que el paso «Descargar» trajera además `<s3Path>/dynamodb/Dockerfile` y `<s3Path>/dynamodb/dynamo-db-dump.tar.bz2` a `<carpeta de trabajo>/dynamodb/`. Ningún otro paso los usaba.

## Decisión

El usuario lo indicó (2026-11-13): la mini app no descarga ni importa nada de DynamoDB.

- El paso «Descargar» solo pide a S3 los volcados de las ramas (BD-21). El de «Importar» ya solo trataba el volcado de MySQL.
- Una carpeta `dynamodb/` que ya exista en la carpeta de trabajo no se borra ni se modifica: son datos del usuario (constitución, punto 7) y puede borrarla a mano.
- Se conserva el identificador BD-28 con el requisito nuevo, para que la prueba que lo cita compruebe que no se pide nada de `dynamodb/`.

## Consecuencias

- La descarga hace dos llamadas menos a S3 y un fallo en esos ficheros ya no hace fallar el paso.
- Los nombres de los ficheros de DynamoDB salen del código público.
