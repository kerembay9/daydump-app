import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import CloudOff from 'lucide-react-native/icons/cloud-off';
import Lock from 'lucide-react-native/icons/lock';
import Animated, { Easing, interpolate, interpolateColor, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeProvider';
import { fixed } from '../theme/tokens';
import { caps, ui } from '../theme/type';

/**
 * The two onboarding slides' pictures (design/onboarding-motion.html, round 2). Each plays once from the start whenever its
 * slide becomes the one showing, then rests on its last frame. One clock per stage (ms), every piece interpolates its own window
 * of it, like NotifyStep. Photos are bundled stand-ins (assets/onboarding, painted in the mock): the slides run before photo access.
 */

const SCENES = {
  sunset: require('../../assets/onboarding/sunset.jpg'),
  beach: require('../../assets/onboarding/beach.jpg'),
  city: require('../../assets/onboarding/city.jpg'),
  food: require('../../assets/onboarding/food.jpg'),
  peaks: require('../../assets/onboarding/peaks.jpg'),
  forest: require('../../assets/onboarding/forest.jpg'),
  you: require('../../assets/onboarding/you.jpg'),
  coffee: require('../../assets/onboarding/coffee.jpg'),
  bloom: require('../../assets/onboarding/bloom.jpg'),
  friends: require('../../assets/onboarding/friends.jpg'),
  shot: require('../../assets/onboarding/shot.jpg'),
};
type Scene = keyof typeof SCENES;
const ROLL: Scene[] = ['sunset', 'beach', 'city', 'food', 'peaks', 'forest', 'you', 'coffee', 'bloom', 'friends'];

const W = 272, H = 300;
const PENCIL = '#D64933', RUST = '#A84A2F';

// eases as plain worklets (Reanimated's Easing builders aren't callable inside one)
const seg = (t: number, start: number, dur: number) => { 'worklet'; return Math.min(1, Math.max(0, (t - start) / dur)); };
const backOut = (x: number) => { 'worklet'; const u = x - 1; return 1 + 2.6 * u * u * u + 1.6 * u * u; };
const cubicOut = (x: number) => { 'worklet'; return 1 - (1 - x) ** 3; };
const cubicIn = (x: number) => { 'worklet'; return x * x * x; };
const smooth = (x: number) => { 'worklet'; return x * x * (3 - 2 * x); };

/** A clock that runs 0 → total (ms) each time active turns true. */
function useClock(active: boolean, total: number) {
  const k = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    k.value = 0;
    k.value = withTiming(total, { duration: total, easing: Easing.linear });
  }, [active, total, k]);
  return k;
}

/** A print: cream border, thicker at the bottom, photo inside. Placed by its centre; w x h at scale 1. */
type AStyle = React.ComponentProps<typeof Animated.View>['style'];

function Print({ scene, w, h, blur, style }: { scene: Scene; w: number; h: number; blur?: boolean; style: AStyle }) {
  const { t } = useTheme();
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, padding: 4, paddingBottom: 12, borderRadius: 2, backgroundColor: fixed.printBorder, boxShadow: t.shadowPrint }, style]}>
      <Image source={SCENES[scene]} blurRadius={blur ? 6 : 0} contentFit="cover" style={{ flex: 1, borderRadius: 1 }} />
    </Animated.View>
  );
}

function Stamp({ text, style }: { text: string; style: AStyle }) {
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, borderWidth: 1.5, borderColor: PENCIL, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: 'rgba(255,252,247,0.88)', zIndex: 20 }, style]}>
      <Text style={[ui(9, 700), { color: PENCIL, letterSpacing: 0.9 }]}>{caps(text)}</Text>
    </Animated.View>
  );
}

/* ---------- Slide 1: the pile sorts itself, the keepers stack up ---------- */

const PILE: { s: Scene; x: number; y: number; r: number; bad?: string }[] = [
  { s: 'sunset', x: 12, y: 16, r: -12 }, { s: 'you', x: 98, y: 6, r: 8 }, { s: 'shot', x: 184, y: 20, r: -6, bad: 'Screenshot' },
  { s: 'beach', x: 26, y: 104, r: 9 }, { s: 'you', x: 108, y: 98, r: -4, bad: 'Same shot' }, { s: 'peaks', x: 186, y: 110, r: 13, bad: 'Blurry' },
  { s: 'friends', x: 8, y: 194, r: -5 }, { s: 'city', x: 96, y: 190, r: 10, bad: 'Blurry' }, { s: 'food', x: 180, y: 198, r: -8 },
];
const PW = 112, PH = 140, SMALL = 72 / PW; // stack size; the pile is the same prints at 72 wide
const BAD = PILE.flatMap((p, i) => (p.bad ? [i] : []));
const KEEP = PILE.flatMap((p, i) => (p.bad ? [] : [i]));
const T1 = { stamp: 1500, fall: 2900, keep: 3450, keepGap: 290, tape: 5100, end: 5500 };

function PileShot({ k, i }: { k: SharedValue<number>; i: number }) {
  const p = PILE[i], bad = BAD.indexOf(i), keep = KEEP.indexOf(i);
  const cx = p.x + 36, cy = p.y + 45; // centre in the pile
  const st = useAnimatedStyle(() => {
    const t = k.value;
    const drop = backOut(seg(t, i * 70, 650));
    let x = cx, y = cy - 50 * (1 - drop), r = p.r * (2 - drop), s = SMALL, o = Math.min(1, drop * 2);
    if (bad >= 0) {
      const f = cubicIn(seg(t, T1.fall + bad * 60, 650));
      y += 380 * f; r += p.r * 2 * f; o *= 1 - f;
    } else {
      const m = backOut(seg(t, T1.keep + keep * T1.keepGap, 460));
      x += (136 + (keep % 2 ? 7 : -7) - cx) * m;
      y += (140 - keep * 3 - cy) * m;
      r += (-8 + keep * 3.5 - p.r) * m;
      s += (1 - SMALL) * m;
    }
    return { opacity: o, transform: [{ translateX: x - PW / 2 }, { translateY: y - PH / 2 }, { rotate: `${r}deg` }, { scale: s }] };
  });
  return <Print scene={p.s} w={PW} h={PH} blur={p.bad === 'Blurry'} style={[{ zIndex: i }, st]} />;
}

function PileStamp({ k, i }: { k: SharedValue<number>; i: number }) {
  const p = PILE[i], b = BAD.indexOf(i);
  const st = useAnimatedStyle(() => {
    const t = k.value;
    const pop = backOut(seg(t, T1.stamp + b * 160, 380)), f = cubicIn(seg(t, T1.fall + b * 60, 650));
    return { opacity: Math.min(1, pop * 2) * (1 - f), transform: [{ translateX: p.x + 6 }, { translateY: p.y + 36 + 380 * f }, { rotate: `${-8 - 12 * f}deg` }, { scale: 1.8 - 0.8 * pop }] };
  });
  return <Stamp text={p.bad!} style={st} />;
}

export function HookStage({ active }: { active: boolean }) {
  const { t } = useTheme();
  const k = useClock(active, T1.end);
  const tape = useAnimatedStyle(() => {
    const p = backOut(seg(k.value, T1.tape, 380));
    return { opacity: Math.min(1, p * 2), transform: [{ translateX: 108 }, { translateY: 50 + 6 * p }, { rotate: '-5deg' }, { scale: 1.6 - 0.6 * p }] };
  });
  return (
    <View style={{ width: W, height: H }} accessibilityLabel="Photos sorting themselves: blurry, repeat and screenshot shots drop away, the rest stack up" accessible>
      {PILE.map((p, i) => <PileShot key={i} k={k} i={i} />)}
      {BAD.map((i) => <PileStamp key={i} k={k} i={i} />)}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 56, height: 16, borderRadius: 2, backgroundColor: t.tapeBg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.tapeBorder, borderStyle: 'dashed', zIndex: 30 }, tape]} />
    </View>
  );
}

/* ---------- Slide 2: a scan tags the picks, inside a locked bubble the photos can't leave ---------- */

const TILE = 41, GAP = 4, GX = 48, GY = 88; // 4 x 4 in a 192 card at (40, 80)
const scene = (i: number) => ROLL[(i * 3) % 10];
const PICKS: Record<number, string> = { 2: 'You', 7: 'Beach', 10: 'Sunset', 13: 'Friends' };
const JUMP = 10; // the Sunset pick tries for the cloud
const T2 = { scan: 500, scanDur: 3000, dim: 3500, jump: 4400, end: 6400 };
const SCAN_TOP = 84, SCAN_LEN = 184;
/** when the scan line reaches row r's middle (the line eases, so invert smooth() by bisection) */
const rowAt = (r: number) => {
  const target = (30 + r * 45) / SCAN_LEN;
  let lo = 0, hi = 1;
  for (let n = 0; n < 20; n++) { const m = (lo + hi) / 2; if (smooth(m) < target) lo = m; else hi = m; }
  return T2.scan + T2.scanDur * lo;
};
const tileXY = (i: number) => ({ x: GX + (i % 4) * (TILE + GAP), y: GY + Math.floor(i / 4) * (TILE + GAP) });
// the jump: up to the bubble's top edge, a squash against it, back down
const J = { up: 520, squash: 90, down: 680 };
const HIT = T2.jump + J.up;

function Tile({ k, i }: { k: SharedValue<number>; i: number }) {
  const { x, y } = tileXY(i);
  const pick = i in PICKS, at = pick ? rowAt(Math.floor(i / 4)) : 0;
  const st = useAnimatedStyle(() => {
    const t = k.value;
    if (!pick) return { opacity: 1 - 0.68 * seg(t, T2.dim, 400), transform: [{ scale: 1 }] };
    const away = i === JUMP && t >= T2.jump && t < HIT + J.squash + J.down;
    return { opacity: away ? 0.2 : 1, transform: [{ scale: 1 + 0.12 * backOut(seg(t, at, 420)) }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y, width: TILE, height: TILE, borderRadius: 3, overflow: 'hidden', zIndex: pick ? 5 : 1 }, st]}>
      <Image source={SCENES[scene(i)]} contentFit="cover" style={{ flex: 1 }} />
    </Animated.View>
  );
}

/** The viewfinder that snaps onto a pick, and its label. Dims while the jump plays. */
function Tag({ k, i }: { k: SharedValue<number>; i: number }) {
  const { t } = useTheme();
  const { x, y } = tileXY(i), at = rowAt(Math.floor(i / 4));
  const dim = (tt: number) => { 'worklet'; return 1 - 0.75 * (seg(tt, T2.jump, 200) - seg(tt, HIT + J.squash + J.down, 200)); };
  const box = useAnimatedStyle(() => {
    const p = backOut(seg(k.value, at, 420)), size = (TILE + 10) * p;
    return { opacity: seg(k.value, at, 1) * dim(k.value), width: size, height: size, transform: [{ translateX: x + TILE / 2 - size / 2 }, { translateY: y + TILE / 2 - size / 2 }] };
  });
  const chip = useAnimatedStyle(() => {
    const p = backOut(seg(k.value, at + 180, 320));
    return { opacity: Math.min(1, p * 2) * dim(k.value), transform: [{ translateX: x - 4 }, { translateY: y + TILE + 2 }, { scale: 0.4 + 0.6 * p }] };
  });
  const corner = { position: 'absolute', width: 9, height: 9, borderColor: '#fff', borderWidth: 2 } as const;
  return <>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, zIndex: 25 }, box]}>
      <View style={[corner, { left: 0, top: 0, borderRightWidth: 0, borderBottomWidth: 0 }]} />
      <View style={[corner, { right: 0, top: 0, borderLeftWidth: 0, borderBottomWidth: 0 }]} />
      <View style={[corner, { left: 0, bottom: 0, borderRightWidth: 0, borderTopWidth: 0 }]} />
      <View style={[corner, { right: 0, bottom: 0, borderLeftWidth: 0, borderTopWidth: 0 }]} />
    </Animated.View>
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, backgroundColor: t.ink, zIndex: 26, transformOrigin: 'left center' }, chip]}>
      <Text style={[ui(10, 600), { color: t.bgScreen }]}>{PICKS[i]}</Text>
    </Animated.View>
  </>;
}

export function PrivacyStage({ active }: { active: boolean }) {
  const { t } = useTheme();
  const k = useClock(active, T2.end);
  const { x: jx, y: jy } = tileXY(JUMP);
  const line = useAnimatedStyle(() => {
    const t = k.value, p = smooth(seg(t, T2.scan, T2.scanDur));
    return { opacity: t >= T2.scan ? 1 - seg(t, T2.scan + T2.scanDur, 300) : 0, transform: [{ translateY: SCAN_TOP + SCAN_LEN * p }] };
  });
  // the flying copy of the Sunset pick, placed by its centre
  const fw = TILE + 6, fh = TILE + 8, sx = jx + TILE / 2, sy = jy + TILE / 2, ux = sx + 20, uy = 62 + 4 + fh / 2;
  const fly = useAnimatedStyle(() => {
    const t = k.value;
    if (t < T2.jump || t >= HIT + J.squash + J.down) return { opacity: 0, transform: [{ translateX: sx - fw / 2 }, { translateY: sy - fh / 2 }] };
    const up = cubicOut(seg(t, T2.jump, J.up)), sq = seg(t, HIT, J.squash), down = backOut(seg(t, HIT + J.squash, J.down));
    const x = sx + (ux - sx) * up + (sx - ux) * down;
    const y = sy + (uy - sy) * up - 4 * sq + (sy - uy + 4) * down;
    return {
      opacity: 1,
      transform: [{ translateX: x - fw / 2 }, { translateY: y - fh / 2 }, { rotate: `${10 * up * (1 - sq)}deg` }, { scale: 1 + 0.15 * up * (1 - down) }, { scaleY: 1 - 0.25 * sq * (1 - down) }],
    };
  });
  const bubble = useAnimatedStyle(() => {
    const flash = seg(k.value, HIT, 60) - seg(k.value, HIT + J.squash + J.down, 300);
    return { borderColor: interpolateColor(flash, [0, 1], [t.borderStrong, RUST]) };
  });
  const ring = useAnimatedStyle(() => {
    const p = cubicOut(seg(k.value, HIT, 650));
    return { opacity: k.value >= HIT ? 1 - p : 0, transform: [{ scaleX: 1 + 0.11 * p }, { scaleY: 1 + 0.1 * p }] };
  });
  const lock = useAnimatedStyle(() => {
    const t = k.value, s = t < HIT + 160 ? 1 + 0.3 * seg(t, HIT, 160) : 1.3 - 0.3 * backOut(seg(t, HIT + 160, 420));
    return { transform: [{ scale: s }] };
  });
  const cloud = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(k.value, [HIT, HIT + 80, HIT + 160, HIT + 240, HIT + 320], [0, -8, 6, -3, 0], 'clamp')}deg` }] }));
  return (
    <View style={{ width: W, height: H }} accessibilityLabel="Your photos are read and tagged on the phone, inside a lock; none reach the cloud" accessible>
      <Animated.View style={[{ position: 'absolute', top: 0, left: W / 2 - 18 }, cloud]}>
        <CloudOff size={36} color={t.inkMuted} strokeWidth={1.6} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 28, top: 58, width: 216, height: 228, borderRadius: 30, borderWidth: 2, borderColor: RUST }, ring]} />
      <Animated.View style={[{ position: 'absolute', left: 28, top: 58, width: 216, height: 228, borderRadius: 30, borderWidth: 2, backgroundColor: t.borderSubtle }, bubble]} />
      <View style={{ position: 'absolute', left: 40, top: 80, width: 192, height: 192, borderRadius: 16, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle }} />
      {Array.from({ length: 16 }, (_, i) => <Tile key={i} k={k} i={i} />)}
      {Object.keys(PICKS).map((i) => <Tag key={i} k={k} i={+i} />)}
      <Animated.View style={[{ position: 'absolute', left: 34, top: 0, width: 204, height: 2, borderRadius: 1, backgroundColor: RUST, boxShadow: `0 0 10px 2px ${RUST}88`, zIndex: 20 }, line]} />
      <Print scene={scene(JUMP)} w={fw} h={fh} style={[{ zIndex: 40, padding: 3, paddingBottom: 7 }, fly]} />
      <Animated.View style={[{ position: 'absolute', left: W / 2 - 14, top: 44, width: 28, height: 28, borderRadius: 14, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', zIndex: 30 }, lock]}>
        <Lock size={13} color={t.bgScreen} strokeWidth={2.2} />
      </Animated.View>
    </View>
  );
}
