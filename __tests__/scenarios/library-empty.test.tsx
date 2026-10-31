import { fireEvent, screen } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firstRunToAsk } from '../../jest/app';
import { photo, seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', accessPrivileges: 'all' };

beforeAll(() => seedWorld([]));
beforeEach(async () => {
  await AsyncStorage.clear();
  ML.requestPermissionsAsync.mockImplementation(async () => granted);
  ML.getPermissionsAsync.mockImplementation(async () => granted);
});

test('full access to an empty library: screen 5 says no photos were found, without the scan', async () => {
  await fireEvent.press(await firstRunToAsk());
  expect(await screen.findByText("We couldn't find any photos.", {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.queryByText('Looking through your library…')).toBeNull();
}, 30000);
