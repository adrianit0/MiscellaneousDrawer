package dev.cajonsastre.apps.repos;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.PrivateFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** RG-01 a RG-03: la lista de repositorios en {@code <config>/apps/repos/repos.json}. */
final class RepoStore {

    /** RG-03 */
    static final int MAX_REPOS = 50;

    /** El fichero. nextId: el identificador del próximo repositorio, para no reutilizar ninguno (RG-01). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Document(int nextId, List<Repo> repos) {

        Document {
            repos = repos == null ? List.of() : List.copyOf(repos);
        }
    }

    /** RG-01: la lista nace vacía. */
    static final Document INITIAL = new Document(1, List.of());

    private static final Logger log = LoggerFactory.getLogger(RepoStore.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path file;
    private volatile Document current;

    RepoStore(Path file) {
        this.file = file;
        this.current = load(file);
    }

    /** RG-01 */
    private static Document load(Path file) {
        if (!Files.isRegularFile(file)) {
            return INITIAL;
        }
        try {
            Document document = JSON.readValue(file.toFile(), Document.class);
            int maxId = 0;
            for (Repo repo : document.repos()) {
                repo.validate();
                maxId = Math.max(maxId, repo.id());
            }
            if (document.repos().size() > MAX_REPOS
                    || document.repos().stream().map(Repo::id).distinct().count() != document.repos().size()) {
                throw new IllegalArgumentException("Repositorios repetidos o de más");
            }
            return new Document(Math.max(document.nextId(), maxId + 1), document.repos());
        } catch (IOException | RuntimeException e) {
            // S-21: sin el contenido.
            log.warn("La lista de la mini app repos no se puede leer o no es válida: se parte de una vacía ({})",
                    e.getClass().getSimpleName());
            return INITIAL;
        }
    }

    List<Repo> list() {
        return current.repos();
    }

    /** RG-03 */
    Repo get(int id) {
        return current.repos().stream().filter(r -> r.id() == id).findFirst().orElseThrow(RepoStore::notFound);
    }

    synchronized Repo create(JsonNode body) throws IOException {
        Document before = current;
        Repo repo = Repo.from(body, before.nextId());
        if (before.repos().size() >= MAX_REPOS) {
            throw new ApiError(409, "too_many_repos", "No se pueden tener más de " + MAX_REPOS + " repositorios");
        }
        List<Repo> next = new ArrayList<>(before.repos());
        next.add(repo);
        save(new Document(before.nextId() + 1, next));
        return repo;
    }

    synchronized Repo update(int id, JsonNode body) throws IOException {
        Repo old = get(id);
        Repo repo = Repo.from(body, id);
        List<Repo> next = new ArrayList<>(current.repos());
        next.set(next.indexOf(old), repo);
        save(new Document(current.nextId(), next));
        return repo;
    }

    synchronized void delete(int id) throws IOException {
        Repo old = get(id);
        List<Repo> next = new ArrayList<>(current.repos());
        next.remove(old);
        save(new Document(current.nextId(), next));
    }

    private void save(Document document) throws IOException {
        PrivateFile.writeJson(file, JSON, document);
        current = document;
    }

    static ApiError notFound() {
        return ApiError.notFound("repo_not_found", "El repositorio no existe");
    }
}
