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

/** JR-13 a JR-16: los tableros en la base de la mini app. Guardar no contacta con Jira. */
final class Boards {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final Store store;
    private final Clock clock;

    Boards(Store store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    /** JR-16: en el orden de creación. */
    List<Board> list() {
        return store.read(s -> s.getMapper(BoardMapper.class).list().stream().map(Boards::parse).toList());
    }

    Board find(long id) {
        BoardMapper.Row row = store.read(s -> s.getMapper(BoardMapper.class).find(id));
        if (row == null) {
            throw notFound();
        }
        return parse(row);
    }

    /** JR-13, JR-14: 409 too_many_boards con 20 ya creados. */
    Board create(JsonNode body) {
        Board board = Board.from(0, body);
        String definition = json(board);
        return store.write(s -> {
            BoardMapper m = s.getMapper(BoardMapper.class);
            if (m.count() >= Board.MAX_BOARDS) {
                throw new ApiError(409, "too_many_boards", "Puede haber " + Board.MAX_BOARDS + " tableros como mucho");
            }
            requireUniqueName(m, board.name(), 0);
            m.insert(board.name(), definition, clock.instant().toString());
            return new Board(m.lastId(), board.name(), board.projects(), board.columns());
        });
    }

    /** JR-14: sustituye el tablero entero. */
    Board replace(long id, JsonNode body) {
        Board board = Board.from(id, body);
        String definition = json(board);
        return store.write(s -> {
            BoardMapper m = s.getMapper(BoardMapper.class);
            if (m.find(id) == null) {
                throw notFound();
            }
            requireUniqueName(m, board.name(), id);
            m.update(id, board.name(), definition, clock.instant().toString());
            return board;
        });
    }

    /** JR-16 */
    void delete(long id) {
        int deleted = store.write(s -> s.getMapper(BoardMapper.class).delete(id));
        if (deleted == 0) {
            throw notFound();
        }
    }

    /** JR-14: sin repetir el nombre, sin distinguir mayúsculas. */
    private static void requireUniqueName(BoardMapper m, String name, long self) {
        String wanted = name.toLowerCase(Locale.ROOT);
        for (BoardMapper.Row row : m.list()) {
            if (row.id() != self && row.name().toLowerCase(Locale.ROOT).equals(wanted)) {
                throw Board.invalid("name", "Ya hay un tablero llamado «" + row.name() + "»");
            }
        }
    }

    private static ApiError notFound() {
        return ApiError.notFound("not_found", "El tablero no existe");
    }

    private static String json(Board board) {
        try {
            return JSON.writeValueAsString(board.definition());
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Board parse(BoardMapper.Row row) {
        try {
            JsonNode node = JSON.readTree(row.definition());
            ((ObjectNode) node).put("name", row.name());
            return Board.from(row.id(), node);
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(e);
        }
    }
}
