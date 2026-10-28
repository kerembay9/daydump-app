// Signs release builds with the upload key, so `expo prebuild` doesn't drop it (see RELEASE_SIGNING.md).
// The keystore stays at the repo root (gitignored); the passwords come from ~/.gradle/gradle.properties.
// Without them (another machine, CI) release falls back to the debug key, as the Expo template does.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE = `
        release {
            storeFile file("\${rootDir}/../daydump-release.keystore")
            storePassword findProperty('PICDUMP_UPLOAD_STORE_PASSWORD')
            keyAlias 'daydump-key-alias'
            keyPassword findProperty('PICDUMP_UPLOAD_KEY_PASSWORD')
        }`;
const USE = "signingConfig findProperty('PICDUMP_UPLOAD_STORE_PASSWORD') ? signingConfigs.release : signingConfigs.debug";

const sign = (s) => {
  if (s.includes('daydump-key-alias')) return s;
  const out = s
    .replace(/(signingConfigs \{\s*debug \{[^}]*\})/, `$1${RELEASE}`)
    .replace(/(buildTypes \{[\s\S]*?release \{(?:\s*\/\/.*)*\s*)signingConfig signingConfigs\.debug/, `$1${USE}`);
  if (!out.includes(USE) || !out.includes('daydump-key-alias')) throw new Error('withReleaseSigning: build.gradle template changed');
  return out;
};

module.exports = (config) => withAppBuildGradle(config, (c) => ({ ...c, modResults: { ...c.modResults, contents: sign(c.modResults.contents) } }));
module.exports.sign = sign;
