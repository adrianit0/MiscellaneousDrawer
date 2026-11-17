import { useMemo } from 'react';
import styles from './gestask.module.css';
import { buildSchedule, completionKey, formatClock, longDate } from './logic';
import { activation, DailyCheck, taskColors, TicketLink, Value } from './parts';
import { DayPicker } from './Pickers';
import type { Parameter, Report, Task } from './types';

interface Props {
  report: Report | null;
  date: string;
  onDate: (date: string) => void;
  parameters: Parameter[];
  /** GT-94 */
  includeExtra: boolean;
  onToggleExtra: () => void;
  /** GT-104: las marcas que se están guardando, con su valor nuevo. */
  completing: ReadonlyMap<string, boolean>;
  onComplete: (taskId: string, reportDate: string, completed: boolean) => void;
  onOpen: (task: Task) => void;
}

/** GT-90 a GT-96: la agenda del parte del día elegido, y sus diarias. */
export function Schedule({ report, date, onDate, parameters, includeExtra, onToggleExtra, completing, onComplete, onOpen }: Props) {
  const ready = report !== null && report.date === date;
  const tasks = ready ? report.tasks : [];
  const schedule = useMemo(() => buildSchedule(tasks, parameters, date, includeExtra), [tasks, parameters, date, includeExtra]);
  const day = schedule.workday;
  const clock = (minutes: number) => formatClock(minutes, day.offsetMinutes);
  const daily = ready && report.exists ? report.daily : [];
  const done = daily.filter((t) => (completing.get(completionKey(t.id, date)) ?? Boolean(t.completed_at))).length;

  return (
    <div className={styles.section}>
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <DayPicker date={date} onChange={onDate} />
          <span className={styles.spacer} />
          {day.intensive && <span className={styles.badge}>Horario intensivo</span>}
          <span className={styles.badge} title="Puntos de esfuerzo planificados / objetivo del día">
            {schedule.plannedPoints} / {day.dailyPoints} PE
          </span>
          <span className={styles.badge} title="Jornada">
            {clock(day.start)} – {clock(day.end)}
          </span>
        </div>
      </div>

      {daily.length > 0 && (
        <div className={styles.panel} aria-label="Tareas diarias del parte">
          <div className={styles.toolbar}>
            <h2>Tareas diarias</h2>
            <span className={styles.spacer} />
            <span className={styles.badge} data-level={done === daily.length ? 'ok' : undefined}>
              {done} / {daily.length} realizadas
            </span>
          </div>
          <ul className={styles.checklist}>
            {daily.map((t) => {
              const key = completionKey(t.id, date);
              return (
                <DailyCheck
                  key={t.id}
                  title={t.title}
                  ticket={t.ticket}
                  moreInfo={t.more_info}
                  parameters={parameters}
                  checked={completing.get(key) ?? Boolean(t.completed_at)}
                  saving={completing.has(key)}
                  onChange={(checked) => onComplete(t.id, date, checked)}
                />
              );
            })}
          </ul>
        </div>
      )}

      <div className={styles.panel}>
        {!ready ? (
          <p className={styles.muted}>Cargando el parte…</p>
        ) : !report.exists ? (
          <p className={styles.muted}>No existe parte diario para mostrar el horario.</p>
        ) : (
          <>
            <h2>Horario del {longDate(date)}</h2>
            {schedule.items.length === 0 ? (
              <p className={styles.muted}>No hay tareas con esfuerzo para planificar en el horario diario.</p>
            ) : (
              <ol className={styles.agenda} aria-label="Horario">
                {schedule.items.map((item, i) => (
                  <li
                    key={`${item.start}-${i}`}
                    className={item.kind === 'task' ? `${styles.slot} ${styles.task}` : styles.slot}
                    data-kind={item.kind}
                    {...(item.kind === 'task' ? { ...taskColors(item.task), ...activation(() => onOpen(item.task)) } : {})}
                  >
                    <span className={styles.slotTime}>
                      <strong>{clock(item.start)}</strong>
                      <span>{clock(item.end)}</span>
                    </span>
                    {item.kind === 'task' ? (
                      <div className={styles.slotCard}>
                        <div className={styles.summaryMeta}>
                          <TicketLink ticket={item.task.ticket} parameters={parameters} />
                          <span className={styles.badge}>{Number(item.task.effort_points) || 0} PE</span>
                          {item.partial && (
                            <span className={styles.badge} data-level="warning">
                              Tarea parcial
                            </span>
                          )}
                          <span className={styles.badge}>
                            Orden <Value value={item.task.order_points} />
                          </span>
                        </div>
                        <p className={styles.title}>{item.task.title || 'Sin título'}</p>
                        {item.task.more_info && <p className={styles.info}>{item.task.more_info}</p>}
                      </div>
                    ) : (
                      <div className={styles.slotCard}>
                        <p className={styles.title}>{item.kind === 'daily' ? 'Daily' : 'Descanso'}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <button type="button" className={styles.extraHours} aria-pressed={includeExtra} onClick={onToggleExtra}>
              {includeExtra ? '− Mostrar menos horas' : '+ Incluir horas'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
