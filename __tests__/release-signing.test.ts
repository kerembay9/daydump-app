// `expo prebuild` regenerates android/; plugins/withReleaseSigning.js puts the upload key back into app/build.gradle.
import { sign } from '../plugins/withReleaseSigning.js';

// the Expo template's signing part of android/app/build.gradle
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}`;

test('release builds sign with the upload key from the repo root, debug builds keep the debug key', () => {
  const out = sign(TEMPLATE);
  expect(out).toMatch(/signingConfigs \{\s*debug \{[^}]*\}\s*release \{\s*storeFile file\("\$\{rootDir\}\/\.\.\/daydump-release\.keystore"\)/);
  expect(out).toMatch(/debug \{\s*signingConfig signingConfigs\.debug\s*\}/);
  expect(out).toMatch(/release \{(\s*\/\/.*)*\s*signingConfig findProperty\('PICDUMP_UPLOAD_STORE_PASSWORD'\) \? signingConfigs\.release : signingConfigs\.debug/);
  expect(sign(out)).toBe(out);
});

test('a changed template fails prebuild instead of shipping a debug-signed release', () => {
  expect(() => sign(TEMPLATE.replace('signingConfigs {', 'signing {'))).toThrow(/template changed/);
});
