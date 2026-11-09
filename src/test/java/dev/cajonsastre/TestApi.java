package dev.cajonsastre;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.http.ApiRoutes;
import dev.cajonsastre.http.HttpServer;
import dev.cajonsastre.http.LocalSecurity;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

/** Servidor real en un puerto libre y un cliente con el token, para las pruebas de la API. */
public final class TestApi implements AutoCloseable {

    public static final String TOKEN = "test-token-0123456789abcdefghijklmnop";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final int port;
    private final HttpServer server;
    private final HttpClient client = HttpClient.newHttpClient();

    private TestApi(int port, HttpServer server) {
        this.port = port;
        this.server = server;
    }

    public static TestApi start(List<ApiRoutes> routes) {
        int port = freePort();
        return new TestApi(port, new HttpServer(port, TOKEN, routes).start());
    }

    public static int freePort() {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public int port() {
        return port;
    }

    public HttpResponse<String> get(String path) {
        return send("GET", path, null);
    }

    public HttpResponse<String> put(String path, String json) {
        return send("PUT", path, json);
    }

    public HttpResponse<String> post(String path, String json) {
        return send("POST", path, json);
    }

    public HttpResponse<String> send(String method, String path, String json) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header(LocalSecurity.TOKEN_HEADER, TOKEN);
        if (json != null) {
            b.header("Content-Type", "application/json");
        }
        b.method(method, json == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json));
        try {
            return client.send(b.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    public static JsonNode json(HttpResponse<String> r) {
        try {
            return JSON.readTree(r.body());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public void close() {
        server.stop();
    }
}
