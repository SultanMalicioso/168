export type WeekKey = string; // YYYY-MM-DD, siempre lunes

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay(); // 0 domingo, 1 lunes...
  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);
  return d;
}

export function getWeekKey(date: Date = new Date()): WeekKey {
  const monday = startOfWeek(date);

  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const day = String(monday.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function weekKeyToDate(key: WeekKey): Date {
  const [year, month, day] = key.split("-").map(Number);

  return new Date(year, month - 1, day);
}

export function addWeeks(key: WeekKey, amount: number): WeekKey {
  const date = weekKeyToDate(key);
  date.setDate(date.getDate() + amount * 7);

  return getWeekKey(date);
}

export function getWeekDates(key: WeekKey): Date[] {
  const monday = weekKeyToDate(key);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

export function formatWeekRange(key: WeekKey): string {
  const dates = getWeekDates(key);

  const start = dates[0];
  const end = dates[6];

  const startText = start.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });

  const endText = end.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `${startText} – ${endText}`;
}

export function isCurrentWeek(key: WeekKey): boolean {
  return key === getWeekKey();
}

export function isFutureWeek(key: WeekKey): boolean {
  return key > getWeekKey();
}

export function isPastWeek(key: WeekKey): boolean {
  return key < getWeekKey();
}
