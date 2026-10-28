import path from 'path';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', accessPrivileges: 'all' };
const DONE = '@daydump_has_completed_onboarding';

beforeAll(() => seedWorld());
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  ML.requestPermissionsAsync.mockImplementation(async () => granted);
  ML.getPermissionsAsync.mockImplementation(async () => granted);
});

/** First run, swiped to the privacy slide. */
async function toAsk() {
  await renderRouter(path.resolve(__dirname, '../../src/app'), { initialUrl: '/' });
  let pager = await screen.findByText('Turn camera roll chaos into dumps', {}, { timeout: 10000 });
  while (!pager.props.onScroll) pager = pager.parent!;
  await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: Dimensions.get('window').width } } });
  return screen.findByText('Allow photos & continue');
}

test('onboarding: done is saved at the end, not at the photo grant (killed before the recap ask, it shows again)', async () => {
  await fireEvent.press(await toAsk());
  expect(await screen.findByText('Your day, ready at 8 PM')).toBeTruthy();
  expect(await AsyncStorage.getItem(DONE)).toBeNull();

  await fireEvent.press(screen.getByText('Not now'));
  await fireEvent.press(await screen.findByText(/^Skip/));
  expect(await AsyncStorage.getItem(DONE)).toBe('true');
}, 30000);
