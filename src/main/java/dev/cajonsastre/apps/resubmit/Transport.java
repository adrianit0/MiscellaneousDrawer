package dev.cajonsastre.apps.resubmit;

import java.io.IOException;
import java.net.URI;
import java.util.Map;

/** RP-06: la salida hacia Bitbucket. Las pruebas la sustituyen por un Bitbucket simulado (ADR-0023). */
interface Transport {

    /** La respuesta de Bitbucket, sea cual sea su estado. */
    record Reply(int status, String body) {
    }

    /** body null: sin cuerpo. Lanza si no hay contacto (RP-06). */
    Reply send(String method, URI uri, Map<String, String> headers, String body) throws IOException, InterruptedException;
}
