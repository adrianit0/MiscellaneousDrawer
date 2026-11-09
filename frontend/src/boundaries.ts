/**
 * P-17, P-18: reglas de fronteras de las mini apps, comprobadas en boundaries.test.ts sobre el código de src/apps/.
 * Las rutas son relativas a src/, como «apps/tasks/TasksApp.tsx».
 */

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

/** Resuelve una ruta relativa respecto a la carpeta de un fichero, en forma posix y relativa a src/. */
function resolve(fromFile: string, specifier: string): string {
  const parts = fromFile.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

/** P-18: importaciones de un fichero de una mini app que no son de la plataforma, de su carpeta ni de bibliotecas. */
export function importViolations(file: string, source: string): string[] {
  const appId = /^apps\/([^/]+)\//.exec(file)?.[1];
  if (!appId) return [];
  const out: string[] = [];
  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[1];
    if (specifier.startsWith('/') || /^(src|@\/|~\/)/.test(specifier)) {
      out.push(`${file}: importa ${specifier}`);
      continue;
    }
    if (!specifier.startsWith('.')) continue; // Biblioteca de node_modules.
    const target = resolve(file, specifier);
    const own = target === `apps/${appId}` || target.startsWith(`apps/${appId}/`);
    const platform = target === 'platform' || target.startsWith('platform/');
    if (!own && !platform) out.push(`${file}: importa ${specifier}`);
  }
  return out;
}

/** P-17: hojas de estilo de las mini apps que no son CSS Modules. */
export function cssViolations(files: string[]): string[] {
  return files.filter((f) => /^apps\/[^/]+\/.+\.css$/.test(f) && !f.endsWith('.module.css')).map((f) => `${f}: no es un CSS Module`);
}
