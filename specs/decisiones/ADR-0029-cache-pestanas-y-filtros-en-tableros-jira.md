# ADR-0029: Caché, pestañas y filtros guardados en «Tableros Jira»

- Estado: aceptada (2026-11-23)
- Requisitos: JR-26, JR-27 y JR-46 a JR-49 (nuevos); cambian JR-20, JR-21, JR-30, JR-40, JR-41, JR-43, «Datos», «API» y «Fuera de alcance»
- Modifica: [requisitos/jira.md](../requisitos/jira.md) y la decisión del icono `⌃` de [ADR-0028](ADR-0028-colores-y-prioridades-en-tableros-jira.md). No cambia la plataforma ni el destino autorizado de ADR-0027

## Contexto

Con el sprint 14 el usuario pidió cuatro cambios en «Tableros Jira»:

1. **No volver a cargar al volver.** Ya existe «Actualizar», así que cambiar de tablero o de pestaña y volver no debería obligar a esperar otra consulta: el contenido debería quedarse guardado.
2. **Los tableros arriba, como pestañas**, en una línea horizontal, en lugar del selector.
3. **Filtros personalizados guardados**, en una línea justo debajo de los tableros, creados desde una pestaña nueva. Pueden filtrar por estado, prioridad, asignado, antigüedad (para incluir o excluir por tiempo), creación y actualización.
4. **Quitar el `⌃`** del principio de la prioridad: no queda bien.

Preguntas resueltas con el usuario (2026-11-23):

- **Ámbito de los filtros**: comunes a todos los tableros, no uno por tablero.
- **Aplicación**: uno activo cada vez; el filtro de texto sigue funcionando por encima.
- **«Antigüedad»** son los días desde que se creó el ticket, con «más de» y «menos de». «Creado» y «Actualizado» admiten además un rango de fechas.

## Decisión

Plan del sprint 15, aprobado por el usuario (2026-11-23):

- **La caché vive en la memoria de la mini app.** La mini app sigue montada mientras está oculta (N-05), así que guarda lo último consultado de cada tablero. No se usa la base ni el navegador: los tickets siguen sin guardarse en disco (JR-20, «Datos»).
  - Se consulta la primera vez que se muestra un tablero, con «Actualizar» o «Reintentar» y cuando su configuración cambia en el editor, porque los colores y las columnas salen de la consulta.
  - Cerrar la mini app (N-06) la vacía.
- **Pestañas en lugar del selector**, en el orden de creación y con desplazamiento horizontal si no caben.
- **Los filtros se guardan en la base de la mini app**, en una tabla nueva, como los tableros. Son comunes y comparan por nombre (estado, prioridad y asignado), sin distinguir mayúsculas ni acentos: así un filtro «Críticas» sirve en cualquier tablero, tenga o no esa prioridad.
- **Se filtra en la interfaz**, sobre los tickets ya consultados, sin pedir nada a Jira. No se añade JQL del usuario (sigue fuera de alcance) y se aprovecha la caché.
  - La consecuencia es que solo se filtra lo que el tablero trae: la columna final solo tiene los cerrados de los últimos 14 días.
- **Los criterios de un filtro se cumplen todos a la vez.** Dentro de una lista basta con uno de sus valores, o con ninguno si es «no es ninguno de». Las fechas relativas cuentan días de 24 horas hacia atrás desde el momento de aplicar el filtro; las absolutas comparan el día local del ticket.
- **La búsqueda pide además el campo `created`**, para la antigüedad y la fecha de creación.
- **La prioridad se muestra sin icono**, solo su nombre en su color. Deja sin efecto el icono `⌃` de ADR-0028.

## Alternativas descartadas

- **Guardar la caché en `localStorage` o en la base.** Los tickets saldrían de la memoria y quedarían en disco. Además, el usuario solo pidió no esperar al volver, no conservarlos al cerrar.
- **Filtros por tablero.** El usuario prefirió que sean comunes.
- **Traducir los filtros a JQL.** Exigiría consultar Jira con cada cambio de filtro y abriría la puerta a JQL armado por el usuario, que ADR-0027 deja fuera para no poder alterar la consulta.
- **Combinar varios filtros activos.** El usuario prefirió uno cada vez.

## Consecuencias

- La base de la mini app pasa a tener dos tablas, con la migración `V002__filters.sql`.
- Al volver a la mini app se ven los datos de la última consulta, con su hora, hasta pulsar «Actualizar».
- Un filtro con un estado, una prioridad o una persona que un tablero no tiene simplemente no deja pasar esos tickets en ese tablero.
