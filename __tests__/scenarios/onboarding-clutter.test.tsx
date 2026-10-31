import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from 'expo-router/testing-library';
import { firstRunToAsk, goToStep } from '../../jest/app';
import { photo, seedWorld } from '../../jest/world';
import { tr } from '../../src/i18n';

const ML = jest.requireMock('expo-media-library/legacy');
const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', accessPrivileges: 'all' };

test('clutter: one photo reads in the singular (a lone screenshot is not a "repeat"); more keep the plural with a grouped number', async () => {
  ML.requestPermissionsAsync.mockImplementation(async () => granted);
  ML.getPermissionsAsync.mockImplementation(async () => granted);
  await AsyncStorage.clear();
  const shot = { ...photo(new Date(2025, 5, 1, 12), [0], undefined, false), uri: 'file:///storage/emulated/0/Pictures/Screenshots/IMG_1.jpg' };
  seedWorld([shot, photo(new Date(2025, 2, 1, 10), [0])]);

  await fireEvent.press(await firstRunToAsk());
  await screen.findByText(/^You have [\d,]+ photos?\.$/, {}, { timeout: 10000 });
  await goToStep('22');
  expect(await screen.findByText('1 photo to clear.', {}, { timeout: 20000 })).toBeTruthy();

  expect(tr('onboarding.flow.clutter.title', { count: 1234, n: '1,234' })).toBe('1,234 repeats and blurry shots.');
}, 60000);
