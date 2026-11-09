# ADR-0002: Convivencia con LiteDD y nombre de la aplicación

- Estado: propuesta (pendiente de confirmar por el usuario)
- Fecha: 2026-11-09
- Requisitos: constitución (principio 5), C-01, C-03, C-08, S-12, U-08

## Contexto

CajonSastre extiende el sistema de desarrollo de LiteDD, pero no debe entrar en conflicto con ella: las dos pueden estar instaladas y en marcha a la vez en la misma máquina.

## Decisión

Todo lo que LiteDD usa con su nombre, CajonSastre lo usa con el suyo:

| Recurso | LiteDD | CajonSastre |
|---|---|---|
| Puerto por defecto | 47600 | 47800 |
| Puerto de Vite en desarrollo | 5173 | 5174 |
| Firma de `/api/health` | `"app":"LiteDD"` | `"app":"CajonSastre"` |
| Cabecera del token | `X-LiteDD-Token` | `X-CajonSastre-Token` |
| Meta y marcador del token | `litedd-token`, `__LITEDD_TOKEN__` | `cajonsastre-token`, `__CAJONSASTRE_TOKEN__` |
| Token de desarrollo | `LITEDD_DEV_TOKEN` | `CAJONSASTRE_DEV_TOKEN` |
| Carpetas XDG | `litedd` | `cajonsastre` |
| Clase de ventana y perfil de Chrome | `litedd`, `<estado>/chrome` | `cajonsastre`, `<estado>/chrome` (en su propia carpeta de estado) |
| Paquete Java | `dev.litedd` | `dev.cajonsastre` |

- C-01 compara la firma completa: si en el puerto responde LiteDD, CajonSastre no la toma por una instancia propia.
- Nombre técnico: `CajonSastre` (firma, artefacto, comando `cajonsastre`). Nombre visible: «Cajón de sastre», con tilde (U-02), en la barra superior, el título de la ventana y el texto alternativo del logotipo.
- El tema, la tipografía y los componentes comunes copian los de LiteDD para que las dos se sientan de la misma familia.

## Consecuencias

- No hay código compartido en tiempo de ejecución: si en el futuro una pieza se repite mucho entre los dos proyectos, se valorará extraerla, con su ADR.
- Si el usuario prefiere otro puerto o nombre visible, basta con cambiar este ADR, `AppConfig.DEFAULT`, `AppInfo` y los textos de interfaz.
