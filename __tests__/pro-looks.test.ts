import { DEFAULT_FILTER, FilterState, isProLook, usesProLook, withoutProLooks } from '../src/services/filters';

const f = (x: Partial<FilterState>): FilterState => ({ ...DEFAULT_FILTER, ...x });

test('Original and Warm 35mm are free, the rest are Pro', () => {
  expect(isProLook('none')).toBe(false);
  expect(isProLook('warm35')).toBe(false);
  for (const k of ['cashmere', 'grain', 'sunfade', 'noir'] as const) expect(isProLook(k)).toBe(true);
});

test('a dump uses a Pro look only when one actually shows', () => {
  expect(usesProLook(f({ key: 'cashmere', pct: 68 }))).toBe(true);
  expect(usesProLook(f({ key: 'cashmere', pct: 0 }))).toBe(false);
  // apply-to-all: per-photo looks don't show
  expect(usesProLook(f({ key: 'warm35', all: true, per: { a: { key: 'noir', pct: 50 } } }))).toBe(false);
  expect(usesProLook(f({ key: 'warm35', all: false, per: { a: { key: 'noir', pct: 50 } } }))).toBe(true);
});

test('without Pro looks: Pro ones become Original, free ones stay', () => {
  const out = withoutProLooks(f({ key: 'noir', pct: 40, all: false, per: { a: { key: 'sunfade', pct: 50 }, b: { key: 'warm35', pct: 30 } } }));
  expect(out).toEqual(f({ key: 'none', pct: 40, all: false, per: { a: { key: 'none', pct: 50 }, b: { key: 'warm35', pct: 30 } } }));
  expect(usesProLook(out)).toBe(false);
});
