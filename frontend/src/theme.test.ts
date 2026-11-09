import css from './theme.css?raw';
import indexHtml from '../index.html?raw';
import favicon from '../public/cajonsastre-icon.svg?raw';

function variable(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match) throw new Error(`Falta --${name}`);
  return match[1].trim();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const APP_COLORS = ['blue', 'green', 'violet', 'orange', 'cyan', 'gold'];
const BACKGROUNDS = ['bg', 'surface', 'surface-raised'];

describe('U-01 tema oscuro', () => {
  it('define las variables de la especificación', () => {
    for (const name of ['bg', 'surface', 'surface-raised', 'border', 'text', 'text-muted', 'accent', 'error', 'warning', ...APP_COLORS]) {
      expect(variable(name)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  const pairs: [string, string][] = [
    ...['text', 'text-muted', 'error', ...APP_COLORS].flatMap((fg) => BACKGROUNDS.map((bg): [string, string] => [fg, bg])),
    ['text', 'selection'],
    ['warning', 'bg'],
    ['warning', 'surface'],
    ['accent-text', 'accent'],
    ['accent-text', 'warning'],
  ];

  it.each(pairs)('--%s sobre --%s tiene contraste AA (4,5:1)', (fg, bg) => {
    expect(contrast(variable(fg), variable(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('cada color de mini app tiene su regla data-color', () => {
    for (const color of APP_COLORS) {
      expect(css).toContain(`[data-color='${color}'] {\n  color: var(--${color});`);
    }
  });
});

describe('U-08 logotipo', () => {
  it('es el favicon de la página, con placa del color de la barra', () => {
    expect(indexHtml).toContain('<link rel="icon" type="image/svg+xml" href="/cajonsastre-icon.svg" />');
    expect(favicon).toContain(`fill="${variable('surface')}"`);
  });

  it('S-14: el SVG no usa atributos style, que la CSP bloquearía', () => {
    expect(favicon).not.toMatch(/style=/);
  });
});

describe('S-12, C-08: página inicial', () => {
  it('lleva el marcador del token propio y el título de la aplicación', () => {
    expect(indexHtml).toContain('<meta name="cajonsastre-token" content="__CAJONSASTRE_TOKEN__" />');
    expect(indexHtml).toContain('<title>Cajón de sastre</title>');
    expect(indexHtml).not.toMatch(/litedd/i);
  });
});
