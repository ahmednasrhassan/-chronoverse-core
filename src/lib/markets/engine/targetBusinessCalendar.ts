const DAY_MILLISECONDS = 86_400_000;

/** Interpret the UTC date fields as a TARGET civil date, never as a release time. */
export function isTargetBusinessDateV1(date: Date): boolean {
  if (!Number.isFinite(date.getTime())) return false;

  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (
    (month === 1 && day === 1) ||
    (month === 5 && day === 1) ||
    (month === 12 && (day === 25 || day === 26))
  ) {
    return false;
  }

  const civilDate = Date.UTC(year, month - 1, day);
  const easterSunday = gregorianEasterSundayUtc(year);
  return civilDate !== easterSunday - 2 * DAY_MILLISECONDS &&
    civilDate !== easterSunday + DAY_MILLISECONDS;
}

export function previousTargetBusinessDateV1(date: Date): Date {
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("TARGET business date is invalid.");
  }

  const previous = new Date(date.getTime());
  previous.setUTCHours(0, 0, 0, 0);
  do {
    previous.setUTCDate(previous.getUTCDate() - 1);
    if (!Number.isFinite(previous.getTime())) {
      throw new RangeError("Previous TARGET business date is outside the Date range.");
    }
  } while (!isTargetBusinessDateV1(previous));
  return previous;
}

/** Gregorian Easter Sunday, using the Meeus/Jones/Butcher calculation. */
function gregorianEasterSundayUtc(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}
