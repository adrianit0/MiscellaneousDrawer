package dev.cajonsastre.apps.jira;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * JR-29: el icono de cada tipo, descargado del sitio de Jira y devuelto como {@code data:}, porque la página solo carga
 * imágenes propias o {@code data:} y Jira pide autenticación (ADR-0034). Se guarda en memoria por sitio y tipo.
 */
final class TypeIcons {

    static final int MAX_BYTES = 64 * 1024;
    static final Set<String> TYPES = Set.of("image/png", "image/svg+xml", "image/gif", "image/jpeg", "image/webp");

    private final Jira jira;
    /** Optional.empty(): Jira respondió, pero el icono no cumple JR-29. */
    private final Map<String, Optional<String>> cache = new ConcurrentHashMap<>();

    TypeIcons(Jira jira) {
        this.jira = jira;
    }

    /** JR-29: el icono como data:, o null. Los errores de la llamada al tipo no se guardan. */
    String icon(JiraConfig config, String id) throws InterruptedException {
        String key = config.siteUrl() + " " + id;
        Optional<String> known = cache.get(key);
        if (known != null) {
            return known.orElse(null);
        }
        Optional<String> icon = Optional.ofNullable(fetch(config, id));
        cache.put(key, icon);
        return icon.orElse(null);
    }

    private String fetch(JiraConfig config, String id) throws InterruptedException {
        URI uri = sameSite(config.siteUrl(), jira.issueTypeIconUrl(config, id));
        if (uri == null) {
            return null;
        }
        Transport.Binary reply = jira.download(config, uri, MAX_BYTES);
        if (reply == null || reply.status() != 200 || reply.body() == null || reply.body().length > MAX_BYTES
                || reply.body().length == 0) {
            return null;
        }
        String type = mime(reply.contentType());
        if (type == null) {
            return null;
        }
        return "data:" + type + ";base64," + Base64.getEncoder().encodeToString(reply.body());
    }

    /** JR-29: la URL si es del sitio, con el mismo esquema, host y puerto; si no, null. */
    static URI sameSite(String site, String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        try {
            URI s = new URI(site);
            URI u = new URI(url);
            if (u.getScheme() == null || u.getHost() == null || u.getRawUserInfo() != null) {
                return null;
            }
            boolean same = u.getScheme().equalsIgnoreCase(s.getScheme())
                    && u.getHost().equalsIgnoreCase(s.getHost())
                    && port(u) == port(s);
            return same ? u : null;
        } catch (URISyntaxException e) {
            return null;
        }
    }

    private static int port(URI uri) {
        if (uri.getPort() != -1) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    /** JR-29: el tipo MIME sin parámetros, si es uno de los admitidos. */
    static String mime(String contentType) {
        if (contentType == null) {
            return null;
        }
        String type = contentType.split(";", 2)[0].strip().toLowerCase(Locale.ROOT);
        return TYPES.contains(type) ? type : null;
    }
}
