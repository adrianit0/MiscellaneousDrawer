import { useCallback, useMemo, useRef, useState } from 'react';
import type { AppApi } from '../../platform';
import { errorMessage, type Board, type BoardIssues } from './types';

/**
 * JR-46: lo consultado de cada tablero, en la memoria de la mini app mientras está montada. Cada entrada recuerda la
 * configuración del tablero con la que se consultó: si cambia en el editor, ya no vale y se vuelve a consultar.
 */
export interface IssueCache {
  /** Lo último consultado del tablero, aunque sea de una configuración anterior (JR-44: se conserva mientras carga). */
  data(board: Board): BoardIssues | null;
  /** Si hay que consultarlo: nunca consultado, o con otra configuración, y sin consulta ni error para la actual. */
  needs(board: Board): boolean;
  loading(board: Board): boolean;
  error(board: Board): string | null;
  load(board: Board): void;
  /** Todo lo consultado, de todos los tableros. */
  all(): BoardIssues[];
}

/** La configuración que cuenta para la consulta: si cambia, lo guardado ya no vale. */
const snapshotOf = (board: Board) => JSON.stringify(board);

interface Entry {
  snapshot: string;
  data: BoardIssues;
}

export function useIssueCache(api: AppApi): IssueCache {
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  /** Por tablero, la configuración de la consulta en marcha. */
  const [pending, setPending] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, { snapshot: string; message: string }>>({});
  const request = useRef<Record<number, number>>({});
  const counter = useRef(0);

  const load = useCallback(
    (board: Board) => {
      const id = board.id;
      const snapshot = snapshotOf(board);
      const mine = ++counter.current;
      request.current[id] = mine;
      setPending((p) => ({ ...p, [id]: snapshot }));
      const settle = () => {
        setPending((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      };
      api
        .get<BoardIssues>(`/boards/${id}/issues`)
        .then((data) => {
          if (request.current[id] !== mine) return;
          setEntries((e) => ({ ...e, [id]: { snapshot, data } }));
          setErrors((e) => {
            const next = { ...e };
            delete next[id];
            return next;
          });
          settle();
        })
        .catch((e: unknown) => {
          if (request.current[id] !== mine) return;
          setErrors((all) => ({ ...all, [id]: { snapshot, message: errorMessage(e) } }));
          settle();
        });
    },
    [api],
  );

  return useMemo<IssueCache>(
    () => ({
      data: (board) => entries[board.id]?.data ?? null,
      needs: (board) => {
        const snapshot = snapshotOf(board);
        return (
          entries[board.id]?.snapshot !== snapshot &&
          pending[board.id] !== snapshot &&
          errors[board.id]?.snapshot !== snapshot
        );
      },
      loading: (board) => board.id in pending,
      error: (board) => errors[board.id]?.message ?? null,
      load,
      all: () => Object.values(entries).map((e) => e.data),
    }),
    [entries, pending, errors, load],
  );
}
