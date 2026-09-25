import { describe, expect, test } from 'bun:test';

import {
  beijingDateString,
  findHoliday,
  formatCountdown,
  nextSwitchAt,
  peakStateAt,
} from './peak.ts';

const at = (iso: string) => new Date(iso);

describe('peakStateAt', () => {
  test('Tuesday 10:00 Beijing is peak', () => {
    // 2026-09-22 is a Tuesday.
    expect(peakStateAt(at('2026-09-22T02:00:00Z')).peak).toBe(true);
  });

  test('Tuesday 13:00 Beijing is off-peak (between windows)', () => {
    expect(peakStateAt(at('2026-09-22T05:00:00Z')).peak).toBe(false);
  });

  test('Tuesday 14:00 Beijing is peak again', () => {
    expect(peakStateAt(at('2026-09-22T06:00:00Z')).peak).toBe(true);
  });

  test('window edges: 09:00 in, 12:00 out, 14:00 in, 18:00 out', () => {
    expect(peakStateAt(at('2026-09-22T01:00:00Z')).peak).toBe(true);
    expect(peakStateAt(at('2026-09-22T04:00:00Z')).peak).toBe(false);
    expect(peakStateAt(at('2026-09-22T06:00:00Z')).peak).toBe(true);
    expect(peakStateAt(at('2026-09-22T10:00:00Z')).peak).toBe(false);
  });

  test('Saturday is off-peak all day', () => {
    // 2026-10-17 is a Saturday.
    const state = peakStateAt(at('2026-10-17T02:00:00Z'));
    expect(state.peak).toBe(false);
    expect(state.reason).toBe('Weekend: off-peak all day');
  });

  test('Chinese public holiday is off-peak all day', () => {
    // 2026-09-25 is Mid-Autumn Festival (Friday).
    const state = peakStateAt(at('2026-09-25T02:00:00Z'));
    expect(state.peak).toBe(false);
    expect(state.holiday).toBe('Mid-Autumn Festival');
  });
});

describe('nextSwitchAt', () => {
  test('inside first peak window -> 12:00 Beijing', () => {
    expect(nextSwitchAt(at('2026-09-22T02:00:00Z'))).toBe(Date.parse('2026-09-22T04:00:00Z'));
  });

  test('between windows -> 14:00 Beijing', () => {
    expect(nextSwitchAt(at('2026-09-22T05:00:00Z'))).toBe(Date.parse('2026-09-22T06:00:00Z'));
  });

  test('after last window on Friday -> Monday 09:00 Beijing', () => {
    // 2026-10-16 is a Friday; the next peak is Monday 2026-10-19 01:00Z.
    expect(nextSwitchAt(at('2026-10-16T11:00:00Z'))).toBe(Date.parse('2026-10-19T01:00:00Z'));
  });

  test('holiday plus weekend -> first peak after Monday', () => {
    // Mid-Autumn 2026-09-25 (Fri) .. 2026-09-27 (Sun); Monday is 09-28.
    expect(nextSwitchAt(at('2026-09-25T02:00:00Z'))).toBe(Date.parse('2026-09-28T01:00:00Z'));
  });
});

describe('helpers', () => {
  test('beijingDateString shifts across the UTC date boundary', () => {
    // 19:00Z is already the next day in Beijing.
    expect(beijingDateString(at('2026-09-24T19:00:00Z'))).toBe('2026-09-25');
  });

  test('findHoliday matches inclusive ranges', () => {
    expect(findHoliday('2026-10-01')?.label).toBe('National Day');
    expect(findHoliday('2026-10-08')).toBeNull();
  });

  test('formatCountdown is compact', () => {
    expect(formatCountdown(2 * 3600_000 + 14 * 60_000)).toBe('2h 14m');
    expect(formatCountdown(14 * 60_000)).toBe('14m');
    expect(formatCountdown(45_000)).toBe('45s');
  });
});
