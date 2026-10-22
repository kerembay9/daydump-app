// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"], // the @typescript-eslint plugin is only registered for TS files
    rules: {
      // The package root bundles all ~1,500 icons (~1.7 MB of JS); type imports are erased, so they're fine.
      "@typescript-eslint/no-restricted-imports": ["error", {
        paths: [{ name: "lucide-react-native", allowTypeImports: true, message: "Import the icon itself: lucide-react-native/icons/<name>." }],
      }],
    },
  },
]);
