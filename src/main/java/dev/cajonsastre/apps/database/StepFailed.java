package dev.cajonsastre.apps.database;

/** Un paso que no puede seguir (BD-12). El mensaje va en español y es apto para mostrarse. */
final class StepFailed extends Exception {

    StepFailed(String message) {
        super(message);
    }
}
