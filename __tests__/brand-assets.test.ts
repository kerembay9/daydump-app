import fs from 'node:fs';
import path from 'node:path';
import { brand } from '../src/theme/tokens';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const png = (p: string) => { const b = fs.readFileSync(path.join(root, p)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };
const app = JSON.parse(read('app.json')).expo;

test('brand tokens match the logo SVGs', () => {
  const light = read('design/brand/picdump-logo.svg');
  expect(light).toContain(`fill="${brand.parchment}"`);
  expect(light).toContain(`fill="${brand.espresso}"`);
  expect(light).toContain(`fill="${brand.paper}"`);
  expect(light).toContain(`stroke="${brand.knockout}"`);
  const dark = read('design/brand/colorways/09-ristretto.svg');
  for (const c of [brand.ristretto.tile, brand.ristretto.ink, brand.ristretto.paper]) expect(dark).toContain(`"${c}"`);
});

test('app.json backgrounds use the brand colours', () => {
  expect(app.android.adaptiveIcon.backgroundColor).toBe(brand.parchment);
  const splash = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
  expect(splash.backgroundColor).toBe(brand.parchment);
  expect(splash.dark.backgroundColor).toBe(brand.ristretto.tile);
  const icons = app.plugins.find((p: unknown) => Array.isArray(p) && String(p[0]).includes('withAppIcons'))[1];
  expect(icons.dark.background).toBe(brand.ristretto.tile);
});

test('the iOS icon is 1024 px with no alpha channel (App Store Connect rejects one)', () => {
  const i = png('assets/icon.png');
  expect(i.w).toBe(1024); expect(i.h).toBe(1024);
  expect(i.colorType).toBe(2); // RGB; 6 would be RGBA
});

test('adaptive foreground, splash and dark splash exist at 1024 px', () => {
  for (const f of ['assets/android-icon-foreground.png', 'assets/splash-icon.png', 'assets/splash-icon-dark.png', 'assets/icon-dark.png']) {
    const i = png(f);
    expect([f, i.w, i.h]).toEqual([f, 1024, 1024]);
  }
  expect(app.icon).toBe('./assets/icon.png');
  expect(app.android.adaptiveIcon.foregroundImage).toBe('./assets/android-icon-foreground.png');
});
