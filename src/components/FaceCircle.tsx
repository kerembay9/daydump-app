import React, { useEffect, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import type { Face } from '../../modules/clip-embedder';
import { useTheme } from '../theme/ThemeProvider';
import { square } from '../services/faces';

/** A photo in a circle, zoomed to a face. Draws the whole photo scaled up: fine for one big circle, too heavy for lists (FaceThumb). */
export function FaceCircle({ uri, box, aspect, size }: { uri: string; box?: Face; aspect: number; size: number }) {
  const round = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' as const };
  if (!box) return <Image source={{ uri }} style={round} contentFit="cover" />;
  const { side, left, top } = square(box, aspect);
  const k = size / side;
  return (
    <View style={round}>
      {/* key: a new photo remounts, else the old one shows a moment stretched to the new one's size */}
      {/* memory cache: the same circle drawn again (onboarding's flights) shows at once */}
      <Image key={uri} source={{ uri }} contentFit="fill" cachePolicy="memory-disk" style={{ position: 'absolute', width: aspect * k, height: k, left: -left * k, top: -top * k }} />
    </View>
  );
}

const dir = new Directory(Paths.cache, 'faces');
const made = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i); return (h >>> 0).toString(36); };

/**
 * A px-wide JPG of the face's square, cached on disk; one at a time (each decodes a full photo).
 * ponytail: rows scrolled past stay queued; skip stale ones if fast scrolling makes the visible ones wait.
 */
export function faceFile(uri: string, box: Face, px: number): Promise<string | null> {
  const name = `${hash(`${uri}|${box.x}|${box.y}|${box.w}|${box.h}`)}_${px}.jpg`;
  let p = made.get(name);
  if (!p) {
    p = queue.then(async () => {
      const out = new File(dir, name);
      if (out.exists) return out.uri;
      dir.create({ idempotent: true });
      const full = await ImageManipulator.manipulate(uri).renderAsync();
      const H = full.height;
      const { side, left, top } = square(box, full.width / H);
      const x = Math.round(left * H), y = Math.round(top * H), s = Math.min(Math.round(side * H), full.width - x, H - y);
      const face = await ImageManipulator.manipulate(full).crop({ originX: x, originY: y, width: s, height: s }).resize({ width: px }).renderAsync();
      const saved = await face.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      full.release(); face.release();
      await new File(saved.uri).move(out);
      return out.uri;
    }).catch((e) => { console.warn('[faces] thumb failed', uri, e); return null; });
    queue = p;
    made.set(name, p);
  }
  return p;
}

/** A face in a circle from a small cropped copy (FaceCircle's zoomed full photo made long lists stutter). */
export function FaceThumb({ uri, box, size }: { uri: string; box: Face; size: number }) {
  const { t } = useTheme();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    faceFile(uri, box, Math.round(size * PixelRatio.get())).then((s) => on && setSrc(s));
    return () => { on = false; };
  }, [uri, box, size]);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: t.bgCard }}>
      {src && <Image source={{ uri: src }} style={{ flex: 1 }} contentFit="cover" transition={120} />}
    </View>
  );
}
