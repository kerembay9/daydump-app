import React, { useState } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';

const APressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; children?: React.ReactNode };

/** Mock .btn-tap: press scales to 0.96 over 150 ms. A rotate etc. in style is kept. */
export function Tap({ style, children, onPressIn, onPressOut, ...rest }: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const to = (v: number) => Animated.timing(scale, { toValue: v, duration: 150, useNativeDriver: true }).start();
  const flat = StyleSheet.flatten(style) || {};
  const transform = [...(Array.isArray(flat.transform) ? flat.transform : []), { scale }];
  return (
    <APressable
      {...rest}
      style={[flat, { transform }]}
      onPressIn={(e) => { to(0.96); onPressIn?.(e); }}
      onPressOut={(e) => { to(1); onPressOut?.(e); }}
    >
      {children}
    </APressable>
  );
}
