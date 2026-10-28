import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { type Profile, useProfile } from '../../services/profile';

/** Developer tools → Bands: none, the one masking tape per card (default), or scrapbook tape on every card. */
export type Bands = Profile['bands'];
export const useBands = (): Bands => useProfile().bands;

// tape rolls: semi-opaque so the card shows through, readable on cashmere and espresso
const ROLLS = ['rgba(236,150,160,0.72)', 'rgba(140,200,170,0.72)', 'rgba(230,190,90,0.74)', 'rgba(130,175,220,0.72)',
  'rgba(180,155,215,0.72)', 'rgba(205,172,130,0.74)', 'rgba(240,140,110,0.7)'];
export const hash = (s: string | number) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
/** Bands "more": every strip is this tall; an edge strip is EDGE_W long, a corner one CORNER_W (short, so it stays off the photo). */
export const TAPE_H = 18, EDGE_W = 64, CORNER_W = 46;
const INSET = 9;

/** One seeded roll: colour and a small tilt jitter, the same every render for the same seed. */
const roll = (seed: string | number) => { const h = hash(seed); return { color: ROLLS[h % ROLLS.length], jitter: ((h >> 7) % 7) - 3 }; };

function useStrip(w: number, h: number, color: string, rotate: number, shadow: boolean): ViewStyle {
  const { t } = useTheme();
  return {
    width: w, height: h, borderRadius: 2, backgroundColor: color,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.tapeBorder, borderStyle: 'dashed',
    // more: many strips on Discover, so no shadow (Android shadows on tilted cards cost frames, FrameCard)
    boxShadow: shadow ? fixed.tapeShadow : undefined, transform: [{ rotate: `${rotate}deg` }],
  };
}

/**
 * Masking tape: 56x16, radius 2, dashed left/right edges. Default placement = Discover hero: top 0, centred, -2deg,
 * above the card (render it after the card). No backdrop blur on Android; the semi-opaque fill stands in.
 * Bands "more": a plain TAPE_H x EDGE_W strip in a seeded colour; "none": nothing.
 */
export function Tape({ rotate = -2, seed = 0, style }: { rotate?: number; seed?: string | number; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme();
  const bands = useBands();
  const r = roll(seed);
  const more = bands === 'more';
  const strip = useStrip(more ? EDGE_W : 56, more ? TAPE_H : 16, more ? r.color : t.tapeBg, rotate + (more ? r.jitter : 0), !more);
  if (bands === 'none') return null;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 20 }, style]}>
      <View testID="tape" style={strip} />
    </View>
  );
}

/**
 * Bands "more": a short strip held diagonally across a card's top corner. Centred INSET px in from both edges, past the rounded
 * corner (radius 14-16), so it always grips the card and reaches only ~6 px past the card's padding. Render it as the card's last child so it tilts with the card.
 */
export function CornerTape({ seed, side }: { seed: string | number; side: 'left' | 'right' }) {
  const r = roll(seed);
  const strip = useStrip(CORNER_W, TAPE_H, r.color, (side === 'left' ? -40 : 40) + r.jitter, false);
  if (useBands() !== 'more') return null;
  const at = INSET - CORNER_W / 2;
  return <View testID="tape" pointerEvents="none" style={[strip, { position: 'absolute', zIndex: 20, top: INSET - TAPE_H / 2, [side]: at }]} />;
}
