import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BlurMask, Canvas, ColorMatrix, FractalNoise, Path, Skia, SkPath } from '@shopify/react-native-skia';
import { hash } from './Tape';
import { useTheme } from '../../theme/ThemeProvider';
import type { Profile } from '../../services/profile';

/** Developer tools → Cards: Discover's rounded cards (classic), or paper sheets held by tone masking tape (paper) or torn matte colour tape (tinted). */
export type CardStyle = Profile['cards'];
export type PaperStyle = Exclude<CardStyle, 'classic'>;

/** cream, oat, pale sage, blush: one lightness, different hues */
export const STOCKS = ['#FAF2E2', '#EFE4CD', '#E9E8D6', '#F3E4DA'];
/** dark mode: warm charcoals, a step above Espresso's screen */
export const DARK_STOCKS = ['#34302B', '#2F2C28', '#383330', '#312E2A'];
export const TAPE_TONES: Record<PaperStyle, string[]> = {
  paper: ['rgba(224,206,170,0.82)', 'rgba(214,194,156,0.8)', 'rgba(232,218,190,0.84)'],
  // matte pastels at one depth: light blue, sage, dusty rose, butter, lilac
  tinted: ['rgba(176,198,216,0.88)', 'rgba(184,202,172,0.88)', 'rgba(222,184,172,0.88)', 'rgba(228,208,152,0.88)', 'rgba(200,190,216,0.88)'],
};
const DECKLE = 2, SKEW = 2, STEP = 6;
const OUT = 10; // the canvas reaches past the card for the shadow

/** Seeded 0..1 (mulberry32): the same paper for the same story every render. */
const rng = (seed: string) => {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A deckled sheet: each edge wanders up to DECKLE px inward, a point every STEP px, and each corner sits up to SKEW px off square. */
function sheet(w: number, h: number, seed: string): SkPath {
  const r = rng(seed), sk = rng(`${seed}:skew`);
  const p = Skia.PathBuilder.Make();
  const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => [sx * sk() * SKEW, sy * sk() * SKEW]);
  const side = (i: number, x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / STEP));
    const a = c[i], b = c[(i + 1) % 4];
    for (let k = 1; k <= n; k++) {
      const f = k / n, d = k === n ? 0 : r() * DECKLE;
      p.lineTo(x0 + (x1 - x0) * f + nx * d + a[0] + (b[0] - a[0]) * f, y0 + (y1 - y0) * f + ny * d + a[1] + (b[1] - a[1]) * f);
    }
  };
  p.moveTo(c[0][0], c[0][1]);
  side(0, 0, 0, w, 0, 0, 1); side(1, w, 0, w, h, -1, 0); side(2, w, h, 0, h, 0, -1); side(3, 0, h, 0, 0, 1, 0);
  return p.close().build();
}

// fine specks: noise → sepia, alpha 1.5 * noise - 0.97 (as Discover's Paper)
const SPECKS = [0, 0, 0, 0, 0.35, 0, 0, 0, 0, 0.23, 0, 0, 0, 0, 0.09, 1.5, 0, 0, 0, -0.97];
const LIGHT_SPECKS = [0, 0, 0, 0, 0.95, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0.8, 1.2, 0, 0, 0, -0.85]; // cream specks on charcoal

/** A card's paper, drawn behind its content (FrameCard paper). Static: one canvas, redrawn only on a size change. */
export function ScrapPaper({ seed }: { seed: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const path = useMemo(() => size && sheet(size.w, size.h, seed), [size, seed]);
  const { t } = useTheme();
  const stocks = t.dark ? DARK_STOCKS : STOCKS;
  const stock = stocks[hash(`${seed}:stock`) % stocks.length];
  const at = [{ translateX: OUT }, { translateY: OUT }];
  return (
    <View testID="scrap-paper" pointerEvents="none" style={{ position: 'absolute', top: -OUT, left: -OUT, right: -OUT, bottom: -OUT }}
      onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setSize({ w: width - 2 * OUT, h: height - 2 * OUT }); }}>
      {path && (
        <Canvas style={{ flex: 1 }}>
          <Path path={path} color={t.dark ? 'rgba(0,0,0,0.55)' : 'rgba(60,38,16,0.26)'} transform={[{ translateX: OUT }, { translateY: OUT + 2.5 }]}><BlurMask blur={3.5} style="normal" /></Path>
          <Path path={path} color={stock} transform={at} />
          <Path path={path} transform={at}>
            <FractalNoise freqX={1.1} freqY={1.1} octaves={1} seed={11} />
            <ColorMatrix matrix={t.dark ? LIGHT_SPECKS : SPECKS} />
          </Path>
        </Canvas>
      )}
    </View>
  );
}

/** A torn strip of paper tape: ragged short ends, a slight wobble along the long edges, a faint hard shadow. */
function TornTape({ seed, w, h, color }: { seed: string; w: number; h: number; color: string }) {
  const path = useMemo(() => {
    const r = rng(`${seed}:tape`);
    const p = Skia.PathBuilder.Make();
    const end = (x: number, dir: 1 | -1) => { // walk a short end top to bottom (dir 1, right end) or bottom to top (left end)
      const n = Math.max(4, Math.round(h / 2.2));
      for (let k = 1; k < n; k++) p.lineTo(x - dir * r() * 2.8, (dir === 1 ? k / n : 1 - k / n) * h);
    };
    const long = (y: number, x0: number, x1: number) => { const n = Math.round(Math.abs(x1 - x0) / 10); for (let k = 1; k <= n; k++) p.lineTo(x0 + ((x1 - x0) * k) / n, y + (r() - 0.5) * 0.7); };
    p.moveTo(0, 0);
    long(0, 0, w); end(w, 1); p.lineTo(w, h); long(h, w, 0); end(0, -1);
    return p.close().build();
  }, [seed, w, h]);
  return (
    <Canvas testID="scrap-tape" style={{ width: w + 2, height: h + 2 }}>
      <Path path={path} color="rgba(60,38,16,0.14)" transform={[{ translateX: 0.5 }, { translateY: 1.2 }]} />
      <Path path={path} color={color} />
    </Canvas>
  );
}

/** Masking tape as in Bands "more": a flat strip with dashed ends, no shadow. */
function MaskingTape({ w, h, color }: { w: number; h: number; color: string }) {
  const { t } = useTheme();
  return <View testID="scrap-tape" style={{ width: w, height: h, borderRadius: 2, backgroundColor: color, borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.tapeBorder, borderStyle: 'dashed' }} />;
}

type Spot = 'centre' | 'offset' | 'side' | 'left' | 'right';
/** paper: masking strips mostly across the top (centre, off-centre), else a corner or both top corners. tinted: one torn strip in one of five spots. */
const SPOTS: Record<PaperStyle, (Spot | Spot[])[]> = {
  paper: ['centre', 'offset', 'left', 'right', ['left', 'right']],
  tinted: ['centre', 'left', 'right', 'offset', 'side'],
};

/** A paper card's tape, by story. Render as the card's last child so it tilts with the card. */
export function ScrapTapes({ id, style }: { id: string; style: PaperStyle }) {
  const torn = style !== 'paper', jitter = torn ? 1.2 : 0.6, tones = TAPE_TONES[style];
  const strip = (spot: Spot) => {
    const key = `${id}:${spot}`, h = hash(key), j = (n: number) => (((h >>> n) % 100) / 100 - 0.5) * jitter; // ±jitter/2, from bits n..
    const corner = spot === 'left' || spot === 'right';
    const w = Math.round((corner ? 46 : 62) * (1 + j(3) * 0.7)), th = Math.round(18 * (1 + j(9) * 0.35));
    const rot = { centre: 0, offset: -7, side: 78, left: -40, right: 40 }[spot] + (h % 2 ? 3 : -3) + j(15) * 14;
    const pos = spot === 'centre' ? { top: -th / 2, left: 0, right: 0, alignItems: 'center' as const }
      : spot === 'offset' ? { top: -th / 2, left: '14%' as const }
      : spot === 'side' ? { top: '28%' as const, right: -w / 2 + 4 }
      : { top: 9 - th / 2, [spot]: 9 - w / 2 };
    const color = tones[h % tones.length];
    return (
      <View key={spot} testID="scrap-strip" pointerEvents="none" style={[{ position: 'absolute', zIndex: 20 }, pos]}>
        <View style={{ transform: [{ rotate: `${rot}deg` }] }}>
          {torn ? <TornTape seed={key} w={w} h={th} color={color} /> : <MaskingTape w={w} h={th} color={color} />}
        </View>
      </View>
    );
  };
  const spots = SPOTS[style], at = spots[hash(id) % spots.length];
  return <>{(Array.isArray(at) ? at : [at]).map(strip)}</>;
}
