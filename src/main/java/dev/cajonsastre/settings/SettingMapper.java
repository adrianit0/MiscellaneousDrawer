package dev.cajonsastre.settings;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** D-04: tabla setting, con el estado de interfaz del shell en JSON. */
public interface SettingMapper {

    record SettingRow(String key, String value) {
    }

    @Select("SELECT key, value FROM setting ORDER BY key")
    List<SettingRow> selectAll();

    @Insert("""
            INSERT INTO setting (key, value) VALUES (#{key}, #{value})
            ON CONFLICT (key) DO UPDATE SET value = excluded.value""")
    void upsert(@Param("key") String key, @Param("value") String value);
}
