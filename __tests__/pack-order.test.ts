// The model packs download faces -> vision -> text (onboarding's selfie step comes first and needs faces), and Play
// starts all three at install. The order lives in ModelPacks.kt's enum plus its faces-first pick in next().
import fs from 'fs';
import path from 'path';

const android = path.join(__dirname, '../modules/clip-embedder/android');

test('every pack is fast-follow', () => {
  for (const p of ['facepack', 'visionpack', 'textpack']) {
    expect(fs.readFileSync(path.join(android, p, 'build.gradle'), 'utf8')).toMatch(/deliveryType = 'fast-follow'/);
  }
});

test('the app fetches faces, then vision, then text', () => {
  const kt = fs.readFileSync(path.join(android, 'src/main/java/expo/modules/clipembedder/ModelPacks.kt'), 'utf8');
  expect([...kt.matchAll(/^\s+(\w+)\("\w+pack"/gm)].map((m) => m[1])).toEqual(['FACES', 'VISION', 'TEXT']);
  expect(kt).toMatch(/missing\.firstOrNull \{ it == Pack\.FACES \}/);
});
