package dev.cajonsastre.apps.jira;

import java.io.IOException;
import java.net.URI;
import java.util.Map;

/** JR-05: la salida hacia Jira. Las pruebas la sustituyen por un Jira simulado (ADR-0027). */
interface Transport {

    /** La respuesta de Jira, sea cual sea su estado. */
    record Reply(int status, String body) {
    }

    /** JR-29: una respuesta binaria, con su Content-Type (o null) y como mucho max + 1 bytes del cuerpo. */
    record Binary(int status, String contentType, byte[] body) {
    }

    /** body null: sin cuerpo. Lanza si no hay contacto (JR-07). */
    Reply send(String method, URI uri, Map<String, String> headers, String body) throws IOException, InterruptedException;

    /**
     * JR-29: un GET con respuesta binaria, como el icono de un tipo. Lee como mucho max + 1 bytes, para saber si es más
     * grande que max sin leerlo entero. Lanza si no hay contacto.
     */
    Binary fetch(URI uri, Map<String, String> headers, int max) throws IOException, InterruptedException;
}
