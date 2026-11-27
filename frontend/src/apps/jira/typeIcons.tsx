import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import type { AppApi } from '../../platform';
import styles from './jira.module.css';
import { typeKind, type IssueType, type TypeKind } from './types';

/**
 * JR-29, JR-38: los iconos de los tipos que da Jira, como `data:`, en la memoria de la mini app mientras está montada.
 * Cada tipo se pide una vez; si falla, queda en null y se ve el icono propio.
 */
export interface TypeIcons {
  /** El icono de Jira; undefined mientras no ha llegado, null si no lo hay. */
  icon(id: string): string | null | undefined;
  /** Pide los que nunca se pidieron. */
  request(ids: Iterable<string>): void;
}

export function useTypeIcons(api: AppApi): TypeIcons {
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const asked = useRef(new Set<string>());

  const request = useCallback(
    (ids: Iterable<string>) => {
      for (const id of ids) {
        if (asked.current.has(id)) continue;
        asked.current.add(id);
        api
          .get<{ icon: string | null }>(`/issue-types/${encodeURIComponent(id)}/icon`)
          // Solo una imagen incrustada: cualquier otra cosa se descarta.
          .then((r) => (typeof r.icon === 'string' && r.icon.startsWith('data:image/') ? r.icon : null))
          .catch(() => null)
          .then((icon) => setIcons((all) => ({ ...all, [id]: icon })));
      }
    },
    [api],
  );

  return useMemo(() => ({ icon: (id: string) => (id in icons ? icons[id] : undefined), request }), [icons, request]);
}

/** JR-38: los iconos propios, de 16 px: el glifo en el texto oscuro del tema sobre el color del tipo. */
const OWN: Record<TypeKind, { color: string; glyph: ReactElement }> = {
  epic: {
    color: 'var(--violet)',
    glyph: <path d="M9 2.5 4.5 9H8l-1 4.5L11.5 7H8z" fill="var(--accent-text)" />,
  },
  subtask: {
    color: 'var(--blue)',
    glyph: (
      <g fill="none" stroke="var(--accent-text)" strokeWidth="1.5">
        <rect x="3.5" y="3.5" width="5" height="5" rx="1" />
        <rect x="7.5" y="7.5" width="5" height="5" rx="1" fill="var(--accent-text)" />
      </g>
    ),
  },
  bug: {
    color: 'var(--error)',
    glyph: <circle cx="8" cy="8" r="3.5" fill="var(--accent-text)" />,
  },
  story: {
    color: 'var(--green)',
    glyph: <path d="M5 3.5h6v9L8 10l-3 2.5z" fill="var(--accent-text)" />,
  },
  task: {
    color: 'var(--blue)',
    glyph: <path d="m4.5 8.2 2.3 2.3 4.7-5" fill="none" stroke="var(--accent-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
};

/** JR-38: el icono del tipo con su nombre como texto alternativo y título: el de Jira o, si no llega, el propio. */
export function TypeIcon({ type, src }: { type: IssueType; src: string | null | undefined }) {
  if (src) {
    return <img className={styles.typeIcon} src={src} alt={type.name} title={type.name} width={16} height={16} />;
  }
  const kind = typeKind(type);
  const own = OWN[kind];
  return (
    <svg className={styles.typeIcon} viewBox="0 0 16 16" width={16} height={16} role="img" aria-label={type.name} data-kind={kind}>
      <title>{type.name}</title>
      <rect width="16" height="16" rx="3" fill={own.color} />
      {own.glyph}
    </svg>
  );
}
