# Requisitos de la API HTTP local

La interfaz habla con el servidor solo a través de esta API JSON, bajo `/api`.

| ID | Regla |
|---|---|
| A-01 | JSON en UTF-8. Los nombres de campo van en inglés y en camelCase. |
| A-02 | Los errores usan el código HTTP adecuado y el cuerpo `{"code", "message", "details"}`. `message` va en español y es apto para mostrarse. |
| A-03 | Toda ruta exige el token de sesión (S-12), salvo `GET /api/health`. |
| A-04 | `/api/apps/<id>/…` pertenece por entero a la mini app `<id>` (P-06). El shell no define rutas ahí; las suyas por mini app van en `/api/catalog` y `/api/app-state/<id>`. |

| Método | Ruta | Descripción |
|---|---|---|
| GET | /api/health | Firma, versión y build de la aplicación (C-01) |
| GET | /api/catalog | Mini apps con su manifiesto, estado y, si falló, el mensaje (P-04) |
| GET, PUT | /api/app-state/{id} | Documento de estado de interfaz de una mini app: un objeto JSON de hasta 64 KB (P-14). 404 `app_not_found` si no está en el catálogo; 400 `invalid_state` si no es un objeto o es mayor |
| GET, PUT | /api/settings | Estado de interfaz del shell (tabla `setting`) y, en la clave `config`, los ajustes de `config.json` (D-04, D-05). Las claves cumplen `[A-Za-z0-9._-]{1,100}` |
| GET | /api/events | Canal de presencia (C-04). Lleva además un evento `notification` por cada notificación nueva (P-23) |
| GET, DELETE | /api/notifications | Notificaciones guardadas, de la más reciente a la más antigua; `DELETE` las borra todas y devuelve la lista vacía (P-22) |
| POST | /api/presence/bye | Aviso de cierre de ventana (C-05) |
| POST | /api/shutdown | Apagado ordenado (C-06, C-10) |
| GET | /api/update | Versión, build y commit instalados, y si la actualización está disponible y por qué (R-10, R-14) |
| POST | /api/update/check | Buscar una versión nueva (R-13). 409 `update_unavailable` o `update_not_configured` sin conectar (R-11, R-14) |
| POST | /api/update/apply | Descargar y verificar el build indicado (`{"build": N}`) y reiniciar (R-32, R-42, R-43). Solo acepta el build de la última búsqueda verificada (409 `update_stale`) y responde antes de apagar, cuando la descarga ya está comprobada. 409 `app_busy` sin descargar nada si una mini app está ocupada (P-20) |
| * | /api/apps/{id}/… | Rutas de la mini app (P-06). 503 `app_unavailable` si la mini app está en `failed` (P-07) |

Respuesta de `GET /api/notifications`. `text` y `path` pueden ser `null`:

```json
{
  "notifications": [
    {
      "id": 12,
      "appId": "database",
      "kind": "success",
      "title": "El trabajo ha terminado correctamente",
      "text": null,
      "path": "/",
      "createdAt": "2026-11-12T09:30:00Z"
    }
  ]
}
```

Respuesta de `GET /api/catalog`:

```json
{
  "apps": [
    {
      "id": "tasks",
      "name": "Tareas",
      "description": "Gestor de tareas",
      "icon": "tasks",
      "color": "green",
      "category": "productivity",
      "keywords": ["pendientes", "listas"],
      "status": "planned",
      "error": null
    }
  ]
}
```
