/**
 * Edit filters: the mock's CSS filter recipes (FILTER_PRESETS) as 4x5 colour matrices for Skia's ColorMatrix,
 * scaled by intensity p (0..1). Matrices are row-major [r g b a offset] with offsets in 0..1. Pure (selfcheck).
 * Unlike CSS there is no clamp between steps; the difference is invisible at these strengths.
 */

export type FilterKey = 'warm35' | 'cashmere' | 'grain' | 'sunfade' | 'noir' | 'none';
/** Texture (Photos tab), 0-100; part of a look, so a photo with its own look has its own texture too. */
export type Tex = { grain: number; fade: number; vignette: number };
export type Look = { key: FilterKey; pct: number } & Partial<Tex>;
/** Adjust (Photos tab): always per photo, -100..100 (sharpen 0..100). */
export const ADJUSTS = [
  { key: 'light', label: 'Light', min: -100 },
  { key: 'contrast', label: 'Contrast', min: -100 },
  { key: 'shadows', label: 'Shadows', min: -100 },
  { key: 'warmth', label: 'Warmth', min: -100 },
  { key: 'saturation', label: 'Saturation', min: -100 },
  { key: 'sharpen', label: 'Sharpen', min: 0 },
] as const;
export type AdjKey = (typeof ADJUSTS)[number]['key'];
export type Adjust = Partial<Record<AdjKey, number>>;
/** Saved per dump: the dump's look, the photos that have their own (Photos tab, "This photo"), and each photo's Adjust. */
export type FilterState = Look & { per: Record<string, Look>; adj: Record<string, Adjust> };

export const DEFAULT_FILTER: FilterState = { key: 'none', pct: 68, per: {}, adj: {} };

type M = number[];
const I: M = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** 3x3 RGB matrix -> 4x5 */
const rgb = (m: number[], off = 0): M => [m[0], m[1], m[2], 0, off, m[3], m[4], m[5], 0, off, m[6], m[7], m[8], 0, off, 0, 0, 0, 1, 0];

// W3C Filter Effects 1, section 13 (shorthand equivalents)
const sepia = (a: number) => {
  const k = 1 - Math.min(1, a);
  return rgb([0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k]);
};
const saturate = (s: number) => rgb([0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]);
const grayscale = (a: number) => {
  const k = 1 - Math.min(1, a);
  return rgb([0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k]);
};
const brightness = (b: number) => rgb([b, 0, 0, 0, b, 0, 0, 0, b]);
const contrast = (c: number) => rgb([c, 0, 0, 0, c, 0, 0, 0, c], (1 - c) / 2);

/** a after b (apply b first), both 4x5 with an implied [0 0 0 0 1] row. */
function then(b: M, a: M): M {
  const out: M = new Array(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? a[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += a[r * 5 + k] * b[k * 5 + c];
      out[r * 5 + c] = v;
    }
  }
  return out;
}
/** CSS order: the first function is applied first. */
const chain = (...ms: M[]) => ms.reduce(then, I);

export const PRESETS: { key: FilterKey; label: string; swatch: string; matrix: (p: number) => M }[] = [
  { key: 'warm35', label: 'Warm 35mm', swatch: '#E4B98A', matrix: (p) => chain(sepia(0.38 * p), saturate(1 + 0.28 * p), contrast(1 + 0.08 * p), brightness(1 + 0.03 * p)) },
  { key: 'cashmere', label: 'Cashmere', swatch: '#DFCFC0', matrix: (p) => chain(sepia(0.26 * p), brightness(1 + 0.07 * p), contrast(1 - 0.06 * p), saturate(1 - 0.12 * p)) },
  { key: 'grain', label: 'Soft Film', swatch: '#C6B4A3', matrix: (p) => chain(contrast(1 + 0.18 * p), sepia(0.18 * p), brightness(1 - 0.03 * p)) },
  { key: 'sunfade', label: 'Sunfade', swatch: '#F2D2A9', matrix: (p) => chain(sepia(0.32 * p), brightness(1 + 0.1 * p), saturate(1 + 0.18 * p)) },
  { key: 'noir', label: 'B&W Roll', swatch: '#524C48', matrix: (p) => chain(grayscale(p), contrast(1 + 0.22 * p)) },
  { key: 'none', label: 'Original', swatch: '#FAF4EE', matrix: () => I },
];

export const presetOf = (key: FilterKey) => PRESETS.find((p) => p.key === key) ?? PRESETS[PRESETS.length - 1];

/** Colour matrix for a look; null = untouched (Original or 0%). */
export function matrixFor(look: Look): M | null {
  if (look.key === 'none' || look.pct <= 0) return null;
  return presetOf(look.key).matrix(Math.min(100, look.pct) / 100);
}

/** The look a photo gets: its own, else the dump's. */
export const lookFor = (f: FilterState, photoId: string): Look => f.per[photoId] ?? lookOf(f);
/** The dump's own look, without the per-photo maps (so copying it into per never nests them). */
export const lookOf = ({ per: _p, adj: _a, ...l }: FilterState): Look => l;

/** The photo has edits of its own (a look or an adjustment): the filmstrip dot. */
export const editedOwn = (f: FilterState, id: string) => !!f.per[id] || Object.values(f.adj[id] ?? {}).some(Boolean);

/** How a photo is drawn: one colour matrix (adjust, look, fade), then the non-linear bits (shaders / overlays), 0..1. */
export type Develop = { matrix: M | null; shadows: number; sharpen: number; grain: number; vignette: number };

export function developFor(f: FilterState, id: string): Develop {
  const l = lookFor(f, id), a = f.adj[id] ?? {};
  const v = (k: AdjKey) => (a[k] ?? 0) / 100;
  const fade = (l.fade ?? 0) / 100, w = v('warmth');
  const parts: M[] = [];
  if (v('light')) parts.push(brightness(1 + 0.4 * v('light')));
  if (v('contrast')) parts.push(contrast(1 + 0.35 * v('contrast')));
  if (w) parts.push(rgb([1 + 0.08 * w, 0, 0, 0, 1 + 0.01 * w, 0, 0, 0, 1 - 0.1 * w]));
  if (v('saturation')) parts.push(saturate(1 + 0.8 * v('saturation')));
  const look = matrixFor(l);
  if (look) parts.push(look);
  // fade lifts the blacks (0 -> k, 1 stays 1) and takes a little colour out
  if (fade) parts.push(saturate(1 - 0.25 * fade), rgb([1 - 0.2 * fade, 0, 0, 0, 1 - 0.2 * fade, 0, 0, 0, 1 - 0.2 * fade], 0.2 * fade));
  return { matrix: parts.length ? chain(...parts) : null, shadows: v('shadows'), sharpen: v('sharpen'), grain: (l.grain ?? 0) / 100, vignette: (l.vignette ?? 0) / 100 };
}

/** A photo's tone, 0..1, from a small copy: mean luminance, its spread, share of crushed / blown pixels, blue minus red. */
export type Tone = { mean: number; sd: number; lo: number; hi: number; cast: number };

export const isDark = (t: Tone | null) => !!t && t.mean < 0.34;

/** Auto: what Adjust's sliders get, toward mid-grey exposure, a normal spread and no colour cast. */
export function autoAdjust(t: Tone): Adjust {
  const c = (x: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, x)));
  return {
    light: c((0.46 - t.mean) * 200, -50, 60),
    contrast: c((0.2 - t.sd) * 150, -25, 35),
    shadows: t.lo > 0.05 ? c(t.lo * 250, 0, 55) : 0,
    warmth: c(t.cast * 150, -30, 30),
    saturation: 8,
    sharpen: 20,
  };
}

/** Brighten (dark photo): Auto's light and shadows, at least a clear step up. */
export function brighten(t: Tone, a: Adjust): Adjust {
  const auto = autoAdjust(t);
  return { ...a, light: Math.max(25, auto.light ?? 0), shadows: Math.max(30, auto.shadows ?? 0) };
}

/**
 * Reads the dump's saved filter column (older / empty rows get the default). Rows from before per-photo looks carry
 * `all`: all = true always had per = {}, and all = false meant per-photo looks, which is what per means now.
 */
export function filterOf(raw: unknown): FilterState {
  const r = (raw ?? {}) as Partial<FilterState>;
  const tex = (['grain', 'fade', 'vignette'] as const).filter((k) => r[k]).reduce((o, k) => ({ ...o, [k]: r[k] }), {});
  return { key: r.key ?? DEFAULT_FILTER.key, pct: r.pct ?? DEFAULT_FILTER.pct, ...tex, per: r.per ?? {}, adj: r.adj ?? {} };
}

export const IDENTITY = I;
