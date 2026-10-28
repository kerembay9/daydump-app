// app.json's { "packs": ... } on the clip-embedder plugin moves model packs from fast-follow downloads into the install.
import plugin from '../modules/clip-embedder/app.plugin.js';

const { app, props, CONFIGS } = plugin as any;
const GRADLE = 'android {\n    ndkVersion rootProject.ext.ndkVersion\n}';

test('vis-face ships vision and faces in the install and leaves text a download', () => {
  const out = app(GRADLE, CONFIGS['vis-face']);
  expect(out).toContain("assetPacks = [':textpack']");
  expect(out).toContain("dynamicFeatures = [':translate']");
  expect(app(out, CONFIGS['vis-face'])).toBe(out);
  expect(props([{ type: 'property', key: 'clipEmbedder.basePacks', value: '' }], CONFIGS['vis-face'])).toEqual([
    { type: 'property', key: 'clipEmbedder.basePacks', value: 'visionpack,facepack' },
  ]);
});

test('split (the default) downloads every pack; switching back rewrites the list', () => {
  const out = app(app(GRADLE, CONFIGS['vis-face']), CONFIGS.split);
  expect(out).toContain("assetPacks = [':visionpack', ':facepack', ':textpack']");
  expect(out.match(/assetPacks/g)).toHaveLength(1);
  expect(() => (plugin as any)({}, { packs: 'vision' })).toThrow(/unknown packs/);
});
