# Requisitos de interfaz

Reglas comunes al shell y a todas las mini apps. La disposición de la ventana está en [navegacion.md](navegacion.md).

| ID | Requisito |
|---|---|
| U-01 | Tema oscuro único, definido con variables CSS: fondo, superficie, superficie elevada, borde, texto, texto atenuado, acento, error, aviso y los seis colores de mini app (`blue`, `green`, `violet`, `orange`, `cyan`, `gold`). Todo texto y todo color de mini app tiene contraste AA (4,5:1) sobre fondo, superficie y superficie elevada. |
| U-02 | Toda la interfaz está en español. Fechas como dd/MM/yyyy HH:mm; coma decimal. |
| U-03 | Tipografía del sistema para la interfaz; monoespaciada para código y datos. |
| U-04 | Toda la ventana se puede manejar con teclado y el foco es siempre visible. No se usan atajos reservados por el navegador: Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Mayús+Tab, Ctrl+L, Ctrl+R, Ctrl+F, Ctrl+P, Ctrl+Mayús+N, Ctrl+Mayús+T, F5 ni F11. |
| U-05 | Los avisos (guardado, errores leves) aparecen abajo a la derecha y no bloquean. Los diálogos se reservan para ajustes y para confirmar acciones destructivas. |
| U-06 | «Ajustes» (⚙) es una ventana de alto fijo con las categorías a la izquierda y la elegida a la derecha, que es lo único que se desplaza. Categorías, en este orden: «General», con el puerto, que se aplica al siguiente arranque, y el apagado automático (C-05); «Actualizaciones», con la versión instalada, «URL del repositorio» y los botones «Buscar actualizaciones» y «Actualizar» (R-10 a R-14). «Guardar» guarda los ajustes de todas las categorías y cierra; «Cerrar», la ×, y Esc cierran sin guardar. |
| U-07 | Si se pierde el contacto con el servidor, aparece una banda de aviso y se reintenta cada 3 s. Al recuperarlo, la interfaz relee el token de la página inicial (un servidor reiniciado tiene uno nuevo, S-12), vuelve a abrir el canal de presencia y recarga el catálogo. Si el servidor es otro build, la ventana se recarga para tomar su interfaz (R-45). |
| U-08 | El logotipo es un cajón con objetos de colores asomando. Es también el favicon, sobre una placa del color de la barra superior. En la barra superior va junto al nombre «Cajón de sastre»; los dos forman el enlace a Inicio, cuyo nombre accesible es «Cajón de sastre», y el logotipo es decorativo. |
