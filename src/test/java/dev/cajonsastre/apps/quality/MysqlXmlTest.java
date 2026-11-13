package dev.cajonsastre.apps.quality;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** CD-23, CD-24: lectura de la salida de mysql --xml. Datos inventados (S-31). */
class MysqlXmlTest {

    @Test
    void cd24_reads_columns_rows_and_null_distinct_from_the_text_null() throws Exception {
        String xml = """
                <?xml version="1.0"?>

                <resultset statement="SELECT id, nombre, nota FROM cliente
                " xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                  <row>
                	<field name="id">1</field>
                	<field name="nombre">Ana &amp; Luis &lt;dos&gt;</field>
                	<field name="nota">NULL</field>
                  </row>
                  <row>
                	<field name="id">2</field>
                	<field name="nombre" xsi:nil="true" />
                	<field name="nota">línea 1
                línea 2</field>
                  </row>
                </resultset>
                """;
        MysqlXml.Parsed parsed = MysqlXml.parse(xml, false);
        assertThat(parsed.rowCount()).isEqualTo(2);
        assertThat(parsed.complete()).isTrue();
        assertThat(parsed.tables()).hasSize(1);
        MysqlXml.Table table = parsed.tables().get(0);
        assertThat(table.columns()).containsExactly("id", "nombre", "nota");
        assertThat(table.rows().get(0)).containsExactly("1", "Ana & Luis <dos>", "NULL");
        assertThat(table.rows().get(1)).containsExactly("2", null, "línea 1\nlínea 2");
    }

    @Test
    void cd24_each_result_set_is_a_table_with_its_columns_and_empty_ones_are_left_out() throws Exception {
        String xml = """
                <?xml version="1.0"?>

                <resultset statement="SELECT 1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                </resultset>
                <?xml version="1.0"?>

                <resultset statement="SELECT a" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                  <row>
                	<field name="a">x</field>
                  </row>
                </resultset>

                <resultset statement="SELECT b, c" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                  <row>
                	<field name="b">y</field>
                	<field name="c">z</field>
                  </row>
                </resultset>
                """;
        MysqlXml.Parsed parsed = MysqlXml.parse(xml, false);
        assertThat(parsed.rowCount()).isEqualTo(2);
        assertThat(parsed.tables()).extracting(MysqlXml.Table::columns).containsExactly(List.of("a"), List.of("b", "c"));
    }

    @Test
    void cd23_no_output_or_only_empty_result_sets_have_no_rows() throws Exception {
        assertThat(MysqlXml.parse("", false).rowCount()).isZero();
        assertThat(MysqlXml.parse(FakeDocker.xml(0), false)).satisfies(p -> {
            assertThat(p.rowCount()).isZero();
            assertThat(p.tables()).isEmpty();
            assertThat(p.complete()).isTrue();
        });
    }

    @Test
    void cd24_keeps_at_most_1000_rows_but_counts_them_all() throws Exception {
        MysqlXml.Parsed parsed = MysqlXml.parse(FakeDocker.xml(1500), false);
        assertThat(parsed.rowCount()).isEqualTo(1500);
        assertThat(parsed.tables().get(0).rows()).hasSize(MysqlXml.MAX_ROWS);
        assertThat(parsed.complete()).isTrue();
    }

    @Test
    void cd24_a_cut_output_is_read_up_to_where_it_reaches() throws Exception {
        String xml = FakeDocker.xml(10);
        String cut = xml.substring(0, xml.indexOf("<field name=\"id\">6</field>"));
        MysqlXml.Parsed parsed = MysqlXml.parse(cut, true);
        assertThat(parsed.rowCount()).isEqualTo(5);
        assertThat(parsed.complete()).isFalse();
    }

    @Test
    void cd23_an_output_that_is_not_the_xml_of_mysql_cannot_be_read() {
        assertThatThrownBy(() -> MysqlXml.parse("id\tnombre\n1\tAna\n", false)).isInstanceOf(MysqlXml.Unreadable.class);
        assertThatThrownBy(() -> MysqlXml.parse("<resultset><row><field name=\"a\">1", false))
                .isInstanceOf(MysqlXml.Unreadable.class);
    }

    @Test
    void cd24_does_not_read_document_types_or_external_entities() {
        String xml = "<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><resultset><row><field name=\"a\">&e;</field></row></resultset>";
        assertThatThrownBy(() -> MysqlXml.parse(xml, false)).isInstanceOf(MysqlXml.Unreadable.class);
    }
}
