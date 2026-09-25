/**
 * DeepSeek peak / off-peak billing schedule.
 *
 * Source: https://api-docs.deepseek.com/quick_start/pricing
 *   Peak: 01:00-04:00 and 06:00-10:00 UTC, Monday-Friday, excluding Chinese
 *   public holidays. Everything else, including weekends and holidays in full,
 *   is off-peak. Off-peak is the base rate; peak costs twice it.
 *
 * DeepSeek publishes the schedule against a Beijing working day, so all of the
 * day/week logic below is evaluated in Beijing time (UTC+8, no DST). Only the
 * result is converted back to an absolute instant, which the UI renders in the
 * viewer's own time zone.
 */

export type PeakState = {
  peak: boolean;
  /** Short human-readable explanation, English. */
  reason: string;
  /** Holiday label when the day is a Chinese public holiday, else null. */
  holiday: string | null;
  weekend: boolean;
};

export type Holiday = { label: string; from: string; to: string };

/**
 * Chinese public holidays for 2026, as Beijing calendar dates (inclusive).
 * The State Council publishes the next year's arrangement late in the current
 * year, so this list needs a yearly refresh.
 */
export const CN_HOLIDAYS_2026: readonly Holiday[] = [
  { label: "New Year's Day", from: '2026-01-01', to: '2026-01-03' },
  { label: 'Spring Festival', from: '2026-02-15', to: '2026-02-23' },
  { label: 'Qingming Festival', from: '2026-04-04', to: '2026-04-06' },
  { label: 'Labour Day', from: '2026-05-01', to: '2026-05-05' },
  { label: 'Dragon Boat Festival', from: '2026-06-19', to: '2026-06-21' },
  { label: 'Mid-Autumn Festival', from: '2026-09-25', to: '2026-09-27' },
  { label: 'National Day', from: '2026-10-01', to: '2026-10-07' },
];

/** Peak windows as minutes since Beijing midnight. */
export const PEAK_WINDOWS_MINUTES: ReadonlyArray<readonly [number, number]> = [
  [9 * 60, 12 * 60],
  [14 * 60, 18 * 60],
];

const BJ_OFFSET_MINUTES = 8 * 60;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Spring Festival runs nine days; 20 days of headroom is plenty. */
const MAX_LOOKAHEAD_DAYS = 20;

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value));

/** Wall-clock parts of `date` in Beijing time. */
export const beijingParts = (date: Date): {
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** Minutes since Beijing midnight. */
  minutes: number;
} => {
  const shifted = new Date(date.getTime() + BJ_OFFSET_MINUTES * MINUTE_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
};

export const beijingDateString = (date: Date): string => {
  const parts = beijingParts(date);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

export const findHoliday = (
  dateString: string,
  holidays: readonly Holiday[] = CN_HOLIDAYS_2026,
): Holiday | null => holidays.find((holiday) => dateString >= holiday.from && dateString <= holiday.to) ?? null;

export const peakStateAt = (
  date: Date,
  holidays: readonly Holiday[] = CN_HOLIDAYS_2026,
): PeakState => {
  const parts = beijingParts(date);
  const holiday = findHoliday(beijingDateString(date), holidays);
  if (holiday) {
    return { peak: false, reason: `${holiday.label}: off-peak all day`, holiday: holiday.label, weekend: false };
  }
  if (parts.weekday === 0 || parts.weekday === 6) {
    return { peak: false, reason: 'Weekend: off-peak all day', holiday: null, weekend: true };
  }
  const inPeak = PEAK_WINDOWS_MINUTES.some(([start, end]) => parts.minutes >= start && parts.minutes < end);
  return {
    peak: inPeak,
    reason: inPeak ? 'Inside a weekday peak window' : 'Outside the weekday peak windows',
    holiday: null,
    weekend: false,
  };
};

/**
 * First instant strictly after `date` at which the billing period flips.
 * Boundaries always fall on a whole minute, so a minute scan is exact.
 */
export const nextSwitchAt = (
  date: Date,
  holidays: readonly Holiday[] = CN_HOLIDAYS_2026,
): number | null => {
  const current = peakStateAt(date, holidays).peak;
  const start = Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  const limit = date.getTime() + MAX_LOOKAHEAD_DAYS * DAY_MS;
  for (let time = start; time <= limit; time += MINUTE_MS) {
    if (peakStateAt(new Date(time), holidays).peak !== current) {
      return time;
    }
  }
  return null;
};

/** "2h 14m", "14m", "45s" — a compact countdown. */
export const formatCountdown = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
};
