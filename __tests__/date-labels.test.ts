import { dateRange } from '../src/services/stories/titles';
import { statusLine, photoRange } from '../src/services/dumpLabels';

// Labels are built from the phone's local calendar, so the same local dates must read the same in any timezone, around DST
// changes and at midnight. Jest cannot switch timezone inside a run, so `npm run test:tz` runs this file once per zone
// (UTC, Istanbul, New York, Kiritimati +14, Pago Pago -11); a plain `npm test` runs it in the machine's zone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const now = at(2026, 9, 29);

test('a range inside one month, a range across months, a single day', () => {
  expect(dateRange(at(2026, 4, 12), at(2026, 4, 18), now)).toBe('May 12–18');
  expect(dateRange(at(2026, 4, 28), at(2026, 5, 3), now)).toBe('May 28–Jun 3');
  expect(dateRange(at(2026, 4, 12), at(2026, 4, 12), now)).toBe('May 12');
});

test('another year gets the year, and the new-year boundary reads right', () => {
  expect(dateRange(at(2025, 11, 30), at(2026, 0, 2), now)).toBe('Dec 30–Jan 2');
  expect(dateRange(at(2025, 8, 22), at(2025, 8, 27), now)).toBe('Sep 22–27, 2025');
});

test('a photo at 23:30 and one at 00:30 are different days', () => {
  expect(dateRange(at(2026, 4, 12, 23) + 30 * 60_000, at(2026, 4, 13, 0) + 30 * 60_000, now)).toBe('May 12–13');
});

test('"Edited today / yesterday" holds on the days the clocks change', () => {
  const draft = (y: number, m: number, d: number) => ({ edited: at(y, m, d), status: 'draft' as const, platform: null, postedAt: null });
  // US spring-forward Mar 8 2026 and fall-back Nov 1 2026 (a 23 h and a 25 h day); other zones just see ordinary days.
  expect(statusLine(draft(2026, 2, 7), at(2026, 2, 8, 20))).toBe('Edited yesterday');
  expect(statusLine(draft(2026, 2, 8), at(2026, 2, 8, 20))).toBe('Edited today');
  expect(statusLine(draft(2026, 9, 31), at(2026, 10, 1, 20))).toBe('Edited yesterday');
  expect(statusLine(draft(2026, 10, 1), at(2026, 10, 1, 1))).toBe('Edited today');
});

test('a dump with undated photos uses the day it was made', () => {
  expect(photoRange({ photos: [{ created: 0 } as never], created: at(2026, 8, 3) }, now)).toBe('Sep 3');
});
