import { tiles } from '../src/components/create/WayPreview';

// a 375x812 phone: 343 px wide grid, ~560 px of room
const cols = (n: number, room = 560) => Math.round(343 / tiles(n, 343, room).w);

test('few photos get bigger tiles while they fit', () => {
  expect(cols(1)).toBe(1);
  expect(cols(3)).toBe(2); // 2x2, not 1x3
  expect(cols(4)).toBe(2);
  expect(cols(6)).toBe(2); // 3 rows of 2, not 2 rows of 3
  const t = tiles(6, 343, 560);
  expect(3 * t.h + 8).toBeLessThanOrEqual(560);
  expect(t.h).toBeGreaterThanOrEqual(t.w);
});

test('falls back to 3 columns when 2 would not fit', () => {
  expect(cols(6, 450)).toBe(3);
  expect(cols(12)).toBe(3);
});
