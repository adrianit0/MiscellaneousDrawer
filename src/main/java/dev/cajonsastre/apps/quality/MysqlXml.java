package dev.cajonsastre.apps.quality;

import javax.xml.XMLConstants;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * CD-24: lectura de la salida de {@code mysql --xml}. Cada {@code <resultset>} es un conjunto de resultados, cada
 * {@code <row>} una fila y cada {@code <field name="…">} un valor; {@code xsi:nil="true"} es NULL (ADR-0016). Se lee
 * con StAX, sin DTD ni entidades externas, y una salida cortada se lee hasta donde llega.
 */
final class MysqlXml {

    /** CD-24: filas que se guardan de un script. */
    static final int MAX_ROWS = 1000;
    private static final String XSI = "http://www.w3.org/2001/XMLSchema-instance";
    /** mysql escribe una declaración por conjunto de resultados en algunas versiones: se quitan todas. */
    private static final Pattern DECLARATION = Pattern.compile("<\\?xml[^>]*\\?>");

    /** Un conjunto de resultados. Un valor null es NULL. */
    record Table(List<String> columns, List<List<String>> rows) {
    }

    /**
     * @param rowCount filas leídas, también las que no se guardan
     * @param complete false si la salida estaba cortada: hay al menos rowCount filas
     */
    record Parsed(List<Table> tables, long rowCount, boolean complete) {
    }

    /** La salida no es el XML de mysql. */
    static final class Unreadable extends Exception {
        Unreadable(Throwable cause) {
            super("No se ha podido leer la salida de mysql", cause);
        }
    }

    private MysqlXml() {
    }

    /**
     * @param truncated la salida se cortó al llegar al límite (CD-24): un XML sin terminar no es un error
     */
    static Parsed parse(String output, boolean truncated) throws Unreadable {
        String body = DECLARATION.matcher(output).replaceAll("");
        if (body.isBlank()) {
            return new Parsed(List.of(), 0, !truncated);
        }
        List<Table> tables = new ArrayList<>();
        long count = 0;
        int stored = 0;
        XMLStreamReader xml = null;
        try {
            xml = factory().createXMLStreamReader(new StringReader("<output>" + body + (truncated ? "" : "</output>")));
            List<String> columns = null;
            List<List<String>> rows = null;
            List<String> names = null;
            List<String> values = null;
            while (xml.hasNext()) {
                int event = xml.next();
                if (event == XMLStreamConstants.START_ELEMENT) {
                    switch (xml.getLocalName()) {
                        case "resultset" -> {
                            columns = null;
                            rows = new ArrayList<>();
                        }
                        case "row" -> {
                            names = new ArrayList<>();
                            values = new ArrayList<>();
                        }
                        case "field" -> {
                            if (names == null) {
                                throw new XMLStreamException("Un campo fuera de una fila");
                            }
                            names.add(xml.getAttributeValue(null, "name"));
                            boolean nil = "true".equals(xml.getAttributeValue(XSI, "nil"));
                            String text = xml.getElementText();
                            values.add(nil ? null : text);
                        }
                        case "output" -> {
                        }
                        default -> throw new XMLStreamException("Elemento inesperado: " + xml.getLocalName());
                    }
                } else if (event == XMLStreamConstants.CHARACTERS && !xml.isWhiteSpace() && !xml.getText().isBlank()) {
                    // Texto fuera de un campo: no es el XML de mysql, sino otro formato.
                    throw new XMLStreamException("Texto fuera de un campo");
                } else if (event == XMLStreamConstants.END_ELEMENT) {
                    switch (xml.getLocalName()) {
                        case "row" -> {
                            if (rows == null) {
                                throw new XMLStreamException("Una fila fuera de un conjunto de resultados");
                            }
                            count++;
                            if (stored < MAX_ROWS) {
                                if (columns == null) {
                                    columns = List.copyOf(names);
                                    tables.add(new Table(columns, rows));
                                }
                                rows.add(Collections.unmodifiableList(values));
                                stored++;
                            }
                            names = null;
                            values = null;
                        }
                        case "resultset" -> rows = null;
                        default -> {
                        }
                    }
                }
            }
        } catch (XMLStreamException | RuntimeException e) {
            if (!truncated) {
                throw new Unreadable(e);
            }
        } finally {
            if (xml != null) {
                try {
                    xml.close();
                } catch (XMLStreamException e) {
                    // Nada que liberar.
                }
            }
        }
        return new Parsed(List.copyOf(tables), count, !truncated);
    }

    private static XMLInputFactory factory() {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        factory.setProperty(XMLInputFactory.IS_NAMESPACE_AWARE, true);
        try {
            factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        } catch (IllegalArgumentException e) {
            // La implementación no lo admite; ya no lee DTD.
        }
        return factory;
    }
}
