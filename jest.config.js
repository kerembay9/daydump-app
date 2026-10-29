// No babel.config.js in the app (Metro uses Expo's default), so jest gets the same preset explicitly.
const expoBabel = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });

const expoIgnore = require('jest-expo/android/jest-preset').transformIgnorePatterns;

module.exports = {
  preset: 'jest-expo/android',
  globalSetup: '<rootDir>/jest/global-setup.js',
  setupFiles: ['<rootDir>/jest/setup.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  // expo's own deps (expo-asset, babel-preset-expo) are nested under node_modules/expo in this install
  modulePaths: ['<rootDir>/node_modules/expo/node_modules'],
  transform: {
    '\\.m?[jt]sx?$': ['babel-jest', { caller: { name: 'metro', bundler: 'jest', platform: 'android' }, presets: [expoBabel] }],
  },
  // jest-expo's list plus the ESM packages this app adds
  transformIgnorePatterns: [
    expoIgnore[0].replace('))', '|@shopify/react-native-skia|lucide-react-native))'),
    ...expoIgnore.slice(1),
  ],
};
