// https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @expo/ui is left out of the Android build (package.json expo.autolinking.android.exclude): it brings Jetpack
// Compose (~2.5 MB) and only expo-router's Stack.Toolbar uses it, which we don't. expo-router still imports it at
// startup, and it throws without its native module, so on Android those imports get a stub that throws only if a
// toolbar renders. To use Stack.Toolbar, delete both this and the exclude.
const expoUiStub = path.join(__dirname, 'src/shims/expo-ui-android.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'android' && moduleName.startsWith('@expo/ui/')) return { type: 'sourceFile', filePath: expoUiStub };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
