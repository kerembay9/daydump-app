import { Linking } from 'react-native';
import { fireEvent, screen } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firstRunToAsk } from '../../jest/app';
import { photo, seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const limited = { status: 'denied', granted: false, canAskAgain: true, expires: 'never', accessPrivileges: 'limited' };

// "Select photos" with a handful picked: not enough for dumps, so there is no way on from 4b until more are shared
beforeAll(() => seedWorld(Array.from({ length: 5 }, (_, i) => photo(new Date(2026, 4, 1 + i), [1]))));
beforeEach(async () => {
  await AsyncStorage.clear();
  ML.requestPermissionsAsync.mockImplementation(async () => limited);
  ML.getPermissionsAsync.mockImplementation(async () => limited);
});

test('limited access with only a few photos shared: 4b asks for more and offers no continue', async () => {
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  await fireEvent.press(await firstRunToAsk());
  expect(await screen.findByText('Share a few more photos')).toBeTruthy();
  expect(screen.queryByText('Continue with selected photos')).toBeNull();
  await fireEvent.press(screen.getByText('Open settings'));
  expect(open).toHaveBeenCalledTimes(1);
}, 30000);
