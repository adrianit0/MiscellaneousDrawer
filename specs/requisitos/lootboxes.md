# Mini app «Lootboxes»

Cofres que se consiguen con los PE cerrados en «Gestask» y se abren, con una animación breve, a partir de las 8:00 del día siguiente. Cada cofre da entre 1 y 3 objetos al azar, que pasan a «Inventario» ([inventory.md](inventory.md)). Es una mini app de ocio: una distracción breve para la Daily que no debe notarse durante el trabajo (ADR-0026).

Todo lo que se haga en ella cabe en 20 minutos al día como mucho. No hay temporizador: es un límite de diseño, y cada función nueva se mide contra el presupuesto de ADR-0026. Prefijo de requisitos: **LB**.

## Identidad

`lootboxes`, «Lootboxes», «Cofres que se consiguen con los PE de Gestask», icono `chest`, color `orange`, categoría `leisure`. Base de datos propia (P-08).

## Cofres conseguidos

| ID | Requisito |
|---|---|
| LB-01 | En su primer arranque guarda la fecha local de ese día como fecha de inicio. Los días anteriores nunca dan cofres. |
| LB-02 | Al arrancar y antes de responder a `GET /chests`, lee sus mensajes pendientes (P-30). Cada mensaje `effort-points` de `gestask` (GT-120) dice los PE cerrados de un día: `{"date": "AAAA-MM-DD", "points": N}`. Los cofres de ese día son `min(8, ⌊N⌋)`. Si son más que los que ya tenía ese día, se crean los que faltan; si son menos, no se quita ninguno. |
| LB-03 | Un mensaje con un día anterior a la fecha de inicio o posterior a hoy, con `points` que no es un número mayor o igual que 0, con otro tipo o de otra mini app, se descarta sin crear cofres y va al registro sin su contenido (S-21). |
| LB-04 | Cada mensaje se procesa y se guarda en una transacción, y después se confirma (`ack`). Procesar dos veces el mismo mensaje no crea más cofres (P-30). |
| LB-05 | Un cofre conseguido el día D se desbloquea a las 8:00, hora local, del día D+1. Hasta entonces no aparece en la interfaz ni cuenta en ningún número. Los desbloqueados no caducan: se acumulan hasta que se abren. |
| LB-06 | Conseguir un cofre no se anuncia en ningún sitio: ni notificaciones (P-21), ni consolas (P-25), ni avisos, ni marcas en el lanzador o en «Gestask». |

## Apertura

| ID | Requisito |
|---|---|
| LB-10 | `POST /chests/{id}/open` abre un cofre desbloqueado y sin abrir: sortea cuántas recompensas da (LB-13) y cada una con la tabla de botín (LB-12), guarda la apertura y las recompensas en una transacción y responde con ellas. El azar es del servidor (`SecureRandom`). Un cofre que no existe responde 404 `chest_not_found`; uno bloqueado, 409 `chest_locked`, y uno ya abierto, 409 `chest_opened`. |
| LB-11 | `POST /chests/open-all` abre todos los desbloqueados, del más antiguo al más nuevo, cada uno como en LB-10 y todos en una transacción, y responde con las recompensas de cada uno. Sin cofres desbloqueados responde con la lista vacía. |
| LB-12 | **Tabla de botín, versión 1.** Cada recompensa se sortea por separado con estos pesos, sobre 10 000. Un objeto nuevo en una versión futura cambia esta tabla y se registra en un ADR. |
| LB-13 | Un cofre da 1, 2 o 3 recompensas, cada número con probabilidad 1/3. |
| LB-14 | Tras guardar una apertura, envía a `inventory` un mensaje `chest-rewards` con el identificador del cofre y sus objetos: `{"chest": "<id>", "items": [{"id", "name", "rarity"}]}` (IN-01). El identificador del cofre es un UUID, para que no se repita aunque la base se cree de nuevo. |
| LB-15 | Un cofre cuyo mensaje no se pudo enviar queda pendiente de entrega y se reenvía al arrancar y antes de responder a `GET /chests`, en el orden en que se abrieron. La apertura no falla por eso. |

| Objeto | `id` | Rareza | Peso | Probabilidad |
|---|---|---|---|---|
| Orbe blanco | `orb-white` | `common` | 8000 | 80 % |
| Orbe verde | `orb-green` | `uncommon` | 1600 | 16 % |
| Orbe azul | `orb-blue` | `rare` | 320 | 3,2 % |
| Orbe morado | `orb-purple` | `epic` | 65 | 0,65 % |
| Orbe dorado | `orb-gold` | `legendary` | 15 | 0,15 % |

## Interfaz

| ID | Requisito |
|---|---|
| LB-20 | Una sola pantalla, sin secciones: el número de cofres para abrir («3 cofres para abrir»), un cofre dibujado, «Abrir» y «Abrir todos (N)». Los dos botones están desactivados sin cofres y mientras se abre uno. Sin cofres: «No hay cofres para abrir. Se consiguen con los PE cerrados en Gestask y se abren desde las 8:00 del día siguiente.» |
| LB-21 | «Abrir» abre el cofre desbloqueado más antiguo (LB-10). Si la llamada falla, se dice el error con un aviso (U-05), el cofre sigue en la lista y no se muestra ninguna animación. |
| LB-22 | **Animación de un cofre.** El cofre tiembla, se abre con un destello del color de la mejor rareza obtenida y las recompensas aparecen una tras otra, cada una con su orbe, su nombre y su rareza. Dura 3 s como mucho. Pulsar, Enter, Espacio o Esc la salta al resultado final. |
| LB-23 | **«Abrir todos».** Pide confirmación diciendo cuántos cofres son, los abre (LB-11) y muestra un resumen con cuántos de cada objeto salieron, de la mejor rareza a la peor, con una animación de 2 s como mucho que también se puede saltar. |
| LB-24 | Con `prefers-reduced-motion`, o con la mini app oculta (N-05), no hay animación: se muestra directamente el resultado. |
| LB-25 | El resultado se queda a la vista hasta abrir otro cofre o cerrar la mini app. Tiene el enlace «Ver inventario» (`#/apps/inventory`). |
| LB-26 | Los colores de las rarezas son los del tema: `common` el texto, `uncommon` `green`, `rare` `blue`, `epic` `violet` y `legendary` `gold` (U-01). La rareza también se dice con texto («Común», «Poco común», «Raro», «Épico», «Legendario»), no solo con el color. |
| LB-27 | Si la carga falla, la pantalla dice el error con «Reintentar». Al volver a mostrarse la mini app (N-05), vuelve a pedir los cofres. No hay sondeos. |

## API de la mini app

Prefijo `/api/apps/lootboxes`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | /chests | Lee los mensajes (LB-02, LB-15) y devuelve los cofres desbloqueados sin abrir, del más antiguo al más nuevo: `{"chests": [{"id", "earnedOn"}]}` |
| POST | /chests/{id}/open | Abre un cofre (LB-10): `{"chest": "<id>", "items": [{"id", "name", "rarity"}]}` |
| POST | /chests/open-all | Abre todos (LB-11): `{"opened": [{"chest", "items"}]}` |

## Datos

```sql
-- V001 (db/apps/lootboxes/V001__initial.sql)
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,          -- started_on
  value TEXT NOT NULL
);

CREATE TABLE day_points (
  day    TEXT PRIMARY KEY,         -- AAAA-MM-DD
  points REAL NOT NULL,            -- los mayores PE recibidos para ese día
  chests INTEGER NOT NULL          -- cofres creados para ese día, de 0 a 8
);

CREATE TABLE chest (
  id         TEXT PRIMARY KEY,     -- UUID (LB-14)
  earned_on  TEXT NOT NULL,        -- AAAA-MM-DD
  seq        INTEGER NOT NULL,     -- 1 a 8 dentro del día
  opened_at  TEXT,                 -- ISO-8601 UTC; null si no se ha abierto
  delivered  INTEGER NOT NULL DEFAULT 0,  -- 1 cuando el mensaje a «Inventario» quedó guardado
  UNIQUE (earned_on, seq)
);

CREATE TABLE reward (
  chest_id TEXT NOT NULL REFERENCES chest (id),
  position INTEGER NOT NULL,       -- 1 a 3
  item_id  TEXT NOT NULL,          -- de la tabla de botín (LB-12)
  PRIMARY KEY (chest_id, position)
);
```

## Fuera de alcance

- Juegos, objetos o cofres distintos de los de la tabla de botín de LB-12.
- Usar, vender o combinar objetos.
- Ver los cofres bloqueados o cuántos llegarán.
- Cofres de días anteriores a la fecha de inicio.
- Un temporizador o una ventana horaria de uso.
- Sonido.
