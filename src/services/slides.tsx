// Slides drawn with Skia: the same drawing is the Edit canvas and the exported JPG, so what you see is what you post.
import React from 'react';
import { Blur, ColorMatrix, drawAsImage, FractalNoise, Group, Image, ImageFilter, ImageFormat, RadialGradient, rect, Rect, RoundedRect, rrect, Shadow, Skia, SkImage, SkImageFilter, SkRect, SkRuntimeEffect, TileMode, vec } from '@shopify/react-native-skia';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { Directory, File, Paths } from 'expo-file-system';
import type { Dump } from './dumps';
import { getProfile } from './profile';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { Develop, developFor, filterOf, Tone } from './filters';
import { Cell, chunk, Crop, exportSize, Frame, frameOf, LayoutKey, layoutOf, matteColor, paintOrder, placePhoto, slideCells, UNIT } from './layouts';

const EMPTY = 'rgba(74,52,40,0.15)';

/** dev = how it's drawn (Photos tab); null = the original (hold to compare). */
export type SlidePhoto = { id?: string; image: SkImage | null | undefined; dev: Develop | null; crop?: Crop };
/** The crop of the photo under the fingers, set on the UI thread while dragging / pinching on the Edit canvas. */
export type LiveCrop = { id: string; crop: Crop } | null;

// Shadows lifts (amt > 0) or deepens the darks only, fading out by mid-grey; runs after the colour matrix.
const SHADOWS = `uniform shader image; uniform float amt;
half4 main(float2 xy) {
  half4 c = image.eval(xy);
  if (c.a <= 0.0) return c;
  half3 rgb = c.rgb / c.a;
  half w = (1.0 - smoothstep(0.0, 0.6, dot(rgb, half3(0.2126, 0.7152, 0.0722)))) * abs(amt);
  return half4(mix(rgb, amt > 0.0 ? sqrt(rgb) : rgb * rgb, w) * c.a, c.a);
}`;
let shadowFx: SkRuntimeEffect | null | undefined;

/**
 * Shadows and Sharpen as one image filter (null = neither). Sharpen is an unsharp mask, (1 + k) photo - k blurred,
 * with the blur in slide units so the Edit canvas and the 1080 px export look the same.
 */
function developFilter(d: Develop, u: number): SkImageFilter | null {
  let f: SkImageFilter | null = null;
  if (d.shadows) {
    shadowFx ??= Skia.RuntimeEffect.Make(SHADOWS);
    if (shadowFx) {
      const b = Skia.RuntimeShaderBuilder(shadowFx);
      b.setUniform('amt', [d.shadows]);
      f = Skia.ImageFilter.MakeRuntimeShader(b, null, null);
    }
  }
  if (d.sharpen) {
    const k = 1.6 * d.sharpen;
    f = Skia.ImageFilter.MakeArithmetic(0, -k, 1 + k, 0, true, f, Skia.ImageFilter.MakeBlur(0.45 * u, 0.45 * u, TileMode.Clamp, f));
  }
  return f;
}

/** The look's colour matrix and the Shadows / Sharpen filter, as an Image's children. */
function Fx({ dev, u }: { dev: Develop | null; u: number }) {
  const f = dev && developFilter(dev, u);
  return (
    <>
      {dev?.matrix ? <ColorMatrix matrix={dev.matrix} /> : null}
      {f ? <ImageFilter filter={f} /> : null}
    </>
  );
}

/** Grain (grey noise, overlay-blended, grain size in slide units) and Vignette over a photo's cell. */
function Texture({ dev, box, u }: { dev: Develop | null; box: SkRect; u: number }) {
  if (!dev) return null;
  const a = 0.55 * dev.grain;
  return (
    <>
      {dev.grain ? (
        <Rect rect={box} blendMode="overlay">
          <FractalNoise freqX={1 / (0.7 * u)} freqY={1 / (0.7 * u)} octaves={2} seed={7} />
          <ColorMatrix matrix={[2, 0, 0, 0, -0.5, 2, 0, 0, 0, -0.5, 2, 0, 0, 0, -0.5, 0, 0, 0, 0, a]} />
        </Rect>
      ) : null}
      {dev.vignette ? (
        <Rect rect={box}>
          <RadialGradient c={vec(box.x + box.width / 2, box.y + box.height / 2)} r={Math.hypot(box.width, box.height) / 2}
            colors={['rgba(0,0,0,0)', `rgba(0,0,0,${0.65 * dev.vignette})`]} positions={[0.4, 1]} />
        </Rect>
      ) : null}
    </>
  );
}

/** A photo that follows the live crop when it's the one being dragged: Skia redraws it with no React render per frame. */
function LiveImage({ id, image, dev, crop, x, y, w, h, u, live }: { id: string; image: SkImage; dev: Develop | null; crop?: Crop; x: number; y: number; w: number; h: number; u: number; live: SharedValue<LiveCrop> }) {
  const iw = image.width(), ih = image.height();
  const at = useDerivedValue(() => {
    const l = live.get();
    return placePhoto(w, h, iw, ih, l?.id === id ? l.crop : crop);
  });
  const dx = useDerivedValue(() => x + at.get().dx);
  const dy = useDerivedValue(() => y + at.get().dy);
  const dw = useDerivedValue(() => at.get().dw);
  const dh = useDerivedValue(() => at.get().dh);
  return (
    <Image image={image} x={dx} y={dy} width={dw} height={dh} fit="fill">
      <Fx dev={dev} u={u} />
    </Image>
  );
}

/** Blur fill: the whole photo, centred, on a blurred and dimmed cover copy of itself. */
function BlurFill({ p, image, box, u }: { p: SlidePhoto; image: SkImage; box: SkRect; u: number }) {
  const iw = image.width(), ih = image.height();
  const back = placePhoto(box.width, box.height, iw, ih);
  const s = Math.min(box.width / iw, box.height / ih);
  const dw = iw * s, dh = ih * s;
  return (
    <>
      <Image image={image} x={box.x + back.dx} y={box.y + back.dy} width={back.dw} height={back.dh} fit="fill">
        {p.dev?.matrix ? <ColorMatrix matrix={p.dev.matrix} /> : null}
        <Blur blur={16 * u} mode="clamp" />
      </Image>
      <Rect rect={box} color="rgba(0,0,0,0.12)" />
      <Image image={image} x={box.x + (box.width - dw) / 2} y={box.y + (box.height - dh) / 2} width={dw} height={dh} fit="fill">
        <Fx dev={p.dev} u={u} />
      </Image>
    </>
  );
}

function PhotoCell({ c, p, u, blur, live }: { c: Cell; p: SlidePhoto; u: number; blur: boolean; live?: SharedValue<LiveCrop> }) {
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
        {p.image && blur ? (
          <BlurFill p={p} image={p.image} box={inner} u={u} />
        ) : p.image && live && p.id ? (
          <LiveImage id={p.id} image={p.image} dev={p.dev} crop={p.crop} x={inner.x} y={inner.y} w={inner.width} h={inner.height} u={u} live={live} />
        ) : p.image && at ? (
          <Image image={p.image} x={inner.x + at.dx} y={inner.y + at.dy} width={at.dw} height={at.dh} fit="fill">
            <Fx dev={p.dev} u={u} />
          </Image>
        ) : (
          <Rect rect={inner} color={EMPTY} />
        )}
        {p.image ? <Texture dev={p.dev} box={inner} u={u} /> : null}
      </Group>
    </Group>
  );
}

/** One slide at width x height: the matte / scrapbook ground, then the photos in their layout cells (live: see LiveCrop). */
export function SlideDrawing({ layout, frame, width, height, photos, live }: { layout: LayoutKey; frame: Frame; width: number; height: number; photos: SlidePhoto[]; live?: SharedValue<LiveCrop> }) {
  const u = width / UNIT;
  const { inner, cells } = slideCells(layout, frame, width, height);
  const matte = matteColor(frame);
  // scrapbook's prints keep their tilt and crop: no blur fill there
  const blur = frame.fit === 'blur' && layout !== 'scrapbook';
  return (
    <Group>
      <Rect x={0} y={0} width={width} height={height} color={matte} />
      <Group clip={rrect(rect(inner.x, inner.y, inner.w, inner.h), inner.r, inner.r)}>
        {paintOrder(layout, photos.length).map((i) => <PhotoCell key={i} c={cells[i]} p={photos[i]} u={u} blur={blur} live={blur ? undefined : live} />)}
      </Group>
    </Group>
  );
}

/** A photo's tone (Auto, Brighten) from a 24 x 24 copy; once per image. */
const tones = new WeakMap<SkImage, Tone | null>();
export function toneOf(img: SkImage): Tone | null {
  if (tones.has(img)) return tones.get(img)!;
  let tone: Tone | null = null;
  const N = 24;
  const surface = Skia.Surface.Make(N, N);
  const px = surface && (surface.getCanvas().drawImageRect(img, rect(0, 0, img.width(), img.height()), rect(0, 0, N, N), Skia.Paint()), surface.makeImageSnapshot().readPixels());
  if (px && px.length >= N * N * 4) {
    let sum = 0, sq = 0, lo = 0, hi = 0, cast = 0;
    const n = N * N;
    for (let i = 0; i < n; i++) {
      const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += l; sq += l * l; cast += b - r;
      if (l < 0.08) lo++;
      if (l > 0.96) hi++;
    }
    const mean = sum / n;
    tone = { mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)), lo: lo / n, hi: hi / n, cast: cast / n };
  }
  tones.set(img, tone);
  return tone;
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
  const frame = frameOf(d.fit);
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
    const { cells } = slideCells(s.layout, frame, width, height);
    return s.photos.map((p, j) => loadImage(p.uri, cells[j].w, cells[j].h).finally(hold));
  });
  hold();
  try {
    for (const [i, s] of slides.entries()) {
      const images = await Promise.all(loads[i]);
      const photos: SlidePhoto[] = s.photos.map((p, j) => ({ image: images[j], dev: developFor(filter, p.id), crop: p.crop }));
      const img = await drawAsImage(<SlideDrawing layout={s.layout} frame={frame} width={width} height={height} photos={photos} />, { width, height });
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
