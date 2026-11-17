import { useEffect, useState } from 'react';
import styles from './gestask.module.css';
import { isValidYear, MONTHS, shiftDay, shiftMonth, todayIso } from './logic';

/** GT-80: el día del parte, compartido por «Tareas diarias» y «Horario diario». */
export function DayPicker({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = todayIso();
  return (
    <div className={styles.picker} role="group" aria-label="Día">
      <button type="button" aria-label="Día anterior" title="Día anterior" onClick={() => onChange(shiftDay(date, -1))}>
        ‹
      </button>
      <input
        type="date"
        aria-label="Fecha del parte"
        value={date}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      />
      <button type="button" aria-label="Día siguiente" title="Día siguiente" onClick={() => onChange(shiftDay(date, 1))}>
        ›
      </button>
      <button type="button" disabled={date === today} onClick={() => onChange(today)}>
        Hoy
      </button>
    </div>
  );
}

interface MonthProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

/** GT-110: el mes del calendario. Un año a medio escribir o fuera de 2000 a 2100 no pide nada. */
export function MonthPicker({ year, month, onChange }: MonthProps) {
  const [yearText, setYearText] = useState(String(year));
  useEffect(() => setYearText(String(year)), [year]);
  const now = new Date();
  const current = year === now.getFullYear() && month === now.getMonth() + 1;
  const go = (delta: number) => {
    const next = shiftMonth(year, month, delta);
    onChange(next.year, next.month);
  };
  return (
    <div className={styles.picker} role="group" aria-label="Periodo">
      <button type="button" aria-label="Mes anterior" title="Mes anterior" onClick={() => go(-1)}>
        ‹
      </button>
      <select aria-label="Mes" value={month} onChange={(e) => onChange(year, Number(e.target.value))}>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="number"
        aria-label="Año"
        min={2000}
        max={2100}
        className={styles.year}
        value={yearText}
        onChange={(e) => {
          setYearText(e.target.value);
          const next = Number(e.target.value);
          if (isValidYear(next)) onChange(next, month);
        }}
      />
      <button type="button" aria-label="Mes siguiente" title="Mes siguiente" onClick={() => go(1)}>
        ›
      </button>
      <button type="button" disabled={current} onClick={() => onChange(now.getFullYear(), now.getMonth() + 1)}>
        Mes actual
      </button>
    </div>
  );
}
