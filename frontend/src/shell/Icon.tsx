/** P-02, P-19: un icono es un fichero src/shell/icons/<nombre>.svg; añadir uno es añadir el fichero. */
const files = import.meta.glob<string>('./icons/*.svg', { query: '?raw', import: 'default', eager: true });

export const ICONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [/\/([^/]+)\.svg$/.exec(path)![1], svg]),
);

/** Decorativo: el nombre accesible lo pone quien lo usa. Un nombre desconocido muestra el icono genérico. */
export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={className ? `icon ${className}` : 'icon'}
      aria-hidden="true"
      // Ficheros propios del repositorio, sin datos del usuario.
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? ICONS.app }}
    />
  );
}
