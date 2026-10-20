import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import type { Face } from '../../modules/clip-embedder';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A photo in a circle, zoomed to a face: a square ~2x the face's size, kept inside the photo. aspect: width / height. */
export function FaceCircle({ uri, box, aspect, size }: { uri: string; box?: Face; aspect: number; size: number }) {
  const round = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' as const };
  if (!box) return <Image source={{ uri }} style={round} contentFit="cover" />;
  const side = Math.min(2 * Math.max(box.w * aspect, box.h), aspect, 1); // in photo heights
  const cx = clamp((box.x + box.w / 2) * aspect, side / 2, aspect - side / 2);
  const cy = clamp(box.y + box.h / 2, side / 2, 1 - side / 2);
  const k = size / side;
  return (
    <View style={round}>
      <Image source={{ uri }} contentFit="fill" style={{ position: 'absolute', width: aspect * k, height: k, left: size / 2 - cx * k, top: size / 2 - cy * k }} />
    </View>
  );
}
