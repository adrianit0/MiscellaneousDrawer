# ADR-0004: Desarrollo en Windows, ejecución en Ubuntu

- Estado: aceptada
- Fecha: 2026-11-09
- Requisitos: C-03, C-09, S-20, «Rutas en disco»

## Contexto

Como LiteDD, CajonSastre se desarrolla en Windows 10 y se ejecuta en Ubuntu 22.04.

## Decisión

- La plataforma de ejecución es Ubuntu 22.04.
- `./mvnw verify` y las pruebas automáticas deben pasar también en Windows (`mvnw.cmd` o Git Bash).
- Los scripts de `scripts/` son bash y se ejecutan en Git Bash durante el desarrollo.
- `.gitattributes` fuerza finales de línea LF, salvo en `.cmd`.
- El código que dependa del sistema (permisos POSIX 600, lanzar Chrome, `xdg-open`, rutas XDG) apunta a Linux. En Windows degrada sin romper las pruebas: las de permisos POSIX se omiten fuera de POSIX y la ventana se abre en el navegador por defecto.

## Consecuencias

Los criterios ligados al sistema (ventana con su clase, icono, instalación) se verifican en Ubuntu.
