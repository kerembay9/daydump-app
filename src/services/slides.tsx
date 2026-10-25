// Slides drawn with Skia: the same drawing is the Edit canvas and the exported JPG, so what you see is what you post.
import React from 'react';
import { ColorMatrix, drawAsImage, Group, Image, ImageFormat, rect, Rect, RoundedRect, rrect, Shadow, Skia, SkImage, vec } from '@shopify/react-native-skia';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import type { Dump } from './dumps';
import { getProfile } from './profile';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { matrixFor, filterOf, lookFor } from './filters';
import { Cell, chunk, Crop, exportSize, Fit, fitOf, LayoutKey, layoutOf, paintOrder, placePhoto, slideCells, UNIT } from './layouts';

/** Cashmere matte: the border, scrapbook ground and collage gaps, in both app themes (exports never change colour). */
export const MATTE = '#EFE6DA';
const EMPTY = 'rgba(74,52,40,0.15)';

export type SlidePhoto = { image: SkImage | null | undefined; matrix: number[] | null; crop?: Crop };

function PhotoCell({ c, p, u }: { c: Cell; p: SlidePhoto; u: number }) {
  const b = c.border;
  const inner = rect(c.x + b, c.y + b, c.w - 2 * b, c.h - 2 * b);
  const at = p.image ? placePhoto(inner.width, inner.height, p.image.width(), p.image.height(), p.crop) : null;
  return (
    <Group transform={c.rot ? [{ rotate: (c.rot * Math.PI) / 180 }] : undefined} origin={vec(c.x + c.w / 2, c.y + c.h / 2)}>
      {c.shadow || b ? (
        <RoundedRect x={c.x} y={c.y} width={c.w} height={c.h} r={c.r} color={c.borderColor ?? EMPTY}>
          {c.shadow ? <Shadow dx={0} dy={5 * u} blur={6 * u} color="rgba(55,38,28,0.3)" /> : null}
        </RoundedRect>
      ) : null}
      <Group clip={rrect(inner, Math.max(0, c.r - b), Math.max(0, c.r - b))}>
        {p.image && at ? (
          <Image image={p.image} x={inner.x + at.dx} y={inner.y + at.dy} width={at.dw} height={at.dh} fit="fill">
            {p.matrix ? <ColorMatrix matrix={p.matrix} /> : null}
          </Image>
        ) : (
          <Rect rect={inner} color={EMPTY} />
        )}
      </Group>
    </Group>
  );
}

/** One slide at width x height: matte / scrapbook ground, then the photos in their layout cells. */
export function SlideDrawing({ layout, fit, width, height, photos }: { layout: LayoutKey; fit: Fit; width: number; height: number; photos: SlidePhoto[] }) {
  const u = width / UNIT;
  const { inner, cells } = slideCells(layout, fit, width, height);
  return (
    <Group>
      <Rect x={0} y={0} width={width} height={height} color={MATTE} />
      {fit === 'border' ? (
        <RoundedRect x={inner.x} y={inner.y} width={inner.w} height={inner.h} r={inner.r} color={MATTE}>
          <Shadow dx={0} dy={3 * u} blur={5 * u} color="rgba(0,0,0,0.16)" />
        </RoundedRect>
      ) : null}
      <Group clip={rrect(rect(inner.x, inner.y, inner.w, inner.h), inner.r, inner.r)}>
        {paintOrder(layout, photos.length).map((i) => <PhotoCell key={i} c={cells[i]} p={photos[i]} u={u} />)}
      </Group>
    </Group>
  );
}

// Three decodes at a time, first come first served: a 12 MP photo is ~48 MB while it's being scaled down (~150 MB peak).
// ponytail: a 50 MP photo is ~200 MB, so three of those could run out of memory; decode subsampled natively if that shows up.
let free = 3;
const waiting: (() => void)[] = [];
const limited = async <T,>(fn: () => Promise<T>): Promise<T> => {
  if (free) free--;
  else await new Promise<void>((go) => waiting.push(go));
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next(); else free++;
  }
};

/**
 * A photo as a Skia image just big enough to cover a box (px). Goes through the image manipulator, which reads
 * content:// (shared-in photos; Skia only reads file/http) and applies EXIF rotation.
 */
export function loadImage(uri: string, boxW: number, boxH: number): Promise<SkImage | null> {
  return limited(async () => {
    const full = await ImageManipulator.manipulate(uri).renderAsync();
    const s = Math.min(1, Math.max(boxW / full.width, boxH / full.height));
    const small = s < 1 ? await ImageManipulator.manipulate(full).resize({ width: Math.round(full.width * s) }).renderAsync() : full;
    const saved = await small.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
    full.release();
    if (small !== full) small.release();
    const img = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(saved.uri));
    try { new File(saved.uri).delete(); } catch { /* cache file; the OS cleans it eventually */ }
    return img;
  }).catch((e) => {
    console.warn('[slides] load failed', uri, e);
    return null;
  });
}

// Edit-canvas images, one size per photo for the whole session (the box covers every ratio), oldest dropped past 24.
// ponytail: each is ~4 MB decoded (~1000 px box) and Edit holds every photo of the open dump, so a 30-photo dump is
// ~120 MB while Edit is open. Load only the visible slide ±1 (and smaller filmstrip copies) if big dumps hit memory.
const previewCache = new Map<string, Promise<SkImage | null>>();
export function previewImage(uri: string, boxW: number, boxH: number) {
  const key = `${uri}@${Math.round(boxW)}x${Math.round(boxH)}`;
  let p = previewCache.get(key);
  if (!p) {
    p = loadImage(uri, boxW, boxH);
    previewCache.set(key, p);
    if (previewCache.size > 24) previewCache.delete(previewCache.keys().next().value!);
  }
  return p;
}

/**
 * Renders every slide of a dump to JPGs in the cache (1080 px wide, q0.92; 2160 px at q0.95 with High-Res), with its
 * layout, Border/Bleed and filters baked in. Returns file:// uris in slide order. Each call replaces the last export.
 */
export async function exportSlides(d: Dump, opts: { highRes?: boolean } = {}): Promise<string[]> {
  const highRes = opts.highRes ?? (await getProfile()).exportHD;
  const { width, height } = exportSize(d.ratio, highRes);
  const fit = fitOf(d.fit);
  const filter = filterOf(d.filter);
  const dir = new Directory(Paths.cache, 'export');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const t0 = Date.now();
  const stamp = t0.toString(36);
  const out: string[] = [];
  const slides = chunk(d.photos, layoutOf(d.layout).key);
  // every photo queued at once, in slide order, so up to three decode while a slide draws
  const hold = () => ClipEmbedder?.holdIndexing?.(3000); // someone's waiting: the CPU to the export, not indexing
  const loads = slides.map((s) => {
    const { cells } = slideCells(s.layout, fit, width, height);
    return s.photos.map((p, j) => loadImage(p.uri, cells[j].w, cells[j].h).finally(hold));
  });
  hold();
  try {
    for (const [i, s] of slides.entries()) {
      const images = await Promise.all(loads[i]);
      const photos: SlidePhoto[] = s.photos.map((p, j) => ({ image: images[j], matrix: matrixFor(lookFor(filter, p.id)), crop: p.crop }));
      const img = await drawAsImage(<SlideDrawing layout={s.layout} fit={fit} width={width} height={height} photos={photos} />, { width, height });
      if (!img) throw new Error(`slide ${i + 1} did not render`);
      // topic ids hold ':' (topic:2740:…), and MediaLibrary can't tell the MIME type of such a name
      const file = new File(dir, `${d.id.replace(/[^\w-]/g, '_')}-${stamp}-${i + 1}.jpg`);
      file.write(img.encodeToBytes(ImageFormat.JPEG, highRes ? 95 : 92));
      out.push(file.uri);
      img.dispose();
      hold();
    }
  } finally {
    // drawn or not (a slide failed): every loaded image freed once its load lands
    for (const l of loads.flat()) l.then((im) => im?.dispose());
  }
  console.log(`[slides] exported ${out.length} slide(s), ${d.photos.length} photo(s) at ${width}x${height} in ${Date.now() - t0} ms`);
  return out;
}
