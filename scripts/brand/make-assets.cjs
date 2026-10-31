// Builds the app's icon, splash and favicon PNGs from the logo SVGs in design/brand/. Run: npm run brand:assets
//
// The logo is a rounded tile (first <path>) with the artwork on top. Only <path> elements with fill/stroke are supported,
// which is all the exported SVGs contain. CanvasKit comes with @shopify/react-native-skia (dev tool only, nothing ships).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const BRAND = path.join(ROOT, 'design', 'brand');
const ASSETS = path.join(ROOT, 'assets');
const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');

const PRIMARY = path.join(BRAND, 'picdump-logo.svg'); // 01 espresso: light tile, dark ink
const DARK = path.join(BRAND, 'colorways', '09-ristretto.svg'); // dark tile, cream ink: for dark surfaces

// ---- PNG encoding (CanvasKit gives RGBA; the iOS icon must be RGB with no alpha channel) ----
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePng(rgba, w, h, withAlpha) {
  const bpp = withAlpha ? 4 : 3;
  const raw = Buffer.alloc((w * bpp + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * bpp + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = y * (w * bpp + 1) + 1 + x * bpp;
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
      if (withAlpha) raw[d + 3] = rgba[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = withAlpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const CK = await CanvasKitInit({ locateFile: (f) => path.join(path.dirname(require.resolve('canvaskit-wasm/bin/canvaskit.js')), f) });

  const parse = (file) => {
    const svg = fs.readFileSync(file, 'utf8');
    const els = [...svg.matchAll(/<path\b([^>]*)\/>/g)].map((m) => {
      const get = (n) => (m[1].match(new RegExp(`\\b${n}="([^"]*)"`)) || [])[1];
      return { d: get('d'), fill: get('fill'), stroke: get('stroke'), sw: Number(get('stroke-width') || 1), join: get('stroke-linejoin') };
    });
    return { tile: els[0], art: els.slice(1) };
  };

  const bounds = (list) => {
    let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
    for (const e of list) {
      const p = CK.Path.MakeFromSVGString(e.d); const bb = p.getBounds(); p.delete();
      const pad = e.stroke ? e.sw / 2 : 0;
      l = Math.min(l, bb[0] - pad); t = Math.min(t, bb[1] - pad); r = Math.max(r, bb[2] + pad); b = Math.max(b, bb[3] + pad);
    }
    return { l, t, r, b };
  };

  /** mode: 'tile' (as drawn, rounded, transparent corners) | 'square' (tile colour to the corners, opaque) | 'art' (art only, transparent)
   *  safe: for 'art', the art's bounding-circle radius as a fraction of the canvas width. */
  function render(logo, size, { mode, safe = 0.3 }) {
    const surface = CK.MakeSurface(size, size);
    const c = surface.getCanvas();
    c.clear(CK.TRANSPARENT);
    let scale = size / 512, tx = 0, ty = 0;
    if (mode === 'art') {
      const { l, t, r, b } = bounds(logo.art);
      const radius = Math.hypot(r - l, b - t) / 2;
      scale = (safe * size) / radius;
      tx = size / 2 - ((l + r) / 2) * scale; ty = size / 2 - ((t + b) / 2) * scale;
    }
    c.save(); c.translate(tx, ty); c.scale(scale, scale);
    const paint = (style, col, sw, join) => {
      const p = new CK.Paint(); p.setAntiAlias(true); p.setStyle(style); p.setColor(col);
      if (style === CK.PaintStyle.Stroke) { p.setStrokeWidth(sw); if (join === 'round') p.setStrokeJoin(CK.StrokeJoin.Round); }
      return p;
    };
    const draw = (e) => {
      const p = CK.Path.MakeFromSVGString(e.d);
      if (e.fill && e.fill !== 'none') { const q = paint(CK.PaintStyle.Fill, CK.parseColorString(e.fill)); c.drawPath(p, q); q.delete(); }
      if (e.stroke) { const q = paint(CK.PaintStyle.Stroke, CK.parseColorString(e.stroke), e.sw, e.join); c.drawPath(p, q); q.delete(); }
      p.delete();
    };
    if (mode === 'tile') draw(logo.tile);
    if (mode === 'square') { const q = paint(CK.PaintStyle.Fill, CK.parseColorString(logo.tile.fill)); c.drawRect([0, 0, 512, 512], q); q.delete(); }
    for (const e of logo.art) draw(e);
    c.restore();
    const info = { width: size, height: size, colorType: CK.ColorType.RGBA_8888, alphaType: CK.AlphaType.Unpremul, colorSpace: CK.ColorSpace.SRGB };
    const px = surface.makeImageSnapshot().readPixels(0, 0, info);
    surface.delete();
    return px;
  }

  const out = (dir, name, logo, size, opts, withAlpha) => {
    const file = path.join(dir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, encodePng(render(logo, size, opts), size, size, withAlpha));
    console.log(path.relative(ROOT, file).padEnd(46), size + 'px', withAlpha ? 'RGBA' : 'RGB, opaque', Math.round(fs.statSync(file).size / 1024) + ' KB');
  };

  const light = parse(PRIMARY), dark = parse(DARK);
  // app icons
  out(ASSETS, 'icon.png', light, 1024, { mode: 'square' }, false); // iOS and legacy Android: the system rounds it
  out(ASSETS, 'android-icon-foreground.png', light, 1024, { mode: 'art', safe: 0.3056 }, true); // adaptive: art inside the middle 66%
  out(ASSETS, 'icon-dark.png', dark, 1024, { mode: 'art', safe: 0.3056 }, true); // alternate "dark" launcher icon (dev switch)
  // splash
  out(ASSETS, 'splash-icon.png', light, 1024, { mode: 'art', safe: 0.42 }, true);
  out(ASSETS, 'splash-icon-dark.png', dark, 1024, { mode: 'art', safe: 0.42 }, true);
  // web
  out(ASSETS, 'favicon.png', light, 48, { mode: 'tile' }, true);
  // exports for people (not used by the build)
  out(path.join(BRAND, 'png'), 'picdump-logo-1024.png', light, 1024, { mode: 'tile' }, true);
  out(path.join(BRAND, 'png'), 'picdump-logo-512.png', light, 512, { mode: 'tile' }, true);
  out(path.join(BRAND, 'png'), 'picdump-logo-dark-1024.png', dark, 1024, { mode: 'tile' }, true);
  out(path.join(BRAND, 'png'), 'picdump-mark-transparent-1024.png', light, 1024, { mode: 'art', safe: 0.5 }, true);
})();
