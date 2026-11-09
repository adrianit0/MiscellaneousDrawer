# Constitución

Principios que no se negocian. Cualquier cambio exige modificar antes la especificación y registrar un ADR.

1. **La especificación manda.** Si el código y la especificación difieren, se corrige primero la especificación y después el código.
2. **Nada fuera de alcance.** No se añaden funciones, mini apps, dependencias ni ajustes que la especificación no pida.
3. **Mini apps aisladas.** Cada mini app tiene su identidad, sus datos, sus rutas de API y su estado de interfaz. Ninguna lee ni escribe los de otra ni los del shell, y solo usa la plataforma a través de su contrato público (`specs/diseno/mini-apps.md`). El fallo de una mini app no tumba el shell ni a las demás.
4. **Los datos no salen de la máquina.** CajonSastre no se conecta a ningún destino externo. La lista de destinos autorizados está vacía: una mini app que necesite uno lo añade con la autorización expresa del usuario y un ADR. No hay internet, telemetría ni CDN.
5. **Convive con LiteDD.** No comparte con LiteDD puerto, carpetas de datos, configuración ni registro, cabecera de token, clase de ventana, perfil de Chrome ni esquema de enlaces. Las dos aplicaciones pueden estar en marcha a la vez (C-08).
6. **Repositorio público.** Se aplican siempre las reglas S-30 a S-35.
7. **Los datos del usuario no se pierden.** Transacciones, copia antes de cada migración y guardado continuo.
8. **Simplicidad.** Sin Spring y sin abstracciones que no tengan dos usos reales. El contrato de mini apps es la excepción explícita: existe porque cada mini app es un uso.
9. **Cada requisito tiene al menos una prueba** que lo cita por su identificador.
10. **Ante una ambigüedad, se pregunta**; la respuesta se registra como ADR. Si no se puede preguntar, se decide lo más conservador, se registra como ADR «propuesta» y se señala al usuario.
