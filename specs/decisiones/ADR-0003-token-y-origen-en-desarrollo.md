# ADR-0003: Token de sesión y Origin en desarrollo

- Estado: aceptada
- Fecha: 2026-11-09
- Requisitos: S-11, S-12, S-13

## Contexto

Igual que en LiteDD: S-12 entrega el token en el HTML inicial que sirve el backend, pero en desarrollo la página la sirve Vite (puerto 5174), que no lo conoce, y su proxy reenvía `Host` y `Origin` de Vite, que S-11 y S-13 rechazan.

## Decisión

1. `scripts/dev.sh` genera un token aleatorio en cada arranque y lo exporta en `CAJONSASTRE_DEV_TOKEN`. Si esa variable existe y tiene al menos 32 caracteres, el backend la usa como token; si no, genera uno con `SecureRandom`. Un plugin de Vite, solo en `serve`, sustituye con ella el marcador `__CAJONSASTRE_TOKEN__` del HTML.
2. El proxy de Vite usa `changeOrigin` y reescribe `Origin` al del backend. El backend no relaja ninguna comprobación.
3. Si falta `Origin` (clientes que no son navegador, como `cajonsastre --stop`), se acepta y el token sigue siendo obligatorio.

## Consecuencias

El token de desarrollo vive en el entorno del proceso. En uso normal la variable no existe y el token es aleatorio en cada arranque.
