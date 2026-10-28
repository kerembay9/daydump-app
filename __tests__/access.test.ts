import { access } from '../src/services/access';
import { NO_UNLOCKS } from '../src/services/unlocks';

const trip = { id: 'trip:Seattle:1', kind: 'trip' as const };
const today = { id: 'today:2026-10-28', kind: 'today' as const };
const unlocked = { lastAt: 1, ids: [trip.id] };

test('the daily recap is always open, Pro or not', () => {
  expect(access(today, false, NO_UNLOCKS)).toBe('open');
});

test('Pro opens everything', () => {
  expect(access(trip, true, NO_UNLOCKS)).toBe('open');
});

test('free: an unlocked story is open, any other is locked', () => {
  expect(access(trip, false, unlocked)).toBe('open');
  expect(access({ id: 'topic:7:1', kind: 'topic' }, false, unlocked)).toBe('locked');
  expect(access(trip, false, NO_UNLOCKS)).toBe('locked');
});
