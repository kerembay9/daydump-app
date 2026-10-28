// Adds the model asset packs (android/<pack>, see ModelPacks.kt) and the translate feature module (android/translate,
// see TranslateFeature in QueryTranslateModule.kt) to the generated android project.
const { withAppBuildGradle, withSettingsGradle, withStringsXml, AndroidConfig } = require('expo/config-plugins');

const PACKS = ['visionpack', 'facepack', 'textpack'];
const FEATURES = ['translate'];
const include = (p) => `include ':${p}'\nproject(':${p}').projectDir = new File(rootDir, '../modules/clip-embedder/android/${p}')\n`;
const list = (ps) => ps.map((p) => `':${p}'`).join(', ');
const APP = `android {\n    assetPacks = [${list(PACKS)}]\n    dynamicFeatures = [${list(FEATURES)}]`;

const settings = (s) => [...PACKS, ...FEATURES].reduce((acc, p) => (acc.includes(`':${p}'`) ? acc : acc + '\n' + include(p)), s);
const app = (s) => s.replace(/\n\s*(assetPacks|dynamicFeatures) = .*/g, '').replace(/^android \{/m, APP);
// the module's name, which Play may show while it downloads (translate/src/main/AndroidManifest.xml)
const strings = (xml) =>
  AndroidConfig.Strings.setStringItem([{ $: { name: 'translate_module_title', translatable: 'false' }, _: 'Search in other languages' }], xml);

module.exports = (config) =>
  withStringsXml(
    withAppBuildGradle(
      withSettingsGradle(config, (c) => ({ ...c, modResults: { ...c.modResults, contents: settings(c.modResults.contents) } })),
      (c) => ({ ...c, modResults: { ...c.modResults, contents: app(c.modResults.contents) } }),
    ),
    (c) => ({ ...c, modResults: strings(c.modResults) }),
  );
module.exports.settings = settings;
module.exports.app = app;
