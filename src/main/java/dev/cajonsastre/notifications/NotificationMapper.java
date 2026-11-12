package dev.cajonsastre.notifications;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** D-04, P-22: tabla notification de la base del shell. */
public interface NotificationMapper {

    @Insert("""
            INSERT INTO notification (app_id, kind, title, text, path, created_at)
            VALUES (#{appId}, #{kind}, #{title}, #{text,jdbcType=VARCHAR}, #{path,jdbcType=VARCHAR}, #{createdAt})""")
    void insert(@Param("appId") String appId, @Param("kind") String kind, @Param("title") String title,
                @Param("text") String text, @Param("path") String path, @Param("createdAt") String createdAt);

    /** El identificador de la última fila insertada por esta conexión. */
    @Select("SELECT last_insert_rowid()")
    long lastId();

    /** De la más reciente a la más antigua. */
    @Select("""
            SELECT id, app_id AS appId, kind, title, text, path, created_at AS createdAt
            FROM notification ORDER BY id DESC""")
    List<NotificationCenter.Notification> selectAll();

    /** Borra todas menos las keep más recientes. */
    @Delete("DELETE FROM notification WHERE id <= (SELECT id FROM notification ORDER BY id DESC LIMIT 1 OFFSET #{keep})")
    void prune(@Param("keep") int keep);

    @Delete("DELETE FROM notification")
    void deleteAll();
}
