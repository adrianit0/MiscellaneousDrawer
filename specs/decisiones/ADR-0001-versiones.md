# ADR-0001: Versiones fijadas

- Estado: aceptada
- Fecha: 2026-11-09
- Requisitos: tabla «Stack» de `diseno/arquitectura.md`

## Contexto

CajonSastre usa el mismo stack que LiteDD. Compartir versiones evita sorpresas al pasar de un proyecto a otro y aprovecha la caché local de Maven y npm.

## Decisión

Se usan versiones exactas, sin rangos, las mismas que LiteDD en la fecha de este ADR. Las de la interfaz se fijan sin `^` en `package.json` y se instalan con `npm ci` desde `package-lock.json`.

### Entorno

| Pieza | Versión |
|---|---|
| JDK | 21 (LTS) |
| Node.js | 24 o superior |
| Maven Wrapper | 3.3.4 (`only-script`) |
| Maven | 3.9.16 |

### Backend (`pom.xml`)

| Dependencia | Versión |
|---|---|
| io.javalin:javalin | 7.2.3 |
| com.fasterxml.jackson.core:jackson-databind | 2.22.3 |
| org.mybatis:mybatis | 3.5.14 |
| org.xerial:sqlite-jdbc | 3.53.4.0 |
| org.slf4j:slf4j-api | 2.0.20 |
| ch.qos.logback:logback-classic | 1.6.5 |
| org.junit:junit-bom | 5.14.4 |
| org.assertj:assertj-core | 3.27.7 |

| Plugin | Versión |
|---|---|
| maven-compiler-plugin | 3.16.0 |
| maven-resources-plugin | 3.5.0 |
| maven-surefire-plugin | 3.6.0 |
| exec-maven-plugin | 3.6.4 |

### Interfaz (`frontend/package.json`)

| Paquete | Versión |
|---|---|
| react, react-dom | 19.3.0 |
| zustand | 5.0.15 |
| typescript | 7.0.2 |
| vite | 8.3.2 |
| @vitejs/plugin-react | 6.1.1 |
| vitest | 5.0.3 |
| jsdom | 30.1.1 |
| @testing-library/react | 16.3.3 |
| @testing-library/dom | 10.4.2 |
| @types/react, @types/react-dom | 19.3.0 |

No se incluyen las dependencias que solo usaba LiteDD (MySQL, HikariCP, CodeMirror, markdown-it, Mermaid, dnd-kit…). Una mini app que necesite una dependencia nueva la añade aquí al especificarse.

## Consecuencias

Actualizar una versión exige editar este ADR o añadir uno nuevo.
