package dev.cajonsastre.catalog;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** D-04, P-14: tabla app_state, un documento JSON de estado de interfaz por mini app. */
public interface AppStateMapper {

    @Select("SELECT value FROM app_state WHERE app_id = #{appId}")
    String select(@Param("appId") String appId);

    @Insert("""
            INSERT INTO app_state (app_id, value, updated_at) VALUES (#{appId}, #{value}, #{updatedAt})
            ON CONFLICT (app_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at""")
    void upsert(@Param("appId") String appId, @Param("value") String value, @Param("updatedAt") String updatedAt);
}
