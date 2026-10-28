import { canUnlock, daysLeft, isUnlocked, NO_UNLOCKS, unlock, UNLOCK_EVERY } from '../src/services/unlocks';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 28, 12);

test('a new user has one free unlock now', () => {
  expect(canUnlock(NO_UNLOCKS, T0)).toBe(true);
  expect(daysLeft(NO_UNLOCKS, T0)).toBe(0);
});

test('unlocking spends the week: the next one is free 7 days later, to the millisecond', () => {
  const u = unlock(NO_UNLOCKS, 'trip:Seattle:1', T0);
  expect(isUnlocked(u, 'trip:Seattle:1')).toBe(true);
  expect(canUnlock(u, T0 + UNLOCK_EVERY - 1)).toBe(false);
  expect(canUnlock(u, T0 + UNLOCK_EVERY)).toBe(true);
  expect(daysLeft(u, T0)).toBe(7);
  expect(daysLeft(u, T0 + 6 * DAY + 1)).toBe(1);
  expect(daysLeft(u, T0 + 7 * DAY)).toBe(0);
});

test('a second unlock in the same week throws; re-unlocking the same story is free', () => {
  const u = unlock(NO_UNLOCKS, 'a', T0);
  expect(() => unlock(u, 'b', T0 + DAY)).toThrow('no free unlock');
  expect(unlock(u, 'a', T0 + DAY)).toBe(u);
});

test('unused weeks do not bank: a month idle still gives one unlock', () => {
  const u = unlock(NO_UNLOCKS, 'a', T0);
  const later = T0 + 30 * DAY;
  const v = unlock(u, 'b', later);
  expect(() => unlock(v, 'c', later)).toThrow('no free unlock');
  expect(v.ids).toEqual(['a', 'b']);
});
