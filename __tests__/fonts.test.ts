// The bundled Inter is cut to Latin + symbols (scripts/build_assets.py fonts). A character outside that falls back to
// the system font, so it still reads, just in another typeface. This keeps every string the app ships out of that:
// any character in src/ that the original font has must still be in the cut one.
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

/** The code points a TrueType font maps to a glyph (cmap formats 4 and 12). */
function codepoints(file: string): Set<number> {
  const b = fs.readFileSync(file);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tables = v.getUint16(4);
  let cmap = 0;
  for (let i = 0; i < tables; i++) if (b.toString('latin1', 12 + i * 16, 16 + i * 16) === 'cmap') cmap = v.getUint32(20 + i * 16);
  const out = new Set<number>();
  for (let i = 0; i < v.getUint16(cmap + 2); i++) {
    const o = cmap + v.getUint32(cmap + 8 + i * 8);
    if (v.getUint16(o) === 12) {
      for (let g = 0; g < v.getUint32(o + 12); g++) {
        for (let c = v.getUint32(o + 16 + g * 12); c <= v.getUint32(o + 20 + g * 12); c++) out.add(c);
      }
    } else if (v.getUint16(o) === 4) {
      const seg2 = v.getUint16(o + 6);
      for (let s = 0; s < seg2; s += 2) {
        const end = v.getUint16(o + 14 + s), start = v.getUint16(o + 16 + seg2 + s);
        const delta = v.getUint16(o + 16 + 2 * seg2 + s), ro = o + 16 + 3 * seg2 + s, range = v.getUint16(ro);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const g = range ? v.getUint16(ro + range + 2 * (c - start)) : 1;
          if (g) out.add(c);
        }
      }
    }
  }
  return out;
}

const used = new Set<number>();
for (const f of fs.readdirSync(path.join(root, 'src'), { recursive: true }) as string[]) {
  if (/\.(tsx?|json)$/.test(f)) for (const ch of fs.readFileSync(path.join(root, 'src', f), 'utf8')) used.add(ch.codePointAt(0)!);
}

const fonts = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  .expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-font')[1].fonts as string[];

test.each(fonts)('%s covers every character the app ships', (font) => {
  const name = path.basename(font);
  const [family] = name.split('_');
  const pkg = family === 'Inter' ? 'inter' : 'source-serif-4';
  const original = codepoints(path.join(root, 'node_modules/@expo-google-fonts', pkg, name.slice(family.length + 1, -4), name));
  const cut = codepoints(path.join(root, font));
  expect(cut.size).toBeGreaterThan(500);
  const missing = [...used].filter((c) => original.has(c) && !cut.has(c));
  expect(missing.map((c) => `U+${c.toString(16).toUpperCase()} ${String.fromCodePoint(c)}`)).toEqual([]);
});
