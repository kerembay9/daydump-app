// Adds the model asset packs (android/<pack>, see ModelPacks.kt) to the generated android project.
const { withAppBuildGradle, withSettingsGradle } = require('expo/config-plugins');

const PACKS = ['visionpack', 'facepack', 'textpack'];
const include = (p) => `include ':${p}'\nproject(':${p}').projectDir = new File(rootDir, '../modules/clip-embedder/android/${p}')\n`;
const APP = `android {\n    assetPacks = [${PACKS.map((p) => `':${p}'`).join(', ')}]`;

const settings = (s) => PACKS.reduce((acc, p) => (acc.includes(`':${p}'`) ? acc : acc + '\n' + include(p)), s);
const app = (s) => s.replace(/\n\s*assetPacks = .*/, '').replace(/^android \{/m, APP);

module.exports = (config) =>
  withAppBuildGradle(
    withSettingsGradle(config, (c) => ({ ...c, modResults: { ...c.modResults, contents: settings(c.modResults.contents) } })),
    (c) => ({ ...c, modResults: { ...c.modResults, contents: app(c.modResults.contents) } }),
  );
module.exports.settings = settings;
module.exports.app = app;
