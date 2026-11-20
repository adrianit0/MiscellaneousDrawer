# Constitución

Principios que no se negocian. Cualquier cambio exige modificar antes la especificación y registrar un ADR.

1. **La especificación manda.** Si el código y la especificación difieren, se corrige primero la especificación y después el código.
2. **Nada fuera de alcance.** No se añaden funciones, mini apps, dependencias ni ajustes que la especificación no pida.
3. **Mini apps aisladas.** Cada mini app tiene su identidad, sus datos, sus rutas de API y su estado de interfaz. Ninguna lee ni escribe los de otra ni los del shell, y solo usa la plataforma a través de su contrato público (`specs/diseno/mini-apps.md`). El fallo de una mini app no tumba el shell ni a las demás.
4. **Los datos no salen de la máquina.** CajonSastre solo se conecta a los destinos de una lista cerrada que autoriza el usuario. Hoy tiene cinco: GitHub, para que el shell busque y descargue actualizaciones cuando el usuario pulsa un botón (ADR-0010); S3, para que la mini app «Base de datos» descargue volcados cuando el usuario inicia un trabajo (ADR-0011); los servidores git de los repositorios que el usuario configure, para que la mini app «Repositorios» traiga sus cambios cuando él inicia un trabajo, sin enviar nunca nada (ADR-0019); el proyecto de Supabase que el usuario configure, para que la mini app «Gestask» lea y guarde allí sus tareas, que es donde ya las tiene su versión web (ADR-0020); y el servidor de Bitbucket Data Center que el usuario configure, junto con el servidor git de su repositorio, para que la mini app «Reenviar PR» liste sus PR rechazados, suba las ramas nuevas y vuelva a crear los PR cuando él inicia un trabajo (ADR-0023). Solo las dos últimas envían datos del usuario, y solo a esos servidores. Añadir un destino, también para una mini app, exige la autorización expresa del usuario y un ADR. No hay telemetría ni CDN.
5. **Convive con LiteDD.** No comparte con LiteDD puerto, carpetas de datos, configuración ni registro, cabecera de token, clase de ventana, perfil de Chrome ni esquema de enlaces. Las dos aplicaciones pueden estar en marcha a la vez (C-08).
6. **Repositorio público.** Se aplican siempre las reglas S-30 a S-35.
7. **Los datos del usuario no se pierden.** Transacciones, copia antes de cada migración y guardado continuo.
8. **Simplicidad.** Sin Spring y sin abstracciones que no tengan dos usos reales. El contrato de mini apps es la excepción explícita: existe porque cada mini app es un uso.
9. **Cada requisito tiene al menos una prueba** que lo cita por su identificador.
10. **Ante una ambigüedad, se pregunta**; la respuesta se registra como ADR. Si no se puede preguntar, se decide lo más conservador, se registra como ADR «propuesta» y se señala al usuario.
