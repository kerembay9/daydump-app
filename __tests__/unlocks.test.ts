import AsyncStorage from '@react-native-async-storage/async-storage';
import { canUnlock, daysLeft, isUnlocked, loadUnlocks, NO_UNLOCKS, unlock, unlockedAs, UNLOCK_EVERY } from '../src/services/unlocks';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 28, 12);
// a story as the unlock sees it: its id carries its start (stories/index.ts)
const trip = (place: string, start: number, end = start + 6 * DAY) => ({ id: `trip:${place}:${start}`, start, end });
const S = trip('Seattle, US', 100 * DAY);
const story = (id: string) => ({ id, start: 0, end: 0 });

test('a new user has one free unlock now', () => {
  expect(canUnlock(NO_UNLOCKS, T0)).toBe(true);
  expect(daysLeft(NO_UNLOCKS, T0)).toBe(0);
});

test('unlocking spends the week: the next one is free 7 days later, to the millisecond', () => {
  const u = unlock(NO_UNLOCKS, S, T0);
  expect(isUnlocked(u, S)).toBe(true);
  expect(u.spans[S.id]).toEqual([S.start, S.end]);
  expect(canUnlock(u, T0 + UNLOCK_EVERY - 1)).toBe(false);
  expect(canUnlock(u, T0 + UNLOCK_EVERY)).toBe(true);
  expect(daysLeft(u, T0)).toBe(7);
  expect(daysLeft(u, T0 + 6 * DAY + 1)).toBe(1);
  expect(daysLeft(u, T0 + 7 * DAY)).toBe(0);
});

test('a second unlock in the same week throws; re-unlocking the same story is free', () => {
  const u = unlock(NO_UNLOCKS, story('a'), T0);
  expect(() => unlock(u, story('b'), T0 + DAY)).toThrow('no free unlock');
  expect(unlock(u, story('a'), T0 + DAY)).toBe(u);
});

test('unused weeks do not bank: a month idle still gives one unlock', () => {
  const u = unlock(NO_UNLOCKS, story('a'), T0);
  const later = T0 + 30 * DAY;
  const v = unlock(u, story('b'), later);
  expect(() => unlock(v, story('c'), later)).toThrow('no free unlock');
  expect(v.ids).toEqual(['a', 'b']);
});

test('a re-index that moves the start earlier (a new id) keeps the story unlocked, under its first id', () => {
  const u = unlock(NO_UNLOCKS, S, T0);
  const earlier = trip('Seattle, US', S.start - 2 * DAY, S.end);
  expect(earlier.id).not.toBe(S.id);
  expect(unlockedAs(u, earlier)).toBe(S.id);
  // and re-unlocking it costs nothing
  expect(unlock(u, earlier, T0 + DAY)).toBe(u);

  const topic = { id: `topic:7:${S.start}`, start: S.start, end: S.end };
  const t = unlock(NO_UNLOCKS, topic, T0);
  expect(unlockedAs(t, { ...topic, id: `topic:7:${S.start - DAY}`, start: S.start - DAY })).toBe(topic.id);
});

test('another series over the same time stays locked', () => {
  const u = unlock(NO_UNLOCKS, S, T0);
  expect(isUnlocked(u, trip('Portland, US', S.start))).toBe(false);
  expect(isUnlocked(u, { id: `topic:7:${S.start}`, start: S.start, end: S.end })).toBe(false);
});

test('the same place months later is another trip: locked', () => {
  const u = unlock(NO_UNLOCKS, S, T0);
  expect(isUnlocked(u, trip('Seattle, US', S.end + 90 * DAY))).toBe(false);
});

test('an exact id matches even without a span; a save from before spans loads', async () => {
  expect(unlockedAs({ lastAt: T0, ids: [S.id], spans: {} }, S)).toBe(S.id);
  await AsyncStorage.setItem('@picdump_unlocks', JSON.stringify({ lastAt: T0, ids: [S.id] }));
  const u = await loadUnlocks();
  expect(u).toEqual({ lastAt: T0, ids: [S.id], spans: {} });
  expect(isUnlocked(u, S)).toBe(true);
  // without a span an old unlock can't follow a re-id, but it doesn't break
  expect(isUnlocked(u, trip('Seattle, US', S.start - DAY, S.end))).toBe(false);
  await AsyncStorage.removeItem('@picdump_unlocks');
});
