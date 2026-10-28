// Alternate launcher icons for the dev switch in Profile (AppIconModule.kt). The launcher intent filter moves off
// MainActivity onto one <activity-alias> per icon: MainActivity_default (app.json's icon, enabled) and one per
// entry here (disabled). app.json: ["./plugins/withAppIcons.js", { "<name>": { "foreground", "background", "legacy"? } }]
// foreground: the adaptive icon's foreground (keep the art inside the middle 66%), background: a color,
// legacy: the square icon for Android 7 (defaults to foreground).
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

const MAIN = 'android.intent.action.MAIN';
const LAUNCHER = 'android.intent.category.LAUNCHER';
const isLauncher = (f) => f.action?.some((a) => a.$['android:name'] === MAIN) && f.category?.some((c) => c.$['android:name'] === LAUNCHER);
const alias = (name, icon, round, enabled) => ({
  $: { 'android:name': `.MainActivity_${name}`, 'android:enabled': String(enabled), 'android:exported': 'true', 'android:icon': icon, 'android:roundIcon': round, 'android:targetActivity': '.MainActivity' },
  'intent-filter': [{ action: [{ $: { 'android:name': MAIN } }], category: [{ $: { 'android:name': LAUNCHER } }] }],
});

const manifest = (m, names) => {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(m);
  const main = AndroidConfig.Manifest.getMainActivityOrThrow(m);
  main['intent-filter'] = (main['intent-filter'] ?? []).filter((f) => !isLauncher(f));
  app['activity-alias'] = [
    ...(app['activity-alias'] ?? []).filter((a) => !a.$['android:name'].startsWith('.MainActivity_')),
    alias('default', '@mipmap/ic_launcher', '@mipmap/ic_launcher_round', true),
    ...names.map((n) => alias(n, `@mipmap/ic_launcher_${n}`, `@mipmap/ic_launcher_${n}`, false)),
  ];
  return m;
};

const resources = (root, res, icons) => {
  const put = (dir, file, data) => { fs.mkdirSync(path.join(res, dir), { recursive: true }); fs.writeFileSync(path.join(res, dir, file), data); };
  for (const [n, { foreground, background, legacy = foreground }] of Object.entries(icons)) {
    put('drawable-nodpi', `ic_launcher_${n}_foreground.png`, fs.readFileSync(path.join(root, foreground)));
    put('mipmap-xxxhdpi', `ic_launcher_${n}.png`, fs.readFileSync(path.join(root, legacy)));
    put('values', `ic_launcher_${n}.xml`, `<resources><color name="ic_launcher_${n}_background">${background}</color></resources>\n`);
    put('mipmap-anydpi-v26', `ic_launcher_${n}.xml`, `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_${n}_background"/>
  <foreground android:drawable="@drawable/ic_launcher_${n}_foreground"/>
</adaptive-icon>
`);
  }
};

module.exports = (config, icons = {}) =>
  withDangerousMod(
    withAndroidManifest(config, (c) => ({ ...c, modResults: manifest(c.modResults, Object.keys(icons)) })),
    ['android', (c) => { resources(c.modRequest.projectRoot, path.join(c.modRequest.platformProjectRoot, 'app/src/main/res'), icons); return c; }],
  );
module.exports.manifest = manifest;
