import { selfieFace } from '../src/services/selfie';
import { groupFaces } from '../src/services/faces';

const f = (w: number, h: number, x = 0.5 - w / 2, y = 0.45 - h / 2, score = 0.9) => ({ score, x, y, w, h });

test('selfieFace: exactly one face covering >= 10% of the photo, centered counts', () => {
  expect(selfieFace([])).toBe(0);
  expect(selfieFace([f(0.2, 0.3)])).toBe(0); // 6%
  expect(selfieFace([f(0.5, 0.5), f(0.4, 0.4)])).toBe(0); // group photo
  expect(selfieFace([f(0.5, 0.6)])).toBeCloseTo(0.27); // 30% × 0.9, centered
  expect(selfieFace([f(0.5, 0.6, 0.5, 0)])).toBeLessThan(selfieFace([f(0.5, 0.6)])); // same face at the edge
  expect(selfieFace([f(0.8, 0.8)])).toBeGreaterThan(selfieFace([f(0.5, 0.6)]));
});

test('groupFaces: same direction -> same person', () => {
  const v = (...xs: number[]) => { const a = new Float32Array(xs); const n = Math.hypot(...xs); return a.map((x) => x / n); };
  expect(groupFaces([v(1, 0, 0), v(0, 1, 0), v(0.9, 0.1, 0), v(0, 0, 1), v(0.1, 0.95, 0)])).toEqual([0, 1, 0, 2, 1]);
});
