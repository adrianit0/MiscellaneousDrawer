import { useMemo, useState } from 'react';
import { useMiniApp } from '../../platform';
import { Confirm, Dialog } from './Dialog';
import styles from './gestask.module.css';
import { canResolve, defaultImputedDate, effortHours, formatHours, jiraLine, jiraTime, minutesPerPoint, sortCompletion, stepLabel, todayIso } from './logic';
import { activation, TaskSummary, TicketLink, TypeBadge, Value } from './parts';
import type { Parameter, Task } from './types';

type Payload = Record<string, unknown>;

interface Props {
  tasks: Task[];
  parameters: Parameter[];
  saving: boolean;
  onOpen: (task: Task) => void;
  /** GT-73 a GT-79: una llamada a tasks-completion-resolve por cuerpo, en orden. Devuelve si todas salieron bien. */
  onResolve: (payloads: Payload[], done: string) => Promise<boolean>;
}

/** GT-71: los pasos de cierre, con el estado PR que espera cada uno. */
const STEPS = [
  ['Need PR', 'Informar PR'],
  ['Need to Impute', 'Imputar horas'],
  ['Imputed', 'Cerrar'],
] as const;

interface Pending {
  title: string;
  text: string;
  action: string;
  payloads: Payload[];
  done: string;
  after?: () => void;
}

/** GT-70 a GT-79: el cierre de las tareas terminadas: informar el PR, imputar las horas y cerrar. */
export function Completion({ tasks, parameters, saving, onOpen, onResolve }: Props) {
  const { notify } = useMiniApp();
  const [resolving, setResolving] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkDate, setBulkDate] = useState(todayIso);
  const [pending, setPending] = useState<Pending | null>(null);

  const minutes = minutesPerPoint(parameters);
  const sorted = useMemo(() => sortCompletion(tasks), [tasks]);
  const toImpute = sorted.filter((t) => t.pr_status === 'Need to Impute');
  const needPr = tasks.filter((t) => t.pr_status === 'Need PR' && t.ticket_type !== 'Task');
  const imputed = tasks.filter((t) => t.pr_status === 'Imputed' && t.ticket_type !== 'Task');
  const hours = (t: Task) => effortHours(t.effort_points, minutes);
  const jiraLines = toImpute.map((t) => jiraLine(t, minutes)).filter(Boolean);
  const chosen = toImpute.filter((t) => selected.has(t.id));
  const total = (list: Task[]) => formatHours(list.reduce((sum, t) => sum + hours(t), 0));
  const task = resolving ? tasks.find((t) => t.id === resolving) : undefined;

  /** GT-77 */
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Copiado al portapapeles.');
    } catch {
      notify('No se pudo copiar al portapapeles.', 'error');
    }
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <p className={styles.muted}>Cierre de las tareas terminadas: informar el PR, imputar las horas y cerrar.</p>
        <span className={styles.spacer} />
        {needPr.length > 0 && (
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              setPending({
                title: 'Informar PR de todas',
                text: `¿Pasar ${needPr.length} tarea(s) de Need PR a Need to Impute, sin enlace al PR?`,
                action: 'Informar PR',
                payloads: needPr.map((t) => ({ id: t.id })),
                done: `${needPr.length} tarea(s) pasadas a Need to Impute.`,
              })
            }
          >
            Informar PR de todas ({needPr.length})
          </button>
        )}
        {imputed.length > 0 && (
          <button
            type="button"
            className={styles.primary}
            disabled={saving}
            onClick={() =>
              setPending({
                title: 'Cerrar imputadas',
                text: `¿Cerrar ${imputed.length} tarea(s) en estado Imputed y pasarlas a Deployed? Ciérralas antes en el sistema externo.`,
                action: 'Cerrar tareas',
                payloads: imputed.map((t) => ({ id: t.id })),
                done: `${imputed.length} tarea(s) cerradas correctamente.`,
              })
            }
          >
            Cerrar imputadas ({imputed.length})
          </button>
        )}
      </div>

      <div className={styles.steps} role="group" aria-label="Resumen por paso">
        {STEPS.map(([status, label]) => (
          <div key={status} className={styles.step} data-pr={status}>
            <span>{label}</span>
            <strong>{tasks.filter((t) => t.pr_status === status).length}</strong>
            <small className={styles.muted}>{status}</small>
          </div>
        ))}
      </div>

      {toImpute.length > 0 && (
        <section className={styles.panel} aria-label="Imputación masiva">
          <div className={styles.toolbar}>
            <h2>
              Pendientes de imputar <span className={styles.badge}>{toImpute.length}</span>
            </h2>
            <span className={styles.spacer} />
            {jiraLines.length > 0 && (
              <button type="button" onClick={() => void copy(jiraLines.join('\n'))}>
                Copiar para Jira ({jiraLines.length})
              </button>
            )}
            <button type="button" aria-expanded={bulkOpen} onClick={() => setBulkOpen((o) => !o)}>
              {bulkOpen ? 'Ocultar tabla' : 'Ver tabla'}
            </button>
          </div>
          {toImpute.length > jiraLines.length && (
            <p className={styles.muted}>
              {toImpute.length - jiraLines.length} tarea(s) sin ticket, fecha de resolución u horas no se copian para Jira.
            </p>
          )}
          {bulkOpen && (
            <>
              <label className={styles.inline}>
                Fecha de imputación
                <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
              </label>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todas"
                          checked={chosen.length === toImpute.length}
                          onChange={(e) => setSelected(e.target.checked ? new Set(toImpute.map((t) => t.id)) : new Set())}
                        />
                      </th>
                      <th>Tarea</th>
                      <th>Fecha de resolución</th>
                      <th className={styles.number}>Horas a imputar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toImpute.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Marcar ${t.ticket || t.title || 'Sin título'}`}
                            checked={selected.has(t.id)}
                            onChange={(e) => toggle(t.id, e.target.checked)}
                          />
                        </td>
                        <td>
                          <TicketLink ticket={t.ticket} parameters={parameters} /> <span className={styles.title}>{t.title || 'Sin título'}</span>
                        </td>
                        <td className={styles.nowrap}>
                          <Value value={t.finished_date} />
                        </td>
                        <td className={styles.number}>{formatHours(hours(t))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total</td>
                      <td className={styles.number}>{total(toImpute)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3}>Total seleccionado ({chosen.length})</td>
                      <td className={styles.number}>{total(chosen)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={saving || chosen.length === 0}
                  onClick={() =>
                    setPending({
                      title: 'Imputar seleccionadas',
                      text: `¿Imputar ${chosen.length} tarea(s) seleccionada(s) y pasarlas a Imputed?`,
                      action: 'Imputar',
                      payloads: chosen.map((t) => ({ id: t.id, imputed_date: bulkDate || defaultImputedDate(t) })),
                      done: `${chosen.length} tarea(s) imputadas correctamente.`,
                      after: () => setSelected(new Set()),
                    })
                  }
                >
                  Imputar seleccionadas ({chosen.length})
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <div className={styles.panel}>
        {sorted.length === 0 ? (
          <p className={styles.muted}>No hay tareas pendientes de completar.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Tipo</th>
                  <th>Finalización</th>
                  <th className={styles.number}>Horas</th>
                  <th>PR</th>
                  <th>
                    <span className={styles.hidden}>Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.id} className={styles.task} data-status="Done" data-pr={t.pr_status ?? undefined} {...activation(() => onOpen(t))}>
                    <td>
                      <TaskSummary task={t} parameters={parameters} info={false} />
                    </td>
                    <td>
                      <TypeBadge type={t.ticket_type} />
                    </td>
                    <td className={styles.nowrap}>
                      <Value value={t.finished_date} />
                    </td>
                    <td className={styles.number}>{formatHours(hours(t))}</td>
                    <td>
                      <span className={styles.pill} data-pr={t.pr_status ?? undefined}>
                        {t.pr_status || '-'}
                      </span>
                    </td>
                    <td className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.primary}
                        aria-label={`${stepLabel(t)}: ${t.title ?? ''}`}
                        disabled={saving || !canResolve(t)}
                        title={canResolve(t) ? undefined : 'Sin paso de cierre para este tipo de tarea'}
                        onClick={() => setResolving(t.id)}
                      >
                        {stepLabel(t)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {task && (
        <Resolve
          task={task}
          parameters={parameters}
          minutes={minutes}
          saving={saving}
          onCopy={(text) => void copy(text)}
          onClose={() => setResolving(null)}
          onConfirm={(payload) =>
            void onResolve([payload], 'Tarea resuelta correctamente.').then((ok) => {
              if (ok) setResolving(null);
            })
          }
        />
      )}
      {pending && (
        <Confirm
          title={pending.title}
          action={pending.action}
          onAnswer={(yes) => {
            const p = pending;
            setPending(null);
            if (yes)
              void onResolve(p.payloads, p.done).then((ok) => {
                if (ok) p.after?.();
              });
          }}
        >
          <p>{pending.text}</p>
        </Confirm>
      )}
    </div>
  );
}

interface ResolveProps {
  task: Task;
  parameters: Parameter[];
  minutes: number;
  saving: boolean;
  onCopy: (text: string) => void;
  onClose: () => void;
  onConfirm: (payload: Payload) => void;
}

/** GT-73 a GT-76: el diálogo del paso que le toca a la tarea. */
function Resolve({ task, parameters, minutes, saving, onCopy, onClose, onConfirm }: ResolveProps) {
  const [prLink, setPrLink] = useState(task.pr_link ?? '');
  const [testCases, setTestCases] = useState(task.test_cases ?? '');
  const [imputedDate, setImputedDate] = useState(() => defaultImputedDate(task));
  const status = task.pr_status;
  const hours = effortHours(task.effort_points, minutes);
  const jira = jiraTime(hours, task.finished_date);
  const title = { 'Need PR': 'Informar PR', 'Need to Impute': 'Imputar horas', Imputed: 'Cerrar tarea' }[status ?? ''] ?? 'Resolver tarea';

  const payload = (): Payload => {
    // GT-73: como la web: el enlace siempre, y los test cases solo en Feature.
    if (status === 'Need PR') return { id: task.id, pr_link: prLink.trim(), ...(task.ticket_type === 'Feature' ? { test_cases: testCases.trim() } : {}) };
    if (status === 'Need to Impute') return { id: task.id, imputed_date: imputedDate };
    return { id: task.id };
  };

  return (
    <Dialog title={title} eyebrow={task.ticket ? `Completar tareas · ${task.ticket}` : 'Completar tareas'} onClose={onClose}>
      <form
        className={styles.dialogBody}
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) onConfirm(payload());
        }}
      >
        {status === 'Need PR' && (
          <>
            <label className={styles.field}>
              Link al PR
              <input type="url" placeholder="https://..." value={prLink} onChange={(e) => setPrLink(e.target.value)} />
            </label>
            {task.ticket_type === 'Feature' && (
              <label className={styles.field}>
                Test cases
                <textarea rows={3} placeholder="Casos de prueba ejecutados o referencia" value={testCases} onChange={(e) => setTestCases(e.target.value)} />
              </label>
            )}
          </>
        )}
        {status !== 'Need PR' && (
          <dl className={styles.facts}>
            <dt>Ticket</dt>
            <dd>{task.ticket ? <TicketLink ticket={task.ticket} parameters={parameters} /> : '-'}</dd>
            <dt>Título</dt>
            <dd>{task.title || 'Sin título'}</dd>
            {status === 'Need to Impute' && (
              <>
                <dt>Fecha de resolución</dt>
                <dd>{task.finished_date || '-'}</dd>
                <dt>Horas a imputar</dt>
                <dd>{formatHours(hours)}</dd>
                {jira && (
                  <>
                    <dt>Hora Jira</dt>
                    <dd className={styles.inline}>
                      <code>{jira}</code>
                      <button type="button" onClick={() => onCopy(jira)}>
                        Copiar
                      </button>
                    </dd>
                  </>
                )}
              </>
            )}
          </dl>
        )}
        {status === 'Need to Impute' && (
          <label className={styles.field}>
            Fecha de imputación
            <input type="date" required data-autofocus value={imputedDate} onChange={(e) => setImputedDate(e.target.value)} />
          </label>
        )}
        {status === 'Imputed' && <p className={styles.notice}>Cierra la tarea en el sistema externo antes de confirmar este paso.</p>}
        <div className={styles.dialogActions}>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={styles.primary} disabled={saving} data-autofocus={status === 'Imputed' || undefined}>
            {status === 'Imputed' ? 'Confirmar cierre' : 'Confirmar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
