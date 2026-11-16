package dev.cajonsastre.apps.gestask;

import java.io.IOException;
import java.net.URI;
import java.util.Map;

/** GT-17: la única salida de la mini app. Las pruebas la sustituyen por un Supabase simulado. */
interface Transport {

    /** La respuesta de Supabase, sea cual sea su estado. */
    record Reply(int status, String body) {
    }

    /** body null: sin cuerpo. Lanza si no hay contacto (GT-16). */
    Reply send(String method, URI uri, Map<String, String> headers, String body) throws IOException, InterruptedException;
}
