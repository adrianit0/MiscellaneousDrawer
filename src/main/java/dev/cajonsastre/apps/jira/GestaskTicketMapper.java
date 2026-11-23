package dev.cajonsastre.apps.jira;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** Los tickets de las tareas de «Gestask» (JR-50, specs/requisitos/jira.md, «Datos»). */
public interface GestaskTicketMapper {

    @Select("SELECT ticket FROM gestask_ticket ORDER BY ticket")
    List<String> list();

    @Delete("DELETE FROM gestask_ticket")
    void clear();

    @Insert("INSERT INTO gestask_ticket (ticket) VALUES (#{ticket})")
    void insert(@Param("ticket") String ticket);
}
