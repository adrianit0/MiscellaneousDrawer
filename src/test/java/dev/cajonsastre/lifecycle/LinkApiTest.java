package dev.cajonsastre.lifecycle;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.TestApi;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/** C-16: los enlaces externos se abren en el Chrome habitual del usuario, no en la ventana de la aplicación. */
class LinkApiTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    final List<String> opened = new CopyOnWriteArrayList<>();
    volatile boolean browserFound = true;
    TestApi api;

    @BeforeEach
    void start() {
        api = TestApi.start(List.of(new LinkApi(url -> {
            opened.add(url);
            return browserFound;
        })));
    }

    @AfterEach
    void stop() {
        api.close();
    }

    private HttpResponse<String> open(String url) throws Exception {
        return api.post("/api/open-link", JSON.writeValueAsString(Map.of("url", url)));
    }

    @Test
    void c16_opens_a_web_link_outside_the_window() throws Exception {
        HttpResponse<String> r = open("https://tickets.example.com/browse/ABC-1?jql=a|b&q=año#c");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(TestApi.json(r).path("ok").asBoolean()).isTrue();
        assertThat(open("HTTP://EXAMPLE.COM:8080").statusCode()).isEqualTo(200);
        assertThat(opened).containsExactly("https://tickets.example.com/browse/ABC-1?jql=a|b&q=año#c",
                "HTTP://EXAMPLE.COM:8080");
    }

    @Test
    void c16_only_http_and_https_links_are_opened() throws Exception {
        List<String> rejected = List.of("", "file:///etc/passwd", "javascript:alert(1)", "chrome://settings",
                "ftp://example.com/", "--user-data-dir=/tmp/x", "http://", "https:///path", "https://?q=1",
                "http://example.com/a b", "http://example.com/\nx", "http://example.com/\u0000",
                "http://example.com/ ", "https://example.com/" + "a".repeat(LinkApi.MAX_LENGTH));
        for (String url : rejected) {
            HttpResponse<String> r = open(url);
            assertThat(r.statusCode()).as(url).isEqualTo(400);
            assertThat(TestApi.json(r).path("code").asText()).as(url).isEqualTo("invalid_url");
        }
        HttpResponse<String> missing = api.post("/api/open-link", "{}");
        assertThat(missing.statusCode()).isEqualTo(400);
        assertThat(TestApi.json(missing).path("code").asText()).isEqualTo("invalid_url");
        for (String body : List.of("null", "[]", "{\"url\":5}", "{\"url\":null}")) {
            HttpResponse<String> r = api.post("/api/open-link", body);
            assertThat(r.statusCode()).as(body).isEqualTo(400);
            assertThat(TestApi.json(r).path("code").asText()).as(body).isEqualTo("invalid_url");
        }
        assertThat(TestApi.json(api.post("/api/open-link", "{")).path("code").asText()).isEqualTo("invalid_json");
        assertThat(opened).isEmpty();
    }

    @Test
    void c16_says_so_when_no_browser_can_be_launched() throws Exception {
        browserFound = false;
        HttpResponse<String> r = open("https://example.com/");
        assertThat(r.statusCode()).isEqualTo(500);
        assertThat(TestApi.json(r).path("code").asText()).isEqualTo("open_failed");
        assertThat(TestApi.json(r).path("message").asText()).isNotBlank();
    }

    @Test
    void c16_the_link_goes_to_the_usual_chrome_and_not_to_the_window_profile() {
        // Sin --app ni --user-data-dir: Chrome usa el perfil por defecto del usuario y se une al que ya está abierto.
        assertThat(Desktop.linkCommand("https://example.com/")).containsExactly("google-chrome", "https://example.com/");
    }

    @Test
    void c16_the_browser_does_not_inherit_the_jpackage_launcher_variables() {
        Map<String, String> env = new HashMap<>(Map.of("_JPACKAGE_LAUNCHER", "x", "LD_LIBRARY_PATH", "/opt/lib",
                "PATH", "/usr/bin", "DISPLAY", ":0"));
        Desktop.withoutLauncherVariables(env);
        assertThat(env).containsOnlyKeys("PATH", "DISPLAY");
    }
}
