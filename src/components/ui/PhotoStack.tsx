import React, { useState } from 'react';
import { DimensionValue, StyleProp, View, ViewStyle } from 'react-native';
import { fixed } from '../../theme/tokens';
import { Print } from './Print';

/**
 * Every photo stack in the app, in one geometry table copied from the mock's render functions (spec.json "shared").
 * Items are in paint order (back first). i = index into the photos (cover = 0); fewer photos than i repeat from the
 * start. center = horizontally centred (left 50% / translateX -50%). Rotation is around the print's centre.
 * w/h = the mock's content box (card inner width minus padding and 1px borders). Non-fixed stacks scale with the
 * width they get, keeping the mock's proportions; fixed ones keep their px size.
 */
type Item = {
  i: number; w: number; h: number; r: number; rot: number;
  top?: number; bottom?: number; left?: number; right?: number; center?: boolean;
  scale?: number; opacity?: number; border?: number; borderColor?: string; shadow?: string;
};
type Geometry = { w: number; h: number; fixed?: boolean; items: Item[] };

const WHITE60 = 'rgba(255,255,255,0.6)';
const SHADOW_SM = '0 1px 2px rgba(0,0,0,0.05)';
const P = fixed.printBorder;

export const STACKS = {
  /** Discover hero cover, 4 photos one on another (card p10 inside a 282 column). */
  hero: { w: 260, h: 168, items: [
    { i: 1, top: 8, left: 4, w: 114, h: 134, r: 9, rot: -6.5 },
    { i: 2, top: 6, right: 4, w: 112, h: 132, r: 9, rot: 6 },
    { i: 3, bottom: 4, left: 14, w: 74, h: 66, r: 8, rot: 4 },
    { i: 0, top: 8, center: true, w: 136, h: 146, r: 10, rot: -1.5 },
  ] },
  /** Discover bento, tall left tile (col-span 6, p8). */
  tall: { w: 119, h: 148, items: [
    { i: 1, top: 4, left: 4, w: 82, h: 84, r: 8, rot: -6 },
    { i: 2, top: 12, right: 4, w: 80, h: 84, r: 8, rot: 6.5 },
    { i: 0, bottom: 4, center: true, w: 96, h: 94, r: 9, rot: -1.8 },
  ] },
  /** Discover bento, top-right tile. */
  top: { w: 119, h: 60, items: [
    { i: 1, top: 4, left: 4, w: 54, h: 52, r: 7, rot: -6.5 },
    { i: 2, top: 4, right: 4, w: 54, h: 52, r: 7, rot: 5.5 },
    { i: 0, top: 2, center: true, w: 60, h: 54, r: 7, rot: -1.5 },
  ] },
  /** Discover bento, mid-right tile: top's sign pattern mirrored. */
  mid: { w: 119, h: 60, items: [
    { i: 1, top: 4, left: 4, w: 54, h: 52, r: 7, rot: 5 },
    { i: 2, top: 4, right: 4, w: 54, h: 52, r: 7, rot: -6 },
    { i: 0, top: 2, center: true, w: 60, h: 54, r: 7, rot: 2 },
  ] },
  /** Discover bento, full-width fan of 4, left to right. */
  wide: { w: 264, h: 68, items: [
    { i: 1, top: 4, left: 6, w: 74, h: 60, r: 7, rot: -5.5 },
    { i: 0, top: 2, left: 78, w: 76, h: 62, r: 7, rot: 3.5 },
    { i: 2, top: 4, right: 76, w: 74, h: 60, r: 7, rot: -3 },
    { i: 3, top: 2, right: 6, w: 74, h: 60, r: 7, rot: 4.5 },
  ] },
  /** Library rows (and Discover A): 56px fanned stack, back = photo 2. */
  row: { w: 56, h: 56, fixed: true, items: [
    { i: 2, top: 0, left: 0, w: 56, h: 56, r: 13, rot: -6, scale: 0.93, opacity: 0.85, border: 1, borderColor: WHITE60, shadow: SHADOW_SM },
    { i: 1, top: 0, left: 0, w: 56, h: 56, r: 13, rot: 5, scale: 0.96, opacity: 0.9, border: 1, borderColor: WHITE60, shadow: SHADOW_SM },
    { i: 0, top: 0, left: 0, w: 56, h: 56, r: 13, rot: 0, border: 1.5, borderColor: P, shadow: SHADOW_SM },
  ] },
  /** Create basket button: 2 selected photos (the count badge is the caller's). */
  basket: { w: 48, h: 44, fixed: true, items: [
    { i: 0, top: 4, left: 2, w: 32, h: 32, r: 7, rot: -16, border: 1.5, borderColor: P },
    { i: 1, top: 6, right: 2, w: 32, h: 32, r: 7, rot: 11, border: 1.5, borderColor: P },
  ] },
  /**
   * Create "2 ways to finish": one side (X or Y) of a collage, up to 3 alternating prints. Provisional, built from
   * the mock's alternation rule; the X+Y variant round may replace it.
   */
  xy: { w: 110, h: 84, items: [
    { i: 1, top: 8, left: 4, w: 58, h: 62, r: 7, rot: -6 },
    { i: 2, top: 8, right: 4, w: 58, h: 62, r: 7, rot: 6 },
    { i: 0, top: 4, center: true, w: 66, h: 72, r: 8, rot: -1.5 },
  ] },
} satisfies Record<string, Geometry>;

export type StackKind = keyof typeof STACKS;

type Props = { kind: StackKind; uris: string[]; /** px width; default = the width the parent gives */ width?: number; /** scales the prints' tilt (non-fixed stacks) */ tilt?: number; style?: StyleProp<ViewStyle>; /** locked dump: photos blurred past recognising */ blur?: number };

export function PhotoStack({ kind, uris, width, tilt = 1, style, blur }: Props) {
  const g: Geometry = STACKS[kind];
  const [measured, setMeasured] = useState(0);
  const W = g.fixed ? g.w : width ?? measured;
  const s = W / g.w;
  const box: ViewStyle = g.fixed ? { width: g.w, height: g.h } : { width: (width ?? '100%') as DimensionValue, aspectRatio: g.w / g.h };

  return (
    <View
      pointerEvents="none"
      style={[box, style]}
      onLayout={g.fixed || width ? undefined : (e) => setMeasured(e.nativeEvent.layout.width)}
    >
      {W > 0 && uris.length > 0 && g.items.map((it, k) => {
        const n = (v?: number) => (v == null ? undefined : v * s);
        const print = (
          <Print
            uri={uris[it.i % uris.length]}
            w={it.w * s}
            h={it.h * s}
            r={it.r * s}
            border={it.border}
            borderColor={it.borderColor}
            blur={blur}
            style={[
              { transform: [{ rotate: `${g.fixed ? it.rot : it.rot * tilt}deg` }, { scale: it.scale ?? 1 }], opacity: it.opacity },
              it.shadow ? { boxShadow: it.shadow } : null,
              it.center ? null : { position: 'absolute', top: n(it.top), bottom: n(it.bottom), left: n(it.left), right: n(it.right) },
            ]}
          />
        );
        return it.center ? (
          <View key={k} style={{ position: 'absolute', left: 0, right: 0, top: n(it.top), bottom: n(it.bottom), alignItems: 'center' }}>
            {print}
          </View>
        ) : (
          <React.Fragment key={k}>{print}</React.Fragment>
        );
      })}
    </View>
  );
}
