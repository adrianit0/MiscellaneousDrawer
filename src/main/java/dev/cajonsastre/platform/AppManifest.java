package dev.cajonsastre.platform;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Identidad de una mini app (P-01, P-02). Se valida al construirse: un manifiesto no válido es un error de
 * programación e impide arrancar (P-03).
 *
 * @param id          P-01: 2 a 32 caracteres, minúsculas, cifras y guiones; único e inmutable
 * @param name        nombre visible, de 1 a 40 caracteres
 * @param description descripción de una línea, de 1 a 140 caracteres
 * @param icon        nombre de un icono de {@code frontend/src/shell/icons/} (P-19)
 * @param color       color de la mini app en el tema (U-01)
 * @param category    grupo del lanzador (L-01)
 * @param keywords    hasta 10 palabras clave para el buscador (L-03, N-09)
 * @param planned     en preparación: solo tiene manifiesto (L-05)
 */
public record AppManifest(String id, String name, String description, String icon, AppColor color,
                          AppCategory category, List<String> keywords, boolean planned) {

    public static final Pattern ID = Pattern.compile("[a-z][a-z0-9-]*[a-z0-9]");
    public static final int MAX_ID = 32;
    /** P-01: nombres del propio shell. */
    public static final Set<String> RESERVED_IDS = Set.of("shell", "cajonsastre", "platform", "home");
    public static final int MAX_NAME = 40;
    public static final int MAX_DESCRIPTION = 140;
    public static final int MAX_KEYWORDS = 10;
    private static final int MAX_KEYWORD = 40;
    private static final Pattern ICON = Pattern.compile("[a-z][a-z0-9-]*");

    public AppManifest {
        if (id == null || id.length() > MAX_ID || !ID.matcher(id).matches()) {
            throw new IllegalArgumentException("Identificador de mini app no válido: " + id);
        }
        if (RESERVED_IDS.contains(id)) {
            throw new IllegalArgumentException("El identificador " + id + " está reservado");
        }
        name = text(id, "nombre", name, MAX_NAME);
        description = text(id, "descripción", description, MAX_DESCRIPTION);
        if (icon == null || !ICON.matcher(icon).matches()) {
            throw new IllegalArgumentException("Icono no válido en la mini app " + id + ": " + icon);
        }
        Objects.requireNonNull(color, () -> "Falta el color de la mini app " + id);
        Objects.requireNonNull(category, () -> "Falta la categoría de la mini app " + id);
        keywords = keywords == null ? List.of() : List.copyOf(keywords);
        if (keywords.size() > MAX_KEYWORDS) {
            throw new IllegalArgumentException("La mini app " + id + " tiene más de " + MAX_KEYWORDS + " palabras clave");
        }
        for (String k : keywords) {
            if (k.isBlank() || k.length() > MAX_KEYWORD) {
                throw new IllegalArgumentException("Palabra clave no válida en la mini app " + id + ": «" + k + "»");
            }
        }
    }

    private static String text(String id, String field, String value, int max) {
        if (value == null || value.isBlank() || value.strip().length() > max) {
            throw new IllegalArgumentException(
                    "El campo " + field + " de la mini app " + id + " debe tener de 1 a " + max + " caracteres");
        }
        return value.strip();
    }
}
