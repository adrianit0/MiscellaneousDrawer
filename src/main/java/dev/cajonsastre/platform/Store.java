package dev.cajonsastre.platform;

import org.apache.ibatis.logging.nologging.NoLoggingImpl;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.managed.ManagedTransactionFactory;
import org.apache.ibatis.type.ByteArrayTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;

/**
 * Una base SQLite: una conexión de escritura serializada y varias de lectura en paralelo (D-07), con los PRAGMA de
 * D-01, migraciones con copia previa (D-02) y mappers de MyBatis con anotaciones (D-06). La usan el shell y cada
 * mini app con datos (P-08); a una mini app se la abre la plataforma.
 */
public final class Store implements AutoCloseable {

    private static final int READERS = 3;

    private final SqlSessionFactory factory;
    private final Connection writer;
    private final ReentrantLock writeLock = new ReentrantLock();
    private final BlockingQueue<Connection> readers = new ArrayBlockingQueue<>(READERS);

    private Store(SqlSessionFactory factory, Connection writer) {
        this.factory = factory;
        this.writer = writer;
    }

    /**
     * Abre la base y aplica las migraciones pendientes.
     *
     * @param name      nombre de la base en las copias previas a migrar: el identificador de la mini app o
     *                  «cajonsastre» para el shell
     * @param backupDir carpeta de las copias previas a migrar
     */
    public static Store open(Path dbFile, String name, List<String> migrations, List<Class<?>> mappers, Path backupDir) {
        Connection writer = null;
        List<Connection> opened = new ArrayList<>();
        try {
            Files.createDirectories(dbFile.toAbsolutePath().getParent());
            String url = "jdbc:sqlite:" + dbFile.toAbsolutePath();

            writer = config(false).createConnection(url);
            opened.add(writer);
            new Migrator(migrations, backupDir, name).migrate(writer);
            writer.setAutoCommit(false);

            Store store = new Store(sessionFactory(url, name, mappers), writer);
            for (int i = 0; i < READERS; i++) {
                Connection reader = config(true).createConnection(url);
                opened.add(reader);
                store.readers.add(reader);
            }
            return store;
        } catch (IOException e) {
            opened.forEach(Store::closeQuietly);
            throw new UncheckedIOException(e);
        } catch (SQLException e) {
            opened.forEach(Store::closeQuietly);
            throw new IllegalStateException("No se puede abrir la base de datos " + dbFile.getFileName() + ": " + e.getMessage(), e);
        } catch (RuntimeException e) {
            opened.forEach(Store::closeQuietly);
            throw e;
        }
    }

    /** Ejecuta una unidad de trabajo de escritura en una transacción, una cada vez. */
    public <T> T write(Function<SqlSession, T> work) {
        writeLock.lock();
        try (SqlSession session = factory.openSession(writer)) {
            try {
                T result = work.apply(session);
                writer.commit();
                return result;
            } catch (RuntimeException | Error e) {
                rollbackQuietly(e);
                throw e;
            } catch (SQLException e) {
                rollbackQuietly(e);
                throw new IllegalStateException(e);
            }
        } finally {
            writeLock.unlock();
        }
    }

    /** Ejecuta una lectura en una de las conexiones de solo lectura. */
    public <T> T read(Function<SqlSession, T> work) {
        Connection c;
        try {
            c = readers.take();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
        try (SqlSession session = factory.openSession(c)) {
            return work.apply(session);
        } finally {
            readers.add(c);
        }
    }

    @Override
    public void close() {
        writeLock.lock();
        try {
            closeQuietly(writer);
            readers.forEach(Store::closeQuietly);
        } finally {
            writeLock.unlock();
        }
    }

    private void rollbackQuietly(Throwable cause) {
        try {
            writer.rollback();
        } catch (SQLException e) {
            cause.addSuppressed(e);
        }
    }

    private static void closeQuietly(Connection c) {
        try {
            c.close();
        } catch (SQLException ignored) {
            // Cierre al apagar o tras un fallo: no hay nada más que hacer.
        }
    }

    /** D-01: estos PRAGMA se aplican al abrir cada conexión. */
    private static SQLiteConfig config(boolean readOnly) {
        SQLiteConfig cfg = new SQLiteConfig();
        cfg.enforceForeignKeys(true);
        cfg.setJournalMode(SQLiteConfig.JournalMode.WAL);
        cfg.setSynchronous(SQLiteConfig.SynchronousMode.NORMAL);
        cfg.setBusyTimeout(5000);
        cfg.setReadOnly(readOnly);
        return cfg;
    }

    private static SqlSessionFactory sessionFactory(String url, String name, List<Class<?>> mappers) {
        // Las conexiones las gestiona Store; MyBatis no debe cerrarlas.
        ManagedTransactionFactory tx = new ManagedTransactionFactory();
        Properties props = new Properties();
        props.setProperty("closeConnection", "false");
        tx.setProperties(props);
        SQLiteDataSource unused = new SQLiteDataSource();
        unused.setUrl(url);

        Configuration cfg = new Configuration(new Environment(name, tx, unused));
        cfg.setMapUnderscoreToCamelCase(true);
        // S-21, D-06: MyBatis registraría en depuración los parámetros de cada consulta, datos incluidos.
        cfg.setLogImpl(NoLoggingImpl.class);
        cfg.setArgNameBasedConstructorAutoMapping(true);
        // sqlite-jdbc no implementa getBlob(): los BLOB se leen como byte[] con getBytes().
        cfg.getTypeHandlerRegistry().register(byte[].class, JdbcType.BLOB, new ByteArrayTypeHandler());
        mappers.forEach(cfg::addMapper);
        return new SqlSessionFactoryBuilder().build(cfg);
    }
}
