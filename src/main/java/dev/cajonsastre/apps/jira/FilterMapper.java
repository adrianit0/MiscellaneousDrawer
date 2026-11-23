package dev.cajonsastre.apps.jira;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** Los filtros guardados de «Tableros Jira» (JR-26, specs/requisitos/jira.md, «Datos»). */
public interface FilterMapper {

    /** Un filtro tal como se guarda: definition es el JSON de sus criterios. */
    record Row(long id, String name, String definition) {
    }

    @Select("SELECT id, name, definition FROM saved_filter ORDER BY id")
    List<Row> list();

    @Select("SELECT id, name, definition FROM saved_filter WHERE id = #{id}")
    Row find(@Param("id") long id);

    @Select("SELECT count(*) FROM saved_filter")
    int count();

    @Insert("INSERT INTO saved_filter (name, definition, created_at, updated_at) VALUES (#{name}, #{definition}, #{at}, #{at})")
    void insert(@Param("name") String name, @Param("definition") String definition, @Param("at") String at);

    @Select("SELECT last_insert_rowid()")
    long lastId();

    @Update("UPDATE saved_filter SET name = #{name}, definition = #{definition}, updated_at = #{at} WHERE id = #{id}")
    int update(@Param("id") long id, @Param("name") String name, @Param("definition") String definition,
               @Param("at") String at);

    @Delete("DELETE FROM saved_filter WHERE id = #{id}")
    int delete(@Param("id") long id);
}
