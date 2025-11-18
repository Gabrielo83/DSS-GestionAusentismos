import { useEffect, useMemo, useRef, useState } from "react";

const monthNames = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const weekdayNames = ["L", "M", "M", "J", "V", "S", "D"];

const formatISO = (date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const sameDay = (a, b) =>
  a &&
  b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const addMonths = (date, delta) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
};

const startOfWeekMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getMonthGrid = (viewDate) => {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const start = startOfWeekMonday(firstDay);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
};

const normalizeRange = (range) => {
  if (!range?.start || !range?.end) return null;
  const start = new Date(range.start);
  const end = new Date(range.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { start, end };
};

export default function DatePicker({
  id,
  label,
  value,
  onChange,
  error,
  placeholder = "dd/mm/aaaa",
  markedRanges = [],
}) {
  const initialDate = value ? new Date(value) : new Date();
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(initialDate);
  const containerRef = useRef(null);
  const selectedDate = value ? new Date(value) : null;
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!isOpen) return () => {};
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleEsc = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen]);

  useEffect(() => {
    if (value) {
      setViewDate(new Date(value));
    }
  }, [value]);

  const days = getMonthGrid(viewDate);

  const handleSelect = (day) => {
    if (!onChange) return;
    onChange(formatISO(day));
    setIsOpen(false);
  };

  const normalizedRanges = useMemo(
    () =>
      (markedRanges || [])
        .map(normalizeRange)
        .filter(Boolean),
    [markedRanges],
  );

  const inMarkedRange = (day) =>
    normalizedRanges.some(
      (range) => day >= range.start && day <= range.end,
    );

  return (
    <div className="relative" ref={containerRef}>
      {label ? (
        <label
          htmlFor={id}
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          {label}
        </label>
      ) : null}
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-800 ${
          error
            ? "border-rose-500 text-rose-600 dark:border-rose-500 dark:text-rose-300"
            : "border-slate-400 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        }`}
      >
        <span className={value ? "" : "text-slate-500 dark:text-slate-500"}>
          {value
            ? new Date(value).toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : placeholder}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.6"
          stroke="currentColor"
          className="h-5 w-5 text-slate-400 dark:text-slate-500"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M4.5 9.75h15" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5.25 7.5h13.5a1 1 0 011 1V18a1 1 0 01-1 1H5.25a1 1 0 01-1-1V8.5a1 1 0 011-1z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h3m2 0h3M8 15h3m2 0h3" />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute z-20 mt-2 w-full min-w-[280px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-300/50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-slate-800 dark:text-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={viewDate.getMonth()}
                onChange={(e) => {
                  const nextMonth = Number(e.target.value);
                  setViewDate(new Date(viewDate.getFullYear(), nextMonth, 1));
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600"
              >
                {monthNames.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1970"
                max="2100"
                value={viewDate.getFullYear()}
                onChange={(e) => {
                  const year = Number(e.target.value) || viewDate.getFullYear();
                  setViewDate(new Date(year, viewDate.getMonth(), 1));
                }}
                className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewDate(addMonths(viewDate, -1))}
                className="rounded-full p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewDate(addMonths(viewDate, 1))}
                className="rounded-full p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
          <div className="mb-2 grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {weekdayNames.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-sm">
            {days.map((day) => {
              const isCurrentMonth = day.getMonth() === viewDate.getMonth();
              const isSelected = selectedDate && sameDay(day, selectedDate);
              const isToday = sameDay(day, today);
              const isMarked = inMarkedRange(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelect(day)}
                  className={`relative h-9 w-full rounded-lg border text-center font-semibold transition ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-100"
                      : isToday
                        ? "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        : isCurrentMonth
                          ? "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                          : "border-transparent text-slate-400 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-600 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                  }`}
                >
                  {isMarked ? (
                    <span className="absolute inset-0 rounded-lg bg-amber-100/80 ring-1 ring-amber-300/60 dark:bg-amber-500/20 dark:ring-amber-400/40" />
                  ) : null}
                  <span className="relative z-10">{day.getDate()}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => handleSelect(today)}
              className="rounded-full px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => {
                onChange?.("");
                setIsOpen(false);
              }}
              className="rounded-full px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Borrar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
