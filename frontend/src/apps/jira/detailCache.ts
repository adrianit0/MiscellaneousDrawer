import { useCallback, useMemo, useRef, useState } from 'react';
import type { AppApi } from '../../platform';
import { errorMessage, type IssueDetail } from './types';

/**
 * JR-75: lo consultado del detalle de cada ticket, en la memoria de la mini app mientras está montada, nunca en disco.
 */
export interface DetailCache {
  /** Lo último consultado del ticket; se conserva mientras se vuelve a consultar. */
  data(key: string): IssueDetail | null;
  /**
   * Si hay que consultarlo: nunca consultado y sin consulta ni error; o el tablero lo muestra con otra fecha de
   * actualización (`boardUpdated`) que no se ha consultado todavía.
   */
  needs(key: string, boardUpdated: string | null): boolean;
  loading(key: string): boolean;
  error(key: string): string | null;
  /** Consulta el ticket; `boardUpdated` es la fecha con la que lo muestra el tablero, si lo muestra. */
  load(key: string, boardUpdated?: string | null): void;
}

export function useDetailCache(api: AppApi): DetailCache {
  const [entries, setEntries] = useState<Record<string, IssueDetail>>({});
  const [pending, setPending] = useState<Record<string, true>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Por ticket, la fecha del tablero con la que se pidió por última vez: así no se repite la consulta. */
  const [askedFor, setAskedFor] = useState<Record<string, string | null>>({});
  const request = useRef<Record<string, number>>({});
  const counter = useRef(0);

  const load = useCallback(
    (key: string, boardUpdated: string | null = null) => {
      const mine = ++counter.current;
      request.current[key] = mine;
      setPending((p) => ({ ...p, [key]: true }));
      setAskedFor((a) => ({ ...a, [key]: boardUpdated }));
      const settle = () =>
        setPending((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
      api
        .get<IssueDetail>(`/issues/${encodeURIComponent(key)}`)
        .then((data) => {
          if (request.current[key] !== mine) return;
          setEntries((e) => ({ ...e, [key]: data }));
          setErrors((e) => {
            const next = { ...e };
            delete next[key];
            return next;
          });
          settle();
        })
        .catch((e: unknown) => {
          if (request.current[key] !== mine) return;
          setErrors((all) => ({ ...all, [key]: errorMessage(e) }));
          settle();
        });
    },
    [api],
  );

  return useMemo<DetailCache>(
    () => ({
      data: (key) => entries[key] ?? null,
      needs: (key, boardUpdated) => {
        if (pending[key] || key in errors) return false;
        const data = entries[key];
        if (!data) return true;
        return boardUpdated !== null && data.updated !== boardUpdated && askedFor[key] !== boardUpdated;
      },
      loading: (key) => key in pending,
      error: (key) => errors[key] ?? null,
      load,
    }),
    [entries, pending, errors, askedFor, load],
  );
}
