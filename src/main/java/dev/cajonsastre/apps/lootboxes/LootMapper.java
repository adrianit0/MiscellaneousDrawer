package dev.cajonsastre.apps.lootboxes;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** La base de «Lootboxes» (specs/requisitos/lootboxes.md, «Datos»). */
public interface LootMapper {

    /** Un cofre; openedAt es null si no se ha abierto. */
    record Chest(String id, String earnedOn, String openedAt) {
    }

    // LB-01

    @Select("SELECT value FROM meta WHERE key = 'started_on'")
    String startedOn();

    @Insert("INSERT OR IGNORE INTO meta (key, value) VALUES ('started_on', #{day})")
    void start(@Param("day") String day);

    // LB-02

    @Select("SELECT chests FROM day_points WHERE day = #{day}")
    Integer chests(@Param("day") String day);

    @Insert("""
            INSERT INTO day_points (day, points, chests) VALUES (#{day}, #{points}, #{chests})
            ON CONFLICT (day) DO UPDATE SET points = max(points, excluded.points), chests = max(chests, excluded.chests)""")
    void saveDay(@Param("day") String day, @Param("points") double points, @Param("chests") int chests);

    @Insert("INSERT INTO chest (id, earned_on, seq) VALUES (#{id}, #{day}, #{seq})")
    void insertChest(@Param("id") String id, @Param("day") String day, @Param("seq") int seq);

    // LB-05, LB-10, LB-11

    /** Los desbloqueados sin abrir: los conseguidos hasta lastDay, del más antiguo al más nuevo. */
    @Select("""
            SELECT id, earned_on AS earnedOn, opened_at AS openedAt FROM chest
            WHERE opened_at IS NULL AND earned_on <= #{lastDay} ORDER BY earned_on, seq""")
    List<Chest> unlocked(@Param("lastDay") String lastDay);

    @Select("SELECT id, earned_on AS earnedOn, opened_at AS openedAt FROM chest WHERE id = #{id}")
    Chest find(@Param("id") String id);

    @Update("UPDATE chest SET opened_at = #{at} WHERE id = #{id} AND opened_at IS NULL")
    int markOpened(@Param("id") String id, @Param("at") String at);

    @Insert("INSERT INTO reward (chest_id, position, item_id) VALUES (#{chest}, #{position}, #{item})")
    void insertReward(@Param("chest") String chest, @Param("position") int position, @Param("item") String item);

    // LB-14, LB-15

    @Select("SELECT id FROM chest WHERE opened_at IS NOT NULL AND delivered = 0 ORDER BY opened_at, earned_on, seq")
    List<String> undelivered();

    @Select("SELECT item_id FROM reward WHERE chest_id = #{chest} ORDER BY position")
    List<String> rewards(@Param("chest") String chest);

    @Update("UPDATE chest SET delivered = 1 WHERE id = #{id}")
    void markDelivered(@Param("id") String id);
}
