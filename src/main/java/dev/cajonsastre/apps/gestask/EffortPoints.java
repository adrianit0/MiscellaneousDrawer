package dev.cajonsastre.apps.gestask;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.Messages;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * GT-120: los PE cerrados de cada día, leídos de {@code calendar-month-get}, para «Lootboxes» (ADR-0026). Nunca hace
 * fallar la llamada reenviada, y la interfaz de «Gestask» no se entera de nada.
 */
final class EffortPoints {

    static final String FUNCTION = "calendar-month-get";
    static final String RECIPIENT = "lootboxes";
    static final String TYPE = "effort-points";

    private static final Logger log = LoggerFactory.getLogger(EffortPoints.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Messages messages;
    private final Clock clock;
    private final ZoneId zone;
    /** Lo enviado desde que arrancó, por día. */
    private final Map<String, BigDecimal> sent = new ConcurrentHashMap<>();

    EffortPoints(Messages messages, Clock clock, ZoneId zone) {
        this.messages = messages;
        this.clock = clock;
        this.zone = zone;
    }

    /** GT-120: tras reenviar con éxito una función; solo hace algo con calendar-month-get. */
    void forwarded(String function, String response) {
        if (!FUNCTION.equals(function)) {
            return;
        }
        try {
            LocalDate today = LocalDate.ofInstant(clock.instant(), zone);
            JsonNode days = JSON.readTree(response).path("days");
            for (JsonNode day : days) {
                JsonNode points = day.path("completed_points");
                if (!points.isNumber() || points.decimalValue().signum() <= 0) {
                    continue;
                }
                String date = day.path("date").asText("");
                LocalDate parsed;
                try {
                    parsed = LocalDate.parse(date);
                } catch (DateTimeParseException e) {
                    continue;
                }
                if (parsed.isAfter(today)) {
                    continue;
                }
                BigDecimal value = points.decimalValue().stripTrailingZeros();
                BigDecimal previous = sent.get(date);
                if (previous != null && previous.compareTo(value) == 0) {
                    continue;
                }
                messages.send(RECIPIENT, TYPE, JSON.createObjectNode().put("date", date).put("points", value).toString());
                sent.put(date, value);
            }
        } catch (Exception e) {
            // S-21: sin el contenido de la respuesta.
            log.warn("No se pudieron pasar a «Lootboxes» los PE del calendario: {}", e.getClass().getSimpleName());
        }
    }
}
