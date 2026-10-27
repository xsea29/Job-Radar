export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

/** The demo schedule (daily bot at 06:00) is in IST; production will use the user's configured timezone. */
export const APP_TZ = 'Asia/Kolkata';

function parts(iso: string | number | Date) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(iso))) o[p.type] = p.value;
  return o as { day: string; month: string; hour: string; minute: string };
}

/** "27 Oct" */
export function shortDate(iso: string | number | Date): string {
  const p = parts(iso);
  return `${p.day} ${p.month}`;
}

/** "27 Oct, 06:00" */
export function dateTime(iso: string | number | Date): string {
  const p = parts(iso);
  return `${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

/** "3 to 9 Oct" or "30 Sep to 6 Oct" */
export function dateRange(a: string, b: string): string {
  const pa = parts(a);
  const pb = parts(b);
  return pa.month === pb.month ? `${pa.day} to ${pb.day} ${pb.month}` : `${pa.day} ${pa.month} to ${pb.day} ${pb.month}`;
}

export function relativeDays(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return shortDate(iso);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** ₹28 LPA from an annual INR figure. */
export function lpa(annualInr: number): string {
  const l = annualInr / 100_000;
  return `₹${Number.isInteger(l) ? l : l.toFixed(1)} LPA`;
}

export function lpaRange(min?: number, max?: number): string {
  if (min != null && max != null) return `₹${Math.round(min / 100_000)}–${Math.round(max / 100_000)} LPA`;
  if (min != null) return `₹${Math.round(min / 100_000)}+ LPA`;
  if (max != null) return `up to ₹${Math.round(max / 100_000)} LPA`;
  return 'Not published';
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function isoDay(iso: string | number | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date(iso));
}

/** Weekday + date label for report lists: "Tue 27 Oct". */
export function dayLabel(iso: string | number | Date): string {
  const wd = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, weekday: 'short' }).format(new Date(iso));
  return `${wd} ${shortDate(iso)}`;
}
