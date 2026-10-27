import React, { useEffect, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { DumpPhoto } from '../../services/dumps';
import { Print } from '../ui/Print';
import { Tap } from '../ui/Tap';
import { Icons } from '../ui/Icons';

const W = 60, H = 66, GAP = 8, STEP = W + GAP, LIFT = 8, PAD = 8;
export const SLIDE_MS = 260;
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * The Picks sheet's row (design: "lift, part, glide, land"). The selected photo lifts and grows over the dimmed rest;
 * Move earlier / later glides it over its neighbour (which slides back into the free slot) while the photo just past
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
      <View style={{ width: photos.length * STEP - GAP + 2 * PAD, height: H + 2 * LIFT + 2 * PAD }}>
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
      // the moving photo rides higher while it passes over its neighbour, then settles back to its lifted pose
      if (selected && was.sel === sel) y.set(withSequence(withTiming(-2 * LIFT, { duration: SLIDE_MS / 2 }), withTiming(-LIFT, { duration: SLIDE_MS / 2 })));
    } else if (sel && was.sel === sel && Math.abs(selIndex - was.selIndex) === 1 && index === selIndex + (selIndex - was.selIndex)) {
      // the photo just past where it lands steps aside, then back: the gap it drops into
      const by = (selIndex - was.selIndex) * 10;
      nudge.set(withSequence(withTiming(by, { duration: SLIDE_MS / 2, easing: ease }), withTiming(0, { duration: SLIDE_MS / 2, easing: ease })));
    }
  }, [index, sel, selIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    y.set(withTiming(selected ? -LIFT : 0, { duration: 200, easing: ease }));
    scale.set(withTiming(selected ? 1.12 : 1, { duration: 200, easing: ease }));
    dim.set(withTiming(sel == null || selected ? 1 : 0.55, { duration: 200 }));
  }, [selected, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: dim.value,
    transform: [{ translateX: x.value + nudge.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View testID="pick-thumb" style={[{ position: 'absolute', left: PAD, top: LIFT + PAD, zIndex: selected ? 2 : 1 }, style]}>
      <Tap onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Photo ${index + 1}`}
        style={[{ borderRadius: 10 }, selected ? { boxShadow: `0 0 0 2.5px ${t.ink}, 0 6px 14px rgba(0,0,0,0.25)` } : null]}>
        <Print uri={photo.uri} w={W} h={H} r={10} border={1} borderColor="rgba(255,255,255,0.6)" />
        <Tap onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`}
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
