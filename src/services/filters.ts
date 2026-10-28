/**
 * Edit filters: the mock's CSS filter recipes (FILTER_PRESETS) as 4x5 colour matrices for Skia's ColorMatrix,
 * scaled by intensity p (0..1). Matrices are row-major [r g b a offset] with offsets in 0..1. Pure (selfcheck).
 * Unlike CSS there is no clamp between steps; the difference is invisible at these strengths.
 */

export type FilterKey = 'warm35' | 'cashmere' | 'grain' | 'sunfade' | 'noir' | 'none';
export type Look = { key: FilterKey; pct: number };
/** Saved per dump: the look for every photo, or (all = false) per-photo looks that fall back to it. */
export type FilterState = Look & { all: boolean; per: Record<string, Look> };

export const DEFAULT_FILTER: FilterState = { key: 'none', pct: 68, all: true, per: {} };

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

/** The look a photo gets. */
export const lookFor = (f: FilterState, photoId: string): Look => (f.all ? f : f.per[photoId] ?? f);

/** Reads the dump's saved filter column (older / empty rows get the default). */
export function filterOf(raw: unknown): FilterState {
  const r = (raw ?? {}) as Partial<FilterState>;
  return { ...DEFAULT_FILTER, ...r, per: r.per ?? {} };
}

export const IDENTITY = I;

/** Looks a free user can export (Pro previews the rest freely, docs/superpowers/specs/2026-10-28-monetization-design.md). */
const FREE_LOOKS: FilterKey[] = ['none', 'warm35'];
export const isProLook = (k: FilterKey) => !FREE_LOOKS.includes(k);

/** Looks that actually show on some photo: apply-to-all hides the per-photo ones; 0% is untouched. */
const shown = (f: FilterState): Look[] => (f.all ? [f] : [f, ...Object.values(f.per)]).filter((l) => l.key !== 'none' && l.pct > 0);
export const usesProLook = (f: FilterState) => shown(f).some((l) => isProLook(l.key));

/** "Export without finish": every Pro look back to Original, strengths kept. */
export function withoutProLooks(f: FilterState): FilterState {
  const free = (l: Look): Look => (isProLook(l.key) ? { ...l, key: 'none' } : l);
  return { ...f, ...free(f), per: Object.fromEntries(Object.entries(f.per).map(([id, l]) => [id, free(l)])) };
}
