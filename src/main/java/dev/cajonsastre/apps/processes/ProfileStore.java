package dev.cajonsastre.apps.processes;

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

/** CP-01 a CP-04: los perfiles en {@code <config>/apps/processes/profiles.json}. */
final class ProfileStore {

    /** CP-04 */
    static final int MAX_PROFILES = 50;

    /** El fichero. nextId: el identificador del próximo perfil, para no reutilizar ninguno (CP-01). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Document(int nextId, List<Profile> profiles) {

        Document {
            profiles = profiles == null ? List.of() : List.copyOf(profiles);
        }
    }

    /** CP-02: lo que hacía cerrarIntelliJ.sh. */
    static final Document INITIAL = new Document(2, List.of(new Profile(1, "IntelliJ IDEA", "idea|IntelliJ", 8080, 8090)));

    private static final Logger log = LoggerFactory.getLogger(ProfileStore.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path file;
    private volatile Document current;

    ProfileStore(Path file) {
        this.file = file;
        this.current = load(file);
    }

    /** CP-02 */
    private static Document load(Path file) {
        if (!Files.isRegularFile(file)) {
            return INITIAL;
        }
        try {
            Document document = JSON.readValue(file.toFile(), Document.class);
            int maxId = 0;
            for (Profile profile : document.profiles()) {
                profile.validate();
                maxId = Math.max(maxId, profile.id());
            }
            if (document.profiles().size() > MAX_PROFILES
                    || document.profiles().stream().map(Profile::id).distinct().count() != document.profiles().size()) {
                throw new IllegalArgumentException("Perfiles repetidos o de más");
            }
            return new Document(Math.max(document.nextId(), maxId + 1), document.profiles());
        } catch (IOException | RuntimeException e) {
            // S-21: sin el contenido.
            log.warn("Los perfiles de la mini app processes no se pueden leer o no son válidos: se parte del inicial ({})",
                    e.getClass().getSimpleName());
            return INITIAL;
        }
    }

    List<Profile> list() {
        return current.profiles();
    }

    /** CP-04 */
    Profile get(int id) {
        return current.profiles().stream().filter(p -> p.id() == id).findFirst().orElseThrow(ProfileStore::notFound);
    }

    synchronized Profile create(JsonNode body) throws IOException {
        Document before = current;
        Profile profile = Profile.from(body, before.nextId());
        if (before.profiles().size() >= MAX_PROFILES) {
            throw new ApiError(409, "too_many_profiles", "No se pueden tener más de " + MAX_PROFILES + " perfiles");
        }
        List<Profile> next = new ArrayList<>(before.profiles());
        next.add(profile);
        save(new Document(before.nextId() + 1, next));
        return profile;
    }

    synchronized Profile update(int id, JsonNode body) throws IOException {
        Profile old = get(id);
        Profile profile = Profile.from(body, id);
        List<Profile> next = new ArrayList<>(current.profiles());
        next.set(next.indexOf(old), profile);
        save(new Document(current.nextId(), next));
        return profile;
    }

    synchronized void delete(int id) throws IOException {
        Profile old = get(id);
        List<Profile> next = new ArrayList<>(current.profiles());
        next.remove(old);
        save(new Document(current.nextId(), next));
    }

    private void save(Document document) throws IOException {
        PrivateFile.writeJson(file, JSON, document);
        current = document;
    }

    static ApiError notFound() {
        return ApiError.notFound("profile_not_found", "El perfil no existe");
    }
}
