package dev.cajonsastre.apps.jira;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * JR-05: HTTP con el cliente del JDK, 20 s por llamada y sin seguir redirecciones. Copia de la de «Reenviar PR»: una
 * mini app no importa el código de otra (P-18, ADR-0027).
 */
final class HttpTransport implements Transport {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(20);

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(CONNECT_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    @Override
    public Reply send(String method, URI uri, Map<String, String> headers, String body)
            throws IOException, InterruptedException {
        HttpRequest.Builder request = HttpRequest.newBuilder(uri).timeout(REQUEST_TIMEOUT)
                .method(method, body == null
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        headers.forEach(request::header);
        HttpResponse<String> response = client.send(request.build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return new Reply(response.statusCode(), response.body());
    }

    @Override
    public Binary fetch(URI uri, Map<String, String> headers, int max) throws IOException, InterruptedException {
        HttpRequest.Builder request = HttpRequest.newBuilder(uri).timeout(REQUEST_TIMEOUT).GET();
        headers.forEach(request::header);
        HttpResponse<InputStream> response = client.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
        try (InputStream body = response.body()) {
            return new Binary(response.statusCode(), response.headers().firstValue("Content-Type").orElse(null),
                    body.readNBytes(max + 1));
        }
    }
}
