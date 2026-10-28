// Adds the model asset packs (android/<pack>, see ModelPacks.kt) and the translate feature module (android/translate,
// see TranslateFeature in QueryTranslateModule.kt) to the generated android project.
// app.json's { "packs": <config> } picks which packs ship in the install; the rest are fast-follow downloads (MODELS.md).
const { withAppBuildGradle, withGradleProperties, withSettingsGradle, withStringsXml, AndroidConfig } = require('expo/config-plugins');

const PACKS = ['visionpack', 'facepack', 'textpack'];
const CONFIGS = { split: [], vis: ['visionpack'], 'vis-face': ['visionpack', 'facepack'], all: PACKS };
const FEATURES = ['translate'];
const include = (p) => `include ':${p}'\nproject(':${p}').projectDir = new File(rootDir, '../modules/clip-embedder/android/${p}')\n`;
const list = (ps) => ps.map((p) => `':${p}'`).join(', ');

const settings = (s) => [...PACKS, ...FEATURES].reduce((acc, p) => (acc.includes(`':${p}'`) ? acc : acc + '\n' + include(p)), s);
const app = (s, base = []) =>
  s
    .replace(/\n\s*(assetPacks|dynamicFeatures) = .*/g, '')
    .replace(/^android \{/m, `android {\n    assetPacks = [${list(PACKS.filter((p) => !base.includes(p)))}]\n    dynamicFeatures = [${list(FEATURES)}]`);
// the module's build.gradle adds these packs' assets to the release APK (ModelPacks.inApk then finds them, Play isn't asked)
const props = (ps, base) => [
  ...ps.filter((p) => p.key !== 'clipEmbedder.basePacks'),
  { type: 'property', key: 'clipEmbedder.basePacks', value: base.join(',') },
];
// the module's name, which Play may show while it downloads (translate/src/main/AndroidManifest.xml)
const strings = (xml) =>
  AndroidConfig.Strings.setStringItem([{ $: { name: 'translate_module_title', translatable: 'false' }, _: 'Search in other languages' }], xml);

module.exports = (config, { packs = 'split' } = {}) => {
  const base = CONFIGS[packs];
  if (!base) throw new Error(`clip-embedder: unknown packs "${packs}" (${Object.keys(CONFIGS).join(', ')})`);
  return withGradleProperties(
    withStringsXml(
      withAppBuildGradle(
        withSettingsGradle(config, (c) => ({ ...c, modResults: { ...c.modResults, contents: settings(c.modResults.contents) } })),
        (c) => ({ ...c, modResults: { ...c.modResults, contents: app(c.modResults.contents, base) } }),
      ),
      (c) => ({ ...c, modResults: strings(c.modResults) }),
    ),
    (c) => ({ ...c, modResults: props(c.modResults, base) }),
  );
};
module.exports.settings = settings;
module.exports.app = app;
module.exports.props = props;
module.exports.CONFIGS = CONFIGS;
