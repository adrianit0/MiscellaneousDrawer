package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.MiniApp;
import io.javalin.http.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * «Tableros Jira» (JR-01 a JR-53, ADR-0027 a ADR-0030): tableros propios sobre varios proyectos de Jira Cloud, con las
 * columnas y los estados que elige el usuario. Solo lee de Jira (JR-24). Sabe qué tickets son ya tareas de «Gestask»
 * por los mensajes que esta le envía (JR-50).
 */
public final class JiraApp implements MiniApp {

    static final AppManifest MANIFEST = new AppManifest("jira", "Tableros Jira",
            "Tus columnas sobre los estados de varios proyectos de Jira Cloud", "board", AppColor.CYAN,
            AppCategory.PRODUCTIVITY, List.of("jira", "tablero", "tickets", "kanban", "estados", "proyectos"), false);

    private static final Logger log = LoggerFactory.getLogger(JiraApp.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Transport transport;

    public JiraApp() {
        this(new HttpTransport());
    }

    /** Para las pruebas: Jira simulado. */
    JiraApp(Transport transport) {
        this.transport = transport;
    }

    @Override
    public AppManifest manifest() {
        return MANIFEST;
    }

    @Override
    public List<String> migrations() {
        return List.of("db/apps/jira/V001__initial.sql", "db/apps/jira/V002__filters.sql",
                "db/apps/jira/V003__gestask_tickets.sql");
    }

    @Override
    public List<Class<?>> mappers() {
        return List.of(BoardMapper.class, FilterMapper.class, GestaskTicketMapper.class);
    }

    @Override
    public void start(AppContext context, AppRoutes routes) {
        ConfigStore configs = new ConfigStore(context.configDir().resolve("config.json"));
        Jira jira = new Jira(transport);
        Boards boards = new Boards(context.store(), context.clock());
        Clock clock = context.clock();

        // JR-01 a JR-04
        routes.get("/config", ctx -> ctx.json(configs.get().view()));
        routes.put("/config", ctx -> {
            JiraConfig next = JiraConfig.from(body(ctx), configs.get());
            configs.save(next);
            ctx.json(next.view());
        });

        // JR-06
        routes.post("/connection/test", ctx -> {
            JiraConfig config = complete(configs);
            ctx.json(Map.of("ok", true, "user", jira.myself(config)));
        });

        // JR-10, JR-11
        routes.get("/projects", ctx -> {
            JiraConfig config = complete(configs);
            String query = ctx.queryParam("query");
            ctx.json(Map.of("projects", jira.projects(config, query == null ? "" : query.strip())));
        });
        routes.get("/projects/{key}/statuses", ctx -> {
            String key = ctx.pathParam("key");
            if (!Board.PROJECT_KEY.matcher(key).matches()) {
                throw ApiError.badRequest("invalid_project", "La clave de proyecto no es válida");
            }
            JiraConfig config = complete(configs);
            ctx.json(Map.of("statuses", jira.statuses(config, key)));
        });

        // JR-19
        routes.get("/priorities", ctx -> {
            JiraConfig config = complete(configs);
            ctx.json(Map.of("priorities", jira.priorities(config)));
        });

        // JR-13 a JR-16
        routes.get("/boards", ctx -> ctx.json(Map.of("boards", boards.list().stream().map(Board::view).toList())));
        routes.post("/boards", ctx -> ctx.status(201).json(boards.create(body(ctx)).view()));
        routes.put("/boards/{id}", ctx -> ctx.json(boards.replace(id(ctx), body(ctx)).view()));
        routes.delete("/boards/{id}", ctx -> {
            boards.delete(id(ctx));
            ctx.status(204);
        });

        // JR-26, JR-27
        Filters filters = new Filters(context.store(), clock);
        routes.get("/filters", ctx -> ctx.json(Map.of("filters", filters.list().stream().map(Filter::view).toList())));
        routes.post("/filters", ctx -> ctx.status(201).json(filters.create(body(ctx)).view()));
        routes.put("/filters/{id}", ctx -> ctx.json(filters.replace(filterId(ctx), body(ctx)).view()));
        routes.delete("/filters/{id}", ctx -> {
            filters.delete(filterId(ctx));
            ctx.status(204);
        });

        // JR-50: no contacta con Jira.
        GestaskTickets tickets = new GestaskTickets(context.store(), context.messages());
        routes.get("/gestask/tickets", ctx -> ctx.json(Map.of("tickets", tickets.list())));

        // JR-20 a JR-23
        routes.get("/boards/{id}/issues", ctx -> {
            Board board = boards.find(id(ctx));
            JiraConfig config = complete(configs);
            ctx.json(issues(jira, config, board, clock));
        });
    }

    /** JR-20 a JR-23, JR-25 */
    static Map<String, Object> issues(Jira jira, JiraConfig config, Board board, Clock clock) throws InterruptedException {
        // JR-20: los estados que siguen en Jira, por proyecto.
        Map<String, Map<String, String>> current = new HashMap<>();
        for (String project : board.projects()) {
            Optional<List<Jira.Status>> statuses = jira.statusesIfExists(config, project);
            Map<String, String> names = new HashMap<>();
            statuses.ifPresent(list -> list.forEach(s -> names.put(s.id(), s.name())));
            current.put(project, names);
        }
        Set<String> missingPairs = new HashSet<>();
        List<Map<String, Object>> missing = new ArrayList<>();
        for (Board.Column column : board.columns()) {
            for (Board.StatusRef s : column.statuses()) {
                if (!current.getOrDefault(s.project(), Map.of()).containsKey(s.id())) {
                    missingPairs.add(s.pair());
                    missing.add(Map.of("project", s.project(), "id", s.id(), "name", s.name(), "column", column.name()));
                }
            }
        }

        String jql = IssueQuery.jql(board, s -> !missingPairs.contains(s.pair()));
        Jira.Search search = jql == null
                ? new Jira.Search(List.of(), false)
                : jira.search(config, jql, IssueQuery.MAX_ISSUES);
        Map<Board.Column, List<Jira.Issue>> placed = IssueQuery.place(board, search.issues());

        List<Map<String, Object>> columns = new ArrayList<>();
        int shown = 0;
        for (Map.Entry<Board.Column, List<Jira.Issue>> e : placed.entrySet()) {
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("name", e.getKey().name());
            col.put("issues", e.getValue().stream().map(i -> view(board, i)).toList());
            columns.add(col);
            shown += e.getValue().size();
        }
        // JR-25: solo el número del tablero y cuántos tickets.
        log.info("Tablero {} consultado: {} tickets", board.id(), shown);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("board", Map.of("id", board.id(), "name", board.name()));
        out.put("columns", columns);
        out.put("fetchedAt", clock.instant().toString());
        out.put("truncated", search.truncated());
        out.put("missingStatuses", missing);
        return out;
    }

    /** JR-20: el ticket con el color de su par en el tablero y su prioridad con el color del tablero, si la tiene. */
    private static Map<String, Object> view(Board board, Jira.Issue issue) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", issue.key());
        out.put("summary", issue.summary());
        out.put("project", issue.project());
        out.put("status", issue.status());
        out.put("statusColor", board.columns().stream().flatMap(c -> c.statuses().stream())
                .filter(s -> s.project().equals(issue.project()) && s.id().equals(issue.statusId()))
                .map(Board.StatusRef::color).findFirst().orElse(Board.DEFAULT_COLOR));
        out.put("assignee", issue.assignee());
        if (issue.priorityId() == null) {
            out.put("priority", null);
        } else {
            Map<String, Object> priority = new LinkedHashMap<>();
            priority.put("id", issue.priorityId());
            priority.put("name", issue.priorityName());
            priority.put("color", board.priority(issue.priorityId()).map(Board.Priority::color).orElse(null));
            out.put("priority", priority);
        }
        out.put("created", issue.created());
        out.put("updated", issue.updated());
        return out;
    }

    private static JiraConfig complete(ConfigStore configs) {
        JiraConfig config = configs.get();
        config.requireComplete();
        return config;
    }

    private static long id(Context ctx) {
        try {
            return Long.parseLong(ctx.pathParam("id"));
        } catch (NumberFormatException e) {
            throw ApiError.notFound("not_found", "El tablero no existe");
        }
    }

    private static long filterId(Context ctx) {
        try {
            return Long.parseLong(ctx.pathParam("id"));
        } catch (NumberFormatException e) {
            throw Filters.notFound();
        }
    }

    private static JsonNode body(Context ctx) {
        try {
            return JSON.readTree(ctx.body());
        } catch (IOException e) {
            throw ApiError.badRequest("invalid_request", "El cuerpo no es JSON válido");
        }
    }
}
