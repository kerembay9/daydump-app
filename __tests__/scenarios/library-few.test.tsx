import { fireEvent, screen } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firstRunToAsk } from '../../jest/app';
import { photo, seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', accessPrivileges: 'all' };

beforeAll(() => seedWorld(Array.from({ length: 5 }, (_, i) => photo(new Date(2026, 4, 1 + i), [1]))));
beforeEach(async () => {
  await AsyncStorage.clear();
  ML.requestPermissionsAsync.mockImplementation(async () => granted);
  ML.getPermissionsAsync.mockImplementation(async () => granted);
});

test('full access to under 100 photos: screen 5 says dumps will be small', async () => {
  await fireEvent.press(await firstRunToAsk());
  expect(await screen.findByText(/^PicDump works best with 100 or more photos/, {}, { timeout: 10000 })).toBeTruthy();
}, 30000);
