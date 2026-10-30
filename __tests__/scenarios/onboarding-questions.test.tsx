import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from 'expo-router/testing-library';
import { firstRunToAsk, pressLast } from '../../jest/app';
import { seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', accessPrivileges: 'all' };

beforeAll(() => seedWorld());
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  ML.requestPermissionsAsync.mockImplementation(async () => granted);
  ML.getPermissionsAsync.mockImplementation(async () => granted);
});

const press = async (text: string) => fireEvent.press((await screen.findAllByText(text)).at(-1)!);

test('questions: Continue waits for an answer, where they post sets the shape, and a style edit returns to the recap', async () => {
  await fireEvent.press(await firstRunToAsk());
  await pressLast('Continue'); // 5 -> 6
  expect(await screen.findByText('Where do you post?')).toBeTruthy();

  await pressLast('Continue'); // nothing picked: stays
  expect(screen.queryByText('How often do you post?')).toBeNull();
  await press('Instagram stories');
  await pressLast('Continue');
  expect(await screen.findByText('How often do you post?')).toBeTruthy();

  await press('Weekly'); await pressLast('Continue'); // 7
  await press('Food'); await pressLast('Continue'); // 8
  await press('This week'); await pressLast('Continue'); // 9
  await press('I forget'); await pressLast('Continue'); // 10
  expect(await screen.findByText("That's exactly what PicDump does.")).toBeTruthy(); // 11
  expect(screen.getByText(/A quiet reminder at 8 PM/)).toBeTruthy();
  await pressLast('Continue');
  await pressLast('Continue'); // 12, full access
  expect(await screen.findByText('How many photos per dump?')).toBeTruthy(); // 13
  await pressLast('Continue');
  expect(await screen.findByText('Picked from where you post.')).toBeTruthy(); // 14: the shape came from where they post
  for (let i = 0; i < 5; i++) await pressLast('Continue'); // 14 -> 19
  expect(await screen.findByText('Here is your style.')).toBeTruthy();
  expect(screen.getByText(/Warm 35mm · 9:16 · Scrapbook · 6 photos/)).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Scrapbook, Edit'));
  expect(await screen.findByText('Pick a layout vibe.')).toBeTruthy();
  await press('Split');
  await pressLast('Continue'); // back to the recap, not on to the look
  expect(await screen.findByText(/Warm 35mm · 9:16 · Split · 6 photos/)).toBeTruthy();
  expect(screen.queryByText('Choose a look.')).toBeNull();
}, 60000);
