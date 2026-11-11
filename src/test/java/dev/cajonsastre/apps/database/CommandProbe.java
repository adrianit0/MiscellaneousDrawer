package dev.cajonsastre.apps.database;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/** Un programa de verdad para probar ProcessRunner en cualquier sistema: se ejecuta con el java de las pruebas. */
public final class CommandProbe {

    private CommandProbe() {
    }

    public static void main(String[] args) throws Exception {
        switch (args[0]) {
            case "echo" -> {
                BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
                String line;
                int count = 0;
                while ((line = in.readLine()) != null) {
                    System.out.println("> " + line);
                    count++;
                }
                System.err.println(count + " líneas");
            }
            case "env" -> System.out.println(args[1] + "=" + System.getenv(args[1]));
            case "progress" -> {
                System.out.print("10 %\r");
                System.out.print("50 %\r");
                System.out.print("hecho\r\n");
                System.out.print("última\n");
                System.out.flush();
            }
            case "sleep" -> {
                System.out.println("dormido");
                System.out.flush();
                Thread.sleep(120_000);
            }
            case "exit" -> System.exit(Integer.parseInt(args[1]));
            default -> throw new IllegalArgumentException(args[0]);
        }
    }
}
