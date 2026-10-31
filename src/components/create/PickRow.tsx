import React, { useEffect, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { DumpPhoto } from '../../services/dumps';
import { Print } from '../ui/Print';
import { Tap } from '../ui/Tap';
import { Icons } from '../ui/Icons';
import { tr } from '../../i18n';

const W = 60, H = 66, GAP = 8, STEP = W + GAP, LIFT = 6;
/** Selected photo's size, its peak while gliding past a neighbour, and the rest's size while one is selected. */
export const GROW = 1.3, GLIDE = 1.38, REST = 0.92;
// room around the thumbs so the grown, lifted photo (and its shadow) isn't clipped by the scroll view
const PADX = Math.ceil((W * GLIDE - W) / 2) + 6, TOP = Math.ceil((H * GLIDE - H) / 2 + 2 * LIFT) + 4, BOTTOM = Math.ceil((H * GROW - H) / 2) + 12;
export const SLIDE_MS = 260;
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const pop = { dampingRatio: 0.55, duration: 400 }; // one overshoot past GROW so a pick visibly pops, then it settles (Reanimated 4 defaults mass to 4, so damping/stiffness alone wobbled)

/**
 * The Picks sheet's row (design: "lift, part, glide, land"). The selected photo lifts and pops up to GROW over the dimmed, shrunk rest;
 * Move earlier / later glides it, swelling to GLIDE, over its neighbour (which slides back into the free slot) while the photo just past
 * the landing spot nudges aside to open the gap. Thumbs sit at absolute x = index · STEP, so a reorder or a removal
 * animates instead of snapping. Timings honour the system's reduce-motion setting (Reanimated's default).
 */
export function PickRow({ photos, sel, onSelect, onRemove }: {
  photos: DumpPhoto[]; sel: string | null; onSelect: (id: string | null) => void; onRemove: (id: string) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const selIndex = photos.findIndex((p) => p.id === sel);
  // keep the moved photo in view
  useEffect(() => { if (selIndex >= 0) scroll.current?.scrollTo({ x: Math.max(0, selIndex * STEP - 2 * STEP), animated: true }); }, [selIndex]);
  return (
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ width: photos.length * STEP - GAP + 2 * PADX, height: TOP + H + BOTTOM }}>
        {photos.map((p, i) => (
          <Thumb key={p.id} photo={p} index={i} sel={sel} selIndex={selIndex}
            onPress={() => onSelect(sel === p.id ? null : p.id)} onRemove={() => onRemove(p.id)} />
        ))}
      </View>
    </ScrollView>
  );
}

function Thumb({ photo, index, sel, selIndex, onPress, onRemove }: {
  photo: DumpPhoto; index: number; sel: string | null; selIndex: number; onPress: () => void; onRemove: () => void;
}) {
  const { t } = useTheme();
  const selected = sel === photo.id;
  const x = useSharedValue(index * STEP), nudge = useSharedValue(0);
  const y = useSharedValue(0), scale = useSharedValue(1), dim = useSharedValue(1);
  const prev = useRef({ index, sel, selIndex });

  useEffect(() => {
    const was = prev.current;
    prev.current = { index, sel, selIndex };
    if (index !== was.index) {
      x.set(withTiming(index * STEP, { duration: SLIDE_MS, easing: ease }));
      // the moving photo rides higher and swells while it passes over its neighbour, then settles back to its lifted pose
      if (selected && was.sel === sel) {
        y.set(withSequence(withTiming(-2 * LIFT, { duration: SLIDE_MS / 2 }), withTiming(-LIFT, { duration: SLIDE_MS / 2 })));
        scale.set(withSequence(withTiming(GLIDE, { duration: SLIDE_MS / 2, easing: ease }), withTiming(GROW, { duration: SLIDE_MS / 2, easing: ease })));
      }
    } else if (sel && was.sel === sel && Math.abs(selIndex - was.selIndex) === 1 && index === selIndex + (selIndex - was.selIndex)) {
      // the photo just past where it lands steps aside, then back: the gap it drops into
      const by = (selIndex - was.selIndex) * 10;
      nudge.set(withSequence(withTiming(by, { duration: SLIDE_MS / 2, easing: ease }), withTiming(0, { duration: SLIDE_MS / 2, easing: ease })));
    }
  }, [index, sel, selIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    y.set(withTiming(selected ? -LIFT : 0, { duration: 200, easing: ease }));
    scale.set(selected ? withSpring(GROW, pop) : withTiming(sel == null ? 1 : REST, { duration: 200, easing: ease }));
    dim.set(withTiming(sel == null || selected ? 1 : 0.45, { duration: 200 }));
  }, [selected, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: dim.value,
    transform: [{ translateX: x.value + nudge.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View testID="pick-thumb" style={[{ position: 'absolute', left: PADX, top: TOP, zIndex: selected ? 2 : 1 }, style]}>
      <Tap onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={tr('create.photoIndex', { index: index + 1 })}
        style={[{ borderRadius: 10 }, selected ? { boxShadow: `0 0 0 2.5px ${t.ink}, 0 8px 16px rgba(0,0,0,0.3)` } : null]}>
        <Print uri={photo.uri} w={W} h={H} r={10} border={1} borderColor="rgba(255,255,255,0.6)" />
        <Tap onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('create.removePhotoIndex', { index: index + 1 })}
          style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' }}>
          <Icons.close size={10} color="#fff" />
        </Tap>
        <View style={{ position: 'absolute', bottom: 3, left: 3, paddingHorizontal: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {photo.suggested ? <Icons.sparkle size={8} color="#fff" /> : null}
          <Text style={[ui(8, 700), { color: '#fff' }]}>#{index + 1}</Text>
        </View>
      </Tap>
    </Animated.View>
  );
}
