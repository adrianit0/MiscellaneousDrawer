package dev.cajonsastre.lifecycle;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.http.ApiRoutes;
import dev.cajonsastre.platform.ApiError;
import io.javalin.config.RoutesConfig;

import java.util.Locale;
import java.util.Map;
import java.util.function.Predicate;

/**
 * C-16: {@code POST /api/open-link} abre un enlace externo en el Chrome habitual del usuario. La ventana es un Chrome
 * con perfil propio (C-03) y la página no puede abrir nada fuera de él, así que se lo pide al servidor (ADR-0021).
 */
public final class LinkApi implements ApiRoutes {

    /** C-16: longitud máxima de la URL. */
    static final int MAX_LENGTH = 8192;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Predicate<String> opener;

    public LinkApi() {
        this(Desktop::openLink);
    }

    /** Para las pruebas: sin abrir ningún navegador. El abridor dice si pudo lanzarlo. */
    LinkApi(Predicate<String> opener) {
        this.opener = opener;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.post("/api/open-link", ctx -> {
            // {"url": "<texto>"}; cualquier otra cosa, incluido null o un número, no es un enlace.
            JsonNode url = JSON.readTree(ctx.body()).path("url");
            if (!url.isTextual() || !isWebLink(url.textValue())) {
                throw ApiError.badRequest("invalid_url", "Solo se pueden abrir enlaces http o https");
            }
            if (!opener.test(url.textValue())) {
                throw new ApiError(500, "open_failed", "No se pudo abrir el enlace: no se encontró Chrome ni xdg-open");
            }
            ctx.json(Map.of("ok", true));
        });
    }

    /**
     * C-16: {@code http://} o {@code https://} con host, sin espacios ni caracteres de control. Así nunca se abre un
     * fichero local ni se pasa una opción a Chrome.
     */
    static boolean isWebLink(String url) {
        if (url == null || url.length() > MAX_LENGTH) {
            return false;
        }
        String lower = url.toLowerCase(Locale.ROOT);
        int host = lower.startsWith("https://") ? 8 : lower.startsWith("http://") ? 7 : -1;
        if (host < 0) {
            return false;
        }
        for (int i = 0; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c <= ' ' || Character.isISOControl(c) || Character.isSpaceChar(c)) {
                return false;
            }
        }
        int end = host;
        while (end < url.length() && "/?#".indexOf(url.charAt(end)) < 0) {
            end++;
        }
        return end > host;
    }
}
