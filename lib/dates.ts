// All dates are handled as local calendar days in YYYY-MM-DD form.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** The Sunday on or before the given date. */
export function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - c.getDay());
  return c;
}

/** Monday through Saturday after the given Sunday (no Sunday play). */
export function weekDays(sunday: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => addDays(sunday, i + 1));
}

export function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hr}${suffix}` : `${hr}:${String(m).padStart(2, "0")}${suffix}`;
}

export function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function rangeLabel(a: Date, b: Date): string {
  const f = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${f(a)} – ${f(b)}`;
}

export function messageTime(iso: string): string {
  const d = new Date(iso);
  const today = toISODate(new Date());
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (toISODate(d) === today) return time;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}
