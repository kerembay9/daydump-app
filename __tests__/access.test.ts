import { access } from '../src/services/access';
import { NO_UNLOCKS, unlock } from '../src/services/unlocks';

const DAY = 86_400_000;
const trip = { id: `trip:Seattle:${10 * DAY}`, kind: 'trip' as const, start: 10 * DAY, end: 16 * DAY };
const today = { id: 'today:2026-10-28', kind: 'today' as const, start: 0, end: 0 };
const unlocked = unlock(NO_UNLOCKS, trip, 1);

test('the daily recap is always open, Pro or not', () => {
  expect(access(today, false, NO_UNLOCKS)).toBe('open');
});

test('week, month and year recaps are always open, Pro or not', () => {
  for (const id of ['recap:week:Mon Oct 26 2026', 'recap:month:2026-10', 'recap:year:2026']) {
    expect(access({ id, kind: 'recap', start: 10 * DAY, end: 16 * DAY }, false, NO_UNLOCKS)).toBe('open');
  }
  // a used weekly unlock doesn't matter either
  expect(access({ id: 'recap:week:Mon Oct 26 2026', kind: 'recap', start: 10 * DAY, end: 16 * DAY }, false, unlocked)).toBe('open');
});

test('Pro opens everything', () => {
  expect(access(trip, true, NO_UNLOCKS)).toBe('open');
});

test('free: an unlocked story is open, any other is locked', () => {
  expect(access(trip, false, unlocked)).toBe('open');
  expect(access({ id: `topic:7:${10 * DAY}`, kind: 'topic', start: 10 * DAY, end: 16 * DAY }, false, unlocked)).toBe('locked');
  expect(access(trip, false, NO_UNLOCKS)).toBe('locked');
});

test('free: the unlocked story stays open when a re-index moves its start (and id)', () => {
  expect(access({ ...trip, id: `trip:Seattle:${8 * DAY}`, start: 8 * DAY }, false, unlocked)).toBe('open');
});
