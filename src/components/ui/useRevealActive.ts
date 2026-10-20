import { useEffect, useRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

/**
 * Keeps the active item of a horizontal pill row in view (a reopened draft on Scrapbook / B&W Roll would otherwise
 * sit off screen). Spread `scroll` on the ScrollView, wrap each item in a View with onLayout={item(key)}.
 */
export function useRevealActive(active: string) {
  const ref = useRef<ScrollView>(null);
  const items = useRef<Record<string, { x: number; w: number }>>({});
  const view = useRef({ x: 0, w: 0 });
  const reveal = (key: string) => {
    const it = items.current[key];
    const { x, w } = view.current;
    if (!it || !w) return;
    if (it.x < x) ref.current?.scrollTo({ x: Math.max(0, it.x - 16), animated: true });
    else if (it.x + it.w > x + w) ref.current?.scrollTo({ x: it.x + it.w - w + 16, animated: true });
  };
  useEffect(() => reveal(active), [active]);
  return {
    scroll: {
      ref,
      scrollEventThrottle: 32,
      onLayout: (e: LayoutChangeEvent) => { view.current.w = e.nativeEvent.layout.width; reveal(active); },
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => { view.current.x = e.nativeEvent.contentOffset.x; },
    },
    item: (key: string) => (e: LayoutChangeEvent) => {
      items.current[key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
      if (key === active) reveal(key);
    },
  };
}
