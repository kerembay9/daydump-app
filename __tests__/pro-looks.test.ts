import { DEFAULT_FILTER, developFor, FilterState, hasTexture, isProLook, keepLooksFor, usesProLook as uses, withoutProLooks } from '../src/services/filters';

const f = (x: Partial<FilterState>): FilterState => ({ ...DEFAULT_FILTER, ...x });
/** a two-photo dump, a and b */
const usesProLook = (x: FilterState, ids = ['a', 'b']) => uses(x, ids);

test('Original and Warm 35mm are free, the rest are Pro', () => {
  expect(isProLook('none')).toBe(false);
  expect(isProLook('warm35')).toBe(false);
  for (const k of ['cashmere', 'grain', 'sunfade', 'noir'] as const) expect(isProLook(k)).toBe(true);
});

test('a dump uses a Pro look only when one actually shows', () => {
  expect(usesProLook(f({ key: 'cashmere', pct: 68 }))).toBe(true);
  expect(usesProLook(f({ key: 'cashmere', pct: 0 }))).toBe(false);
  expect(usesProLook(f({ key: 'warm35', pct: 68 }))).toBe(false);
  // a photo's own look counts
  expect(usesProLook(f({ key: 'warm35', per: { a: { key: 'noir', pct: 50 } } }))).toBe(true);
  expect(usesProLook(f({ key: 'warm35', per: { a: { key: 'warm35', pct: 50 } } }))).toBe(false);
});

test('any texture is Pro, on the dump or on one photo, even over Original', () => {
  expect(hasTexture({ key: 'none', pct: 68 })).toBe(false);
  expect(hasTexture({ key: 'none', pct: 68, grain: 0 })).toBe(false);
  expect(hasTexture({ key: 'none', pct: 68, vignette: 1 })).toBe(true);
  expect(usesProLook(f({ key: 'none', fade: 30 }))).toBe(true);
  expect(usesProLook(f({ key: 'warm35', pct: 68, per: { a: { key: 'none', pct: 68, grain: 40 } } }))).toBe(true);
});

test('Adjust is free', () => {
  expect(usesProLook(f({ adj: { a: { light: 40, contrast: -20, shadows: 30, warmth: 10, saturation: 8, sharpen: 20 } } }))).toBe(false);
});

test('without Pro looks: Pro ones become Original, free ones stay, texture goes, Adjust stays', () => {
  const adj = { a: { light: 25, sharpen: 20 } };
  const out = withoutProLooks(f({
    key: 'noir', pct: 40, grain: 30, vignette: 20, adj,
    per: { a: { key: 'sunfade', pct: 50, fade: 10 }, b: { key: 'warm35', pct: 30, grain: 5 } },
  }));
  expect(out).toEqual(f({ key: 'none', pct: 40, adj, per: { a: { key: 'none', pct: 50 }, b: { key: 'warm35', pct: 30 } } }));
  expect(usesProLook(out)).toBe(false);
  // what's drawn: no grain or vignette left, Adjust's light still in the matrix
  const d = developFor(out, 'a');
  expect([d.grain, d.vignette]).toEqual([0, 0]);
  expect(d.matrix).not.toBeNull();
  expect(d.sharpen).toBeCloseTo(0.2);
});

test('only the photos in the dump count, and the dump look only where a photo has none of its own', () => {
  // a removed photo's own Pro look is left behind in per: it doesn't ask
  expect(usesProLook(f({ key: 'warm35', per: { gone: { key: 'noir', pct: 50 } } }))).toBe(false);
  expect(usesProLook(f({ key: 'warm35', per: { gone: { key: 'none', pct: 50, grain: 20 } } }))).toBe(false);
  // every photo has its own free look: the dump's Pro look draws nothing
  const own = { a: { key: 'warm35', pct: 50 }, b: { key: 'none', pct: 68 } } as const;
  expect(usesProLook(f({ key: 'cashmere', pct: 68, grain: 20, per: own }))).toBe(false);
  // one photo without its own look shows the dump's
  expect(usesProLook(f({ key: 'cashmere', pct: 68, per: { a: own.a } }))).toBe(true);
  // no photos, nothing drawn
  expect(usesProLook(f({ key: 'cashmere', pct: 68 }), [])).toBe(false);
});

test('keepLooksFor drops removed photos\' own looks and Adjust, and is a no-op when nothing goes', () => {
  const x = f({ key: 'noir', pct: 40, per: { a: { key: 'sunfade', pct: 50 }, b: { key: 'warm35', pct: 30 } }, adj: { a: { light: 10 }, b: { light: 20 } } });
  expect(keepLooksFor(x, ['b', 'c'])).toEqual({ ...x, per: { b: { key: 'warm35', pct: 30 } }, adj: { b: { light: 20 } } });
  expect(keepLooksFor(x, ['a', 'b'])).toBe(x);
});
