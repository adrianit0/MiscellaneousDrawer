import { useState } from 'react';
import { Dialog } from './Dialog';
import styles from './gestask.module.css';
import { dayTone, effortHours, formatHours, minutesPerPoint, truncate, WEEK_DAYS, weekdayIndex, workday, workWeek } from './logic';
import { activation } from './parts';
import { MonthPicker } from './Pickers';
import { DAY_STATUSES, type CalendarDay, type Month, type Parameter } from './types';

interface Props {
  /** El último mes recibido; si es otro, el elegido todavía no ha llegado. */
  calendar: Month | null;
  year: number;
  month: number;
  onMonth: (year: number, month: number) => void;
  parameters: Parameter[];
  saving: boolean;
  onOpenTask: (id: string) => void;
  /** GT-114: guarda el tipo de un día. Devuelve si se guardó. */
  onSaveDay: (payload: { day: string; status: string; note: string | null }) => Promise<boolean>;
}

const weekdayName = (date: string) => WEEK_DAYS[weekdayIndex(date)];

/** GT-114: el tipo y la observación de un día. */
function DayDialog({ day, saving, onSave, onClose }: { day: CalendarDay; saving: boolean; onSave: Props['onSaveDay']; onClose: () => void }) {
  const [status, setStatus] = useState<string>((DAY_STATUSES as readonly string[]).includes(day.status) ? day.status : 'Laboral');
  const [note, setNote] = useState(day.note ?? '');
  return (
    <Dialog title={`${weekdayName(day.date)} ${day.day}`} eyebrow={`Calendario · ${day.date}`} onClose={onClose}>
      <form
        className={styles.dialogBody}
        onSubmit={(e) => {
          e.preventDefault();
          if (saving) return;
          void onSave({ day: day.date, status, note: note.trim() || null }).then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <label className={styles.field}>
          Tipo de día
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {DAY_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Observaciones
          <textarea rows={3} value={note} placeholder="Ej. Mudanza, médico por la tarde…" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className={styles.dialogActions}>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={styles.primary} disabled={saving}>
            Guardar
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** GT-110 a GT-114: los días laborables del mes con sus puntos completados frente al objetivo. */
export function Calendar({ calendar, year, month, onMonth, parameters, saving, onOpenTask, onSaveDay }: Props) {
  const [editing, setEditing] = useState<CalendarDay | null>(null);
  const ready = calendar !== null && calendar.year === year && calendar.month === month;
  const week = workWeek(ready ? calendar.days : []);
  const minutes = minutesPerPoint(parameters);

  return (
    <div className={styles.section}>
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <MonthPicker year={year} month={month} onChange={onMonth} />
          <span className={styles.spacer} />
          <ul className={styles.legend} aria-label="Leyenda">
            <li data-tone="good">Objetivo cumplido</li>
            <li data-tone="low">Por debajo</li>
            <li data-tone="special">No laborable</li>
          </ul>
        </div>
        <p className={styles.muted}>Puntos completados por día laborable. Pulsa un día para marcarlo como vacaciones, festivo o ausencia.</p>
      </div>

      <div className={styles.panel}>
        {!ready ? (
          <p className={styles.muted}>Cargando el mes…</p>
        ) : (
          <div className={styles.calendar}>
            {WEEK_DAYS.slice(0, 5).map((name) => (
              <div key={name} className={styles.weekday}>
                {name}
              </div>
            ))}
            {Array.from({ length: week.leading }, (_, i) => (
              <div key={`empty-${i}`} aria-hidden="true" />
            ))}
            {week.days.map((day) => {
              const target = workday(parameters, day.date).dailyPoints;
              const points = Number(day.completed_points || 0);
              const workable = day.status === 'Laboral';
              const progress = target > 0 ? Math.min(100, Math.round((points / target) * 100)) : 0;
              const tasks = day.completed_tasks ?? [];
              return (
                <article
                  key={day.date}
                  className={styles.calendarDay}
                  data-tone={dayTone(day, target)}
                  data-today={day.is_today || undefined}
                  aria-label={`${weekdayName(day.date)} ${day.day}: ${day.status}, ${points} de ${target} puntos`}
                  {...activation(() => setEditing(day))}
                >
                  <header>
                    <strong>
                      {day.day} <small className={styles.muted}>{weekdayName(day.date)}</small>
                    </strong>
                    <span className={styles.inline}>
                      {!workable && <span className={styles.badge}>{day.status}</span>}
                      {day.is_today && (
                        <span className={styles.badge} data-level="today">
                          Hoy
                        </span>
                      )}
                    </span>
                  </header>
                  {workable && (
                    <>
                      <div className={styles.points}>
                        <span>
                          <strong>{points}</strong> / {target} PE
                        </span>
                        <span className={styles.muted}>{formatHours(effortHours(points, minutes))}</span>
                      </div>
                      <div className={styles.progress} aria-hidden="true">
                        <div style={{ width: `${progress}%` }} />
                      </div>
                    </>
                  )}
                  {day.note && (
                    <p className={styles.note} title={day.note}>
                      {truncate(day.note, 70)}
                    </p>
                  )}
                  {tasks.length > 0 && (
                    <div className={styles.calendarTasks}>
                      {tasks.map((t) => (
                        <button key={t.id} type="button" className={styles.calendarTask} data-type={t.ticket_type ?? undefined} title={t.title ?? ''} onClick={() => onOpenTask(t.id)}>
                          <strong>{t.ticket || truncate(t.title ?? '', 18)}</strong>
                          <span>{t.title}</span>
                          <em>{Number(t.effort_points || 0)} PE</em>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {editing && <DayDialog day={editing} saving={saving} onSave={onSaveDay} onClose={() => setEditing(null)} />}
    </div>
  );
}
