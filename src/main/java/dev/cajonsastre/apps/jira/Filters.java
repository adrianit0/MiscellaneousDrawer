package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.Store;

import java.io.UncheckedIOException;
import java.time.Clock;
import java.util.List;
import java.util.Locale;

/** JR-26, JR-27: los filtros guardados en la base de la mini app. Guardarlos no contacta con Jira. */
final class Filters {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final Store store;
    private final Clock clock;

    Filters(Store store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    /** JR-26: en el orden de creación. */
    List<Filter> list() {
        return store.read(s -> s.getMapper(FilterMapper.class).list().stream().map(Filters::parse).toList());
    }

    /** JR-26: 409 too_many_filters con 30 ya creados. */
    Filter create(JsonNode body) {
        Filter filter = Filter.from(0, body);
        String definition = json(filter);
        return store.write(s -> {
            FilterMapper m = s.getMapper(FilterMapper.class);
            if (m.count() >= Filter.MAX_FILTERS) {
                throw new ApiError(409, "too_many_filters", "Puede haber " + Filter.MAX_FILTERS + " filtros como mucho");
            }
            requireUniqueName(m, filter.name(), 0);
            m.insert(filter.name(), definition, clock.instant().toString());
            return new Filter(m.lastId(), filter.name(), filter.statuses(), filter.priorities(), filter.assignees(),
                    filter.created(), filter.updated());
        });
    }

    /** JR-27: sustituye el filtro entero. */
    Filter replace(long id, JsonNode body) {
        Filter filter = Filter.from(id, body);
        String definition = json(filter);
        return store.write(s -> {
            FilterMapper m = s.getMapper(FilterMapper.class);
            if (m.find(id) == null) {
                throw notFound();
            }
            requireUniqueName(m, filter.name(), id);
            m.update(id, filter.name(), definition, clock.instant().toString());
            return filter;
        });
    }

    void delete(long id) {
        int deleted = store.write(s -> s.getMapper(FilterMapper.class).delete(id));
        if (deleted == 0) {
            throw notFound();
        }
    }

    /** JR-27: sin repetir el nombre, sin distinguir mayúsculas. */
    private static void requireUniqueName(FilterMapper m, String name, long self) {
        String wanted = name.toLowerCase(Locale.ROOT);
        for (FilterMapper.Row row : m.list()) {
            if (row.id() != self && row.name().toLowerCase(Locale.ROOT).equals(wanted)) {
                throw Filter.invalid("name", "Ya hay un filtro llamado «" + row.name() + "»");
            }
        }
    }

    static ApiError notFound() {
        return ApiError.notFound("not_found", "El filtro no existe");
    }

    private static String json(Filter filter) {
        try {
            return JSON.writeValueAsString(filter.definition());
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Filter parse(FilterMapper.Row row) {
        try {
            JsonNode node = JSON.readTree(row.definition());
            ((ObjectNode) node).put("name", row.name());
            return Filter.from(row.id(), node);
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(e);
        }
    }
}
