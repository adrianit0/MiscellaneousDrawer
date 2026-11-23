package dev.cajonsastre.apps.inventory;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** La base de «Inventario» (specs/requisitos/inventory.md, «Datos»). */
public interface ItemMapper {

    /** Un objeto con su cantidad, como sale por la API. */
    record Item(String id, String name, String rarity, int count, String firstAt, String lastAt) {
    }

    @Select("SELECT id, name, rarity, count, first_at AS firstAt, last_at AS lastAt FROM item")
    List<Item> all();

    /** IN-02 */
    @Select("SELECT count(*) FROM received_chest WHERE chest_id = #{chest}")
    int received(@Param("chest") String chest);

    @Insert("INSERT INTO received_chest (chest_id, received_at) VALUES (#{chest}, #{at})")
    void receive(@Param("chest") String chest, @Param("at") String at);

    /** IN-01, IN-03: suma uno y toma el nombre y la rareza del último mensaje. */
    @Insert("""
            INSERT INTO item (id, name, rarity, count, first_at, last_at) VALUES (#{id}, #{name}, #{rarity}, 1, #{at}, #{at})
            ON CONFLICT (id) DO UPDATE SET name = excluded.name, rarity = excluded.rarity, count = count + 1,
              last_at = excluded.last_at""")
    void add(@Param("id") String id, @Param("name") String name, @Param("rarity") String rarity, @Param("at") String at);
}
