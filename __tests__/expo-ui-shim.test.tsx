// @expo/ui is excluded from the Android build and Metro hands expo-router a stub instead (metro.config.js).
// expo-router calls into it at import time, so the stub must survive that, and fail loudly only when something renders.
import { render } from '@testing-library/react-native';
import path from 'path';

// Only our resolver is under test; Expo's real Metro config doesn't load under Jest.
jest.mock('expo/metro-config', () => ({ getDefaultConfig: () => ({ resolver: {} }) }));
const config = require('../metro.config.js');
const stubPath = path.join(__dirname, '../src/shims/expo-ui-android.js');
const ui = require(stubPath);

test('Metro resolves @expo/ui/* to the stub on Android only', () => {
  const context = { resolveRequest: () => ({ type: 'sourceFile', filePath: 'real' }) };
  expect(config.resolver.resolveRequest(context, '@expo/ui/jetpack-compose', 'android').filePath).toBe(stubPath);
  expect(config.resolver.resolveRequest(context, '@expo/ui/jetpack-compose/modifiers', 'android').filePath).toBe(stubPath);
  expect(config.resolver.resolveRequest(context, '@expo/ui/jetpack-compose', 'ios').filePath).toBe('real');
});

test('import-time calls work, rendering throws a clear error', async () => {
  expect(() => [ui.fillMaxHeight(), ui.EnterTransition.scaleIn().plus(ui.EnterTransition.expandIn())]).not.toThrow();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(render(<ui.DropdownMenu.Trigger />)).rejects.toThrow('DropdownMenu.Trigger needs @expo/ui, which is excluded from the Android build');
});
