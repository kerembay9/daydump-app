import { fireEvent, screen } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firstRunToAsk } from '../../jest/app';
import { seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const limited = { status: 'denied', granted: false, canAskAgain: true, expires: 'never', accessPrivileges: 'limited' };

// "Select photos" with enough picked: 4b lets them continue with those
beforeAll(() => seedWorld());
beforeEach(async () => {
  await AsyncStorage.clear();
  ML.requestPermissionsAsync.mockImplementation(async () => limited);
  ML.getPermissionsAsync.mockImplementation(async () => limited);
});

test('limited access with enough photos shared: 4b lets them continue with those', async () => {
  await fireEvent.press(await firstRunToAsk());
  expect(await screen.findByText('Limited access works too.')).toBeTruthy();
  expect(await screen.findByText('Continue with selected photos')).toBeTruthy();
}, 30000);
