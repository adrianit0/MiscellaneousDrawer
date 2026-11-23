package dev.cajonsastre.apps.jira;

import java.io.IOException;
import java.net.URI;
import java.util.Map;

/** JR-05: la salida hacia Jira. Las pruebas la sustituyen por un Jira simulado (ADR-0027). */
interface Transport {

    /** La respuesta de Jira, sea cual sea su estado. */
    record Reply(int status, String body) {
    }

    /** body null: sin cuerpo. Lanza si no hay contacto (JR-07). */
    Reply send(String method, URI uri, Map<String, String> headers, String body) throws IOException, InterruptedException;
}
