# Requisitos de seguridad

CajonSastre es un único proceso que sirve su interfaz en la propia máquina. Estas protecciones valen para el shell y para todas las mini apps; ninguna mini app las relaja.

## Servidor local

| ID | Requisito |
|---|---|
| S-10 | El servidor escucha solo en 127.0.0.1. |
| S-11 | Se valida la cabecera Host (`127.0.0.1:puerto` o `localhost:puerto`); cualquier otra se rechaza con 403. |
| S-12 | Al arrancar se genera un token aleatorio. Se entrega en el HTML inicial y es obligatorio en la cabecera `X-CajonSastre-Token` de toda llamada a `/api`, salvo `GET /api/health`. |
| S-13 | Se valida Origin en las peticiones que modifican estado (POST, PUT, PATCH, DELETE): solo `http://127.0.0.1:puerto` o `http://localhost:puerto`. Sin Origin (clientes que no son navegador) se acepta y el token sigue siendo obligatorio. No se emiten cabeceras CORS. |
| S-14 | Cabecera CSP: `default-src 'self'; img-src 'self' data:`. Ningún recurso se carga de internet: todo va empaquetado. |
| S-15 | Sin telemetría ni llamadas a servicios externos (constitución, principio 4). |
| S-16 | Una mini app solo puede registrar rutas dentro de su espacio `/api/apps/<id>/` (P-06). |

## Credenciales y registro

| ID | Requisito |
|---|---|
| S-20 | Los ficheros con secretos (`instance.json` y los que guarde una mini app en su carpeta de configuración) se escriben con permisos 600 en sistemas POSIX (P-09). |
| S-21 | El registro no contiene datos del usuario de ninguna mini app; solo identificadores, estados y errores. |

## Reglas del repositorio público

| ID | Requisito |
|---|---|
| S-30 | Ningún dato real: ni nombres de bases de datos, tablas, tareas o personas reales. |
| S-31 | Ejemplos y pruebas usan datos inventados y genéricos. |
| S-32 | Sin nombres de máquina, usuarios, contraseñas ni rutas personales. Los ejemplos usan marcadores. |
| S-33 | El README describe qué hace la aplicación de forma genérica. No menciona su origen, su motivo ni otros proyectos. |
| S-34 | `.gitignore` excluye datos, configuración, registros, `*.db`, exportaciones `*.zip`, claves `*.pem` y `.env`. |
| S-35 | Mensajes de commit neutros y en español. |
