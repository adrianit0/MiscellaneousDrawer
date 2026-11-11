package dev.cajonsastre.apps.database;

import java.time.Duration;

/** Las esperas de los pasos (BD-23, BD-41), para que las pruebas no tengan que esperar. Se cancelan interrumpiendo el hilo. */
@FunctionalInterface
interface Sleeper {

    void sleep(Duration time) throws InterruptedException;

    Sleeper REAL = Thread::sleep;
}
