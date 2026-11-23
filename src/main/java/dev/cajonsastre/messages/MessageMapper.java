package dev.cajonsastre.messages;

import dev.cajonsastre.platform.Message;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** D-04, P-29: tabla app_message de la base del shell. */
public interface MessageMapper {

    @Insert("""
            INSERT INTO app_message (sender, recipient, type, content, sent_at)
            VALUES (#{sender}, #{recipient}, #{type}, #{content}, #{sentAt})""")
    void insert(@Param("sender") String sender, @Param("recipient") String recipient, @Param("type") String type,
                @Param("content") String content, @Param("sentAt") String sentAt);

    /** P-30: del más antiguo al más nuevo. */
    @Select("""
            SELECT id, sender, type, content, sent_at AS sentAt
            FROM app_message WHERE recipient = #{recipient} ORDER BY id LIMIT #{limit}""")
    List<Message> pending(@Param("recipient") String recipient, @Param("limit") int limit);

    /** P-30: solo si es de esa destinataria. */
    @Delete("DELETE FROM app_message WHERE id = #{id} AND recipient = #{recipient}")
    void delete(@Param("recipient") String recipient, @Param("id") long id);
}
