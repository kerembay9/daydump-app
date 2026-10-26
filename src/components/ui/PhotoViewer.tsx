import React, { useRef, useState } from 'react';
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Text, useWindowDimensions, View } from 'react-native';
import { FlatList, Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui } from '../../theme/type';
import { Tap } from './Tap';
import { Icons } from './Icons';

const PEEK = 24, SP = 8; // the neighbours show PEEK - SP px at each side: there's more to swipe to

type Photo = { id: string; uri: string };

/** Pinch zooms toward the fingers and springs back on release (Instagram-style: no pan, so it never fights the swipe). */
function Zoomable({ uri, w, h, onZoom }: { uri: string; w: number; h: number; onZoom: (on: boolean) => void }) {
  const s = useSharedValue(1), tx = useSharedValue(0), ty = useSharedValue(0), fx = useSharedValue(0), fy = useSharedValue(0);
  // on the UI thread: the zoom keeps up with the fingers even while JS is busy
  const pinch = Gesture.Pinch()
    .onStart((e) => { fx.value = e.focalX - w / 2; fy.value = e.focalY - h / 2; scheduleOnRN(onZoom, true); })
    .onUpdate((e) => {
      s.value = Math.max(1, Math.min(4, e.scale));
      tx.value = fx.value * (1 - s.value); ty.value = fy.value * (1 - s.value); // the pinched point stays under the fingers
    })
    .onFinalize(() => { s.value = withSpring(1); tx.value = withSpring(0); ty.value = withSpring(0); scheduleOnRN(onZoom, false); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }] }));
  return (
    <GestureDetector gesture={pinch}>
      <Animated.View style={[{ width: w, height: h }, style]}>
        <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" recyclingKey={uri} />
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Full-screen photo, swipe (or ‹ ›) through `photos`, pinch to zoom; × or Back closes. `footer` acts on the shown photo.
 * index null = closed.
 */
export function PhotoViewer<P extends Photo>({ photos, index, onClose, footer }: {
  photos: P[]; index: number | null; onClose: () => void; footer?: (p: P, i: number) => React.ReactNode;
}) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<P>>(null);
  const [at, setAt] = useState(0);
  const [measured, setH] = useState(0);
  const [zooming, setZooming] = useState(false);
  const [opened, setOpened] = useState<number | null>(null);
  // a new open starts at its photo (state, not an effect: the first frame already shows the right counter)
  if (index !== opened) { setOpened(index); if (index != null) setAt(index); }
  const h = measured || win.height * 0.7; // a guess until the first layout
  const itemW = win.width - 2 * PEEK, slot = itemW + SP;
  const n = photos.length;
  const i = Math.min(at, n - 1);
  const go = (to: number) => { setAt(to); list.current?.scrollToIndex({ index: to }); };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const k = Math.max(0, Math.min(n - 1, Math.round(e.nativeEvent.contentOffset.x / slot)));
    if (k !== at) setAt(k);
  };
  const arrow = (side: 'left' | 'right') => {
    const to = side === 'left' ? i - 1 : i + 1;
    if (to < 0 || to >= n) return null;
    const Icon = side === 'left' ? Icons.back : Icons.chevron;
    return (
      <Tap onPress={() => go(to)} accessibilityRole="button" accessibilityLabel={side === 'left' ? 'Previous photo' : 'Next photo'} hitSlop={10}
        style={{ position: 'absolute', [side]: 6, top: '50%', marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color="#fff" />
      </Tap>
    );
  };
  return (
    <Modal visible={index != null && n > 0} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* a Modal is its own window: gestures need their own root there */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', paddingTop: insets.top, paddingBottom: insets.bottom + 12 }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(12, 600), { color: '#fff' }]}>{i + 1} / {n}</Text>
          <Tap onPress={onClose} accessibilityRole="button" accessibilityLabel="Close photo" hitSlop={10}
            style={{ position: 'absolute', right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.close size={16} color="#fff" />
          </Tap>
        </View>
        <View style={{ flex: 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
          {opened != null ? (
            <FlatList
              ref={list}
              data={photos}
              keyExtractor={(p) => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEnabled={!zooming}
              snapToInterval={slot}
              decelerationRate="fast"
              disableIntervalMomentum
              initialScrollIndex={opened}
              getItemLayout={(_, k) => ({ length: slot, offset: slot * k, index: k })}
              initialNumToRender={3}
              windowSize={3}
              onScroll={onScroll}
              scrollEventThrottle={32}
              extraData={i}
              contentContainerStyle={{ paddingHorizontal: (win.width - slot) / 2 }}
              renderItem={({ item, index: k }) => (
                <View style={{ width: slot, alignItems: 'center', opacity: k === i ? 1 : 0.45 }} accessibilityLabel={`Photo ${k + 1} of ${n}`}>
                  <Zoomable uri={item.uri} w={itemW} h={h} onZoom={setZooming} />
                </View>
              )}
            />
          ) : null}
          {arrow('left')}
          {arrow('right')}
        </View>
        {footer && photos[i] ? <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{footer(photos[i], i)}</View> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
