# Mini app «Inventario»

Los objetos conseguidos en los cofres de «Lootboxes» ([lootboxes.md](lootboxes.md)), con cuántos hay de cada uno. Es una mini app de ocio (ADR-0026): una pantalla que se mira de un vistazo. Prefijo de requisitos: **IN**.

## Identidad

`inventory`, «Inventario», «Los objetos conseguidos en los cofres», icono `inventory`, color `violet`, categoría `leisure`. Base de datos propia (P-08).

## Recepción

| ID | Requisito |
|---|---|
| IN-01 | Al arrancar y antes de responder a `GET /items`, lee sus mensajes pendientes (P-30). Cada mensaje `chest-rewards` de `lootboxes` (LB-14) trae un cofre y sus objetos: `{"chest": "<id>", "items": [{"id", "name", "rarity"}]}`. Cada objeto suma 1 a su cantidad. |
| IN-02 | Cada cofre se suma una sola vez: se guarda su identificador, y un mensaje de un cofre ya recibido se confirma sin sumar nada (P-30). |
| IN-03 | El nombre y la rareza de un objeto son los del último mensaje que lo trajo. Una rareza fuera de la lista de LB-26 se guarda como `common`, para no perder el objeto. |
| IN-04 | Un mensaje de otro tipo, de otra mini app, sin cofre, o con un objeto sin `id` o sin nombre, se descarta sin sumar nada y va al registro sin su contenido (S-21). |
| IN-05 | Cada mensaje se procesa y se guarda en una transacción, y después se confirma (`ack`). |

## Interfaz

| ID | Requisito |
|---|---|
| IN-10 | Una sola pantalla, sin secciones: el total de objetos y una cuadrícula con una tarjeta por objeto, de la mejor rareza a la peor y, dentro, por nombre. Cada tarjeta muestra el orbe con el color de su rareza (LB-26), el nombre, la rareza con texto y la cantidad («×12»). |
| IN-11 | Sin objetos: «Todavía no tienes objetos. Se consiguen abriendo cofres en Lootboxes.», con el enlace «Ir a Lootboxes» (`#/apps/lootboxes`). |
| IN-12 | Al pasar el ratón o con el foco en una tarjeta, se ve la fecha en que se consiguió el primero y el último (U-02). |
| IN-20 | Si la carga falla, la pantalla dice el error con «Reintentar». |
| IN-21 | Al volver a mostrarse la mini app (N-05), vuelve a pedir los objetos: así aparecen los de un cofre abierto en «Lootboxes» con el inventario abierto en otra pestaña. No hay sondeos. |

## API de la mini app

Prefijo `/api/apps/inventory`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | /items | Lee los mensajes (IN-01) y devuelve los objetos: `{"items": [{"id", "name", "rarity", "count", "firstAt", "lastAt"}]}` |

## Datos

```sql
-- V001 (db/apps/inventory/V001__initial.sql)
CREATE TABLE item (
  id       TEXT PRIMARY KEY,       -- el de la tabla de botín (LB-12)
  name     TEXT NOT NULL,
  rarity   TEXT NOT NULL,          -- common, uncommon, rare, epic o legendary
  count    INTEGER NOT NULL,
  first_at TEXT NOT NULL,          -- ISO-8601 UTC
  last_at  TEXT NOT NULL
);

CREATE TABLE received_chest (
  chest_id    TEXT PRIMARY KEY,    -- UUID del cofre (LB-14)
  received_at TEXT NOT NULL
);
```

## Fuera de alcance

- Usar, vender, combinar o borrar objetos.
- Historial de aperturas.
- Objetos que no vengan de «Lootboxes».
