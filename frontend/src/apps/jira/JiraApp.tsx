import { useCallback, useEffect, useState } from 'react';
import { useMiniApp } from '../../platform';
import { BoardView } from './BoardView';
import { Confirm } from './Confirm';
import { Connection } from './Connection';
import { BoardsSection } from './Editor';
import styles from './jira.module.css';
import { errorMessage, type Board, type ConfigView } from './types';

/** JR-30 */
const SECTIONS = [
  { path: '', label: 'Tableros' },
  { path: '/boards', label: 'Configurar tableros' },
  { path: '/connection', label: 'Conexión' },
];

/** La sección de una subruta: «/boards/3» es «Configurar tableros». */
function sectionOf(path: string) {
  if (path === '/boards' || path.startsWith('/boards/')) return SECTIONS[1];
  return SECTIONS.find((s) => s.path === path) ?? SECTIONS[0];
}

/** «Tableros Jira» (JR-30 a JR-44): tableros propios sobre varios proyectos de Jira Cloud. Solo lee de Jira. */
export function JiraApp() {
  const { api, path, navigate, setSubtitle } = useMiniApp();
  const section = sectionOf(path);
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** JR-36: si el editor tiene cambios sin guardar, y adónde se quiere ir mientras se pregunta. */
  const [editorDirty, setEditorDirty] = useState(false);
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  /** La última subruta de «Configurar tableros», para que el editor siga montado con otra sección a la vista. */
  const [boardsPath, setBoardsPath] = useState('/boards');
  useEffect(() => {
    if (section.path === '/boards') setBoardsPath(path);
  }, [section.path, path]);

  useEffect(() => {
    setSubtitle(section.label);
    return () => setSubtitle(null);
  }, [section.label, setSubtitle]);

  const loadBoards = useCallback(
    () =>
      api
        .get<{ boards: Board[] }>('/boards')
        .then((r) => {
          setBoards(r.boards);
          return r.boards;
        }),
    [api],
  );

  // JR-30: sin conexión, abre en «Conexión»; sin tableros, en «Configurar tableros».
  useEffect(() => {
    Promise.all([api.get<ConfigView>('/config'), loadBoards()])
      .then(([received, list]) => {
        setConfig(received);
        setError(null);
        if (received.missing.length > 0) navigate('/connection', { replace: true });
        else if (list.length === 0 && path === '') navigate('/boards', { replace: true });
      })
      .catch((e: unknown) => setError(errorMessage(e)));
    // Solo al abrir: navigate y path no son dependencias.
  }, [api, loadBoards]);

  // JR-36: si la ruta cambia por otro camino (Atrás y Adelante), ya no hay nada que preguntar.
  useEffect(() => setLeavingTo(null), [path]);

  /** JR-36: salir del editor con cambios sin guardar pregunta antes. */
  const go = useCallback(
    (target: string) => {
      if (editorDirty && target !== path) setLeavingTo(target);
      else navigate(target);
    },
    [editorDirty, navigate, path],
  );

  const configured = config !== null && config.missing.length === 0;

  return (
    <div className={styles.app}>
      <nav className={styles.tabs} aria-label="Secciones">
        {SECTIONS.map((s) => (
          <button key={s.path} type="button" aria-current={s === section ? 'page' : undefined} onClick={() => go(s.path)}>
            {s.label}
          </button>
        ))}
      </nav>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {(!config || !boards) && !error && <p className={styles.muted}>Cargando…</p>}

      {config && section.path === '/connection' && <Connection config={config} onSaved={setConfig} />}

      {config && boards && section.path === '' && !configured && (
        <div className={styles.panel}>
          <p>Falta configurar la conexión con Jira.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => navigate('/connection')}>
              Ir a Conexión
            </button>
          </div>
        </div>
      )}
      {config && boards && section.path === '' && configured && <BoardView boards={boards} siteUrl={config.siteUrl ?? ''} />}

      {/* JR-36: el editor sigue montado al cambiar de sección, para no perder lo escrito. */}
      {config && boards && (
        <div hidden={section.path !== '/boards'}>
          {!configured && section.path === '/boards' && (
            <p className={styles.notice}>Sin la conexión con Jira no se pueden buscar proyectos ni estados.</p>
          )}
          <BoardsSection
            boards={boards}
            path={section.path === '/boards' ? path : boardsPath}
            leave={go}
            onDirtyChange={setEditorDirty}
            onChanged={() => {
              loadBoards().catch((e: unknown) => setError(errorMessage(e)));
            }}
          />
        </div>
      )}

      {leavingTo !== null && (
        <Confirm
          title="Cambios sin guardar"
          action="Salir sin guardar"
          cancel="Seguir editando"
          onAnswer={(yes) => {
            const target = leavingTo;
            setLeavingTo(null);
            if (yes) {
              // Lo no guardado se descarta: el editor se desmonta.
              setEditorDirty(false);
              setBoardsPath('/boards');
              navigate(target);
            }
          }}
        >
          <p>El tablero tiene cambios sin guardar. Si sales, se perderán.</p>
        </Confirm>
      )}
    </div>
  );
}
