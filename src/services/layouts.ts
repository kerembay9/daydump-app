/** Size & Edit geometry: post sizes, collage layouts and how a dump's photos are chunked into slides. Pure (selfcheck). */

export const RATIOS = [
  { key: '4:5', sub: 'IG Post', w: 4, h: 5, glyph: [12, 15] },
  { key: '1:1', sub: 'Square', w: 1, h: 1, glyph: [14, 14] },
  { key: '9:16', sub: 'TikTok', w: 9, h: 16, glyph: [10, 16] },
  { key: '3:4', sub: 'Film 35', w: 3, h: 4, glyph: [12, 16] },
] as const;
export type RatioKey = (typeof RATIOS)[number]['key'];
export const ratioOf = (key?: string | null) => RATIOS.find((r) => r.key === key) ?? RATIOS[0];

export const LAYOUTS = [
  { key: 'single', label: '1 Photo', n: 1 },
  { key: 'split', label: '2 Split', n: 2 },
  { key: 'bento', label: '3 Bento', n: 3 },
  { key: 'grid', label: '2×2 Grid', n: 4 },
  { key: 'scrapbook', label: 'Scrapbook', n: 3 },
] as const;
export type LayoutKey = (typeof LAYOUTS)[number]['key'];
export const layoutOf = (key?: string | null) => LAYOUTS.find((l) => l.key === key) ?? LAYOUTS[0];

export type Fit = 'bleed' | 'border';
export const fitOf = (f?: string | null): Fit => (f === 'border' ? 'border' : 'bleed');

/** A short last chunk can't fill the layout: 1 photo -> single, 2 -> split, 3 -> bento. */
const FALLBACK: LayoutKey[] = ['single', 'single', 'split', 'bento'];

/**
 * The dump's photos in order, n per slide (n = the layout's photo count), no photo repeated or dropped. The last
 * slide takes what's left and uses the layout for that many photos.
 */
export function chunk<T>(photos: T[], layout: LayoutKey): { layout: LayoutKey; photos: T[] }[] {
  const n = layoutOf(layout).n;
  const out: { layout: LayoutKey; photos: T[] }[] = [];
  for (let i = 0; i < photos.length; i += n) {
    const part = photos.slice(i, i + n);
    out.push({ layout: part.length === n ? layout : FALLBACK[part.length], photos: part });
  }
  return out;
}

/** Mock canvas width (px) every size below is drawn at; scale by slideWidth / UNIT. */
export const UNIT = 288;

export type Cell = { x: number; y: number; w: number; h: number; r: number; rot: number; border: number; borderColor: string | null; shadow: boolean };

const box = (x: number, y: number, w: number, h: number, r = 0): Cell => ({ x, y, w, h, r, rot: 0, border: 0, borderColor: null, shadow: false });

/**
 * Where each photo of a slide goes in a W x H slide (photo i -> cells[i]), plus the matte area. Border = Cashmere
 * matte: 14 (mock px) inset, radius 14, shadow. Gaps are 3 mock px. Scrapbook = 3 tilted prints on the card colour.
 */
export function slideCells(layout: LayoutKey, fit: Fit, W: number, H: number): { inner: Cell; cells: Cell[] } {
  const u = W / UNIT;
  const pad = fit === 'border' ? 14 * u : 0;
  const inner = { ...box(pad, pad, W - 2 * pad, H - 2 * pad, fit === 'border' ? 14 * u : 0), shadow: fit === 'border' };
  const { x, y, w, h } = inner;
  const g = 3 * u;
  const hw = (w - g) / 2, hh = (h - g) / 2;
  switch (layout) {
    case 'split':
      return { inner, cells: [box(x, y, hw, h), box(x + hw + g, y, hw, h)] };
    case 'bento': {
      const big = ((w - g) * 3) / 5;
      return { inner, cells: [box(x, y, big, h), box(x + big + g, y, w - big - g, hh), box(x + big + g, y + hh + g, w - big - g, hh)] };
    }
    case 'grid':
      return { inner, cells: [box(x, y, hw, hh), box(x + hw + g, y, hw, hh), box(x, y + hh + g, hw, hh), box(x + hw + g, y + hh + g, hw, hh)] };
    case 'scrapbook': {
      // mock: f1 top-left 46%x58% -6.5deg, f2 bottom-right +6deg, f0 centred 58%x74% -1.5deg with a 2px cream edge.
      // Tall slides (9:16, 3:4) widen the prints up to ~1:1.6 so they don't turn into strips.
      const m = 12 * u;
      const fw = Math.min(w * 0.72, Math.max(w * 0.58, (h * 0.74) / 1.6)), fh = Math.min(h * 0.74, fw * 1.75);
      const bw = Math.min(w * 0.56, Math.max(w * 0.46, (h * 0.58) / 1.6)), bh = Math.min(h * 0.58, bw * 1.6);
      // a tilted print's corners swing out past its box: keep that overhang inside the margin too
      const swing = (deg: number) => {
        const r = (Math.abs(deg) * Math.PI) / 180;
        return [(bw * Math.cos(r) + bh * Math.sin(r) - bw) / 2, (bw * Math.sin(r) + bh * Math.cos(r) - bh) / 2];
      };
      const back = (cx: number, cy: number, rot: number): Cell => ({ ...box(cx, cy, bw, bh, 9 * u), rot, border: u, borderColor: 'rgba(255,255,255,0.5)', shadow: true });
      const [s1x, s1y] = swing(6.5), [s2x, s2y] = swing(6);
      return {
        inner,
        cells: [
          { ...box(x + (w - fw) / 2, y + (h - fh) / 2, fw, fh, 11 * u), rot: -1.5, border: 2 * u, borderColor: '#FAF6F0', shadow: true },
          back(x + m + s1x, y + m + s1y, -6.5),
          back(x + w - m - s2x - bw, y + h - m - s2y - bh, 6),
        ],
      };
    }
    default:
      return { inner, cells: [box(x, y, w, h)] };
  }
}

/** The part of a photo a cell shows: centre (x, y) as a share of the photo's width / height, zoom z (1 = just covers). */
export type Crop = { x: number; y: number; z: number };
export const CENTRED: Crop = { x: 0.5, y: 0.5, z: 1 };
export const MAX_ZOOM = 4;

/**
 * Where a photo (iw x ih) draws in a w x h cell: covering it, zoomed z, centred on (x, y) as far as the photo's edges
 * allow (so it never leaves a gap). dx / dy are from the cell's top-left; crop is the clamped crop actually shown.
 */
export function placePhoto(w: number, h: number, iw: number, ih: number, crop?: Crop) {
  'worklet'; // also runs in the Edit canvas's crop gestures, on the UI thread
  const c = crop ?? CENTRED; // not a default param: the worklet reads its closure in the body, after params, so CENTRED was undefined there
  const z = Math.min(MAX_ZOOM, Math.max(1, c.z));
  const s = Math.max(w / iw, h / ih) * z;
  const dw = iw * s, dh = ih * s;
  const hx = w / dw / 2, hy = h / dh / 2;
  const x = Math.min(1 - hx, Math.max(hx, c.x)), y = Math.min(1 - hy, Math.max(hy, c.y));
  return { crop: { x, y, z }, dx: w / 2 - x * dw, dy: h / 2 - y * dh, dw, dh };
}

/** The top-most cell under (x, y) in a slide, or -1. Tilt ignored (a few degrees). */
export function cellAt(cells: Cell[], layout: LayoutKey, x: number, y: number) {
  const hit = paintOrder(layout, cells.length).filter((i) => { const c = cells[i]; return x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h; });
  return hit.length ? hit[hit.length - 1] : -1;
}

/** Paint order: scrapbook's cover (cell 0) goes on top of the two back prints. */
export const paintOrder = (layout: LayoutKey, n: number) => (layout === 'scrapbook' ? [1, 2, 0] : [0, 1, 2, 3]).filter((i) => i < n);

/** Export size in px: 1080 wide (2160 with High-Res), height from the ratio. */
export const exportSize = (ratio: string | null | undefined, highRes = false) => {
  const r = ratioOf(ratio);
  const W = highRes ? 2160 : 1080;
  return { width: W, height: Math.round((W * r.h) / r.w) };
};
