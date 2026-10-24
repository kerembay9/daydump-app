#!/usr/bin/env bash
# Fresh install of the release build, the way Play delivers it: base APK first, then the model packs download
# (bundletool --local-testing copies them to the phone and the app fetches them from there, so faster than Play).
# Uninstalls first: no index, no settings, no models. Pick the phone with ANDROID_SERIAL if more than one is connected.
#   scripts/reinstall.sh            build, then install
#   scripts/reinstall.sh --no-build install the last build
set -euo pipefail
cd "$(dirname "$0")/../android"
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk} JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
ADB=$ANDROID_HOME/platform-tools/adb

[ "${1:-}" = --no-build ] || NODE_ENV=production ./gradlew :app:bundleRelease -q

# bundletool and its deps from the Gradle cache (the Android Gradle plugin brings them)
jar() { find ~/.gradle/caches/modules-2/files-2.1 -name "$1" | head -1; }
CP=$(for j in bundletool-1.18.1 aapt2-proto-8.13.2-14304508 auto-value-annotations-1.6.2 error_prone_annotations-2.41.0 \
  guava-33.3.1-jre protobuf-java-3.25.5 protobuf-java-util-3.25.5 dagger-2.28.3 javax.inject-1 jose4j-0.9.5 \
  slf4j-api-2.0.17 failureaccess-1.0.3 gson-2.13.2 kotlin-stdlib-2.2.21; do jar "$j.jar"; done | paste -sd:)
BT="$JAVA_HOME/bin/java -cp $CP com.android.tools.build.bundletool.BundleToolMain"

APKS=build/picdump-local.apks
rm -f $APKS
$BT build-apks --bundle=app/build/outputs/bundle/release/app-release.aab --output=$APKS --local-testing \
  --aapt2="$(ls -d "$ANDROID_HOME"/build-tools/*/ | tail -1)aapt2" \
  --ks=app/debug.keystore --ks-pass=pass:android --ks-key-alias=androiddebugkey --key-pass=pass:android
$ADB uninstall com.horizonzeta.picdump || true
# "run-as: package not debuggable … Failed to remove working directory" is harmless: the uninstall already cleared it
$BT install-apks --apks=$APKS --adb="$ADB"
echo "Installed. Open PicDump on the phone."
