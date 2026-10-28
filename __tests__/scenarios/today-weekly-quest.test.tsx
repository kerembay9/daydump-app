import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { defaultLibrary, NAMES, photo, seedWorld } from '../../jest/world';
import { questFor } from '../../src/services/today';

// Wednesday, Oct 28 2026. The week's quest was found on Monday (the app was open then: Monday's card is saved with its print
// and sticker). Today another photo of it comes in, and street + sunset make today's bingo: the quest stays Monday's.
const now = new Date(2026, 9, 28, 20);
const at = (h: number, d = 0) => new Date(2026, 9, 28 - d, h);
const quest = questFor(now.getTime());
NAMES[12] = quest.phrase;
const history = Array.from({ length: 10 }, (_, i) => [photo(at(12, i + 1), [0]), photo(at(19, i + 1), [9])]).flat();
const mon = photo(at(10, 2), [12]);
beforeAll(() => seedWorld([...defaultLibrary(), ...history, photo(at(9), [0]), photo(at(11), [12]), photo(at(18), [9])]));
beforeEach(() => jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] }));
afterEach(() => jest.useRealTimers());

test('the side quest is one a week, Monday to Sunday', () => {
  expect(questFor(new Date(2026, 9, 26, 0, 5).getTime())).toBe(quest);
  expect(questFor(new Date(2026, 10, 1, 23).getTime())).toBe(quest);
  expect(questFor(new Date(2026, 10, 2, 0, 5).getTime())).not.toBe(quest);
  expect(questFor(new Date(2026, 9, 25, 23).getTime())).not.toBe(quest);
});

test('Today: a quest found on Monday stays found all week, its sticker on Monday’s polaroid', async () => {
  await AsyncStorage.setItem('@daydump_today', JSON.stringify({ days: { '2026-10-26': { cells: Array(9).fill(''), print: mon.uri, quest: quest.key, questUri: mon.uri } } }));
  const app = await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(/^Bingo: /, {}, { timeout: 10000 }));
  await waitFor(() => expect(app.getPathname()).toBe('/today'));
  expect(await screen.findByText('Found on Monday')).toBeTruthy();
  expect(screen.getByText('Stuck on Monday’s polaroid. Next quest on Monday.')).toBeTruthy();
  expect(JSON.stringify(screen.getByTestId('quest-photo').props.source)).toContain(mon.uri);

  await fireEvent.press(screen.getByLabelText('Album'));
  expect(within(await screen.findByLabelText(`Mon: bingo, ${quest.label}`)).getByTestId('album-sticker')).toBeTruthy();
  expect(screen.getByLabelText('Today: bingo')).toBeTruthy();
  expect(screen.getByLabelText('Tue: no bingo')).toBeTruthy();
  expect(screen.getByLabelText('Thu: not yet')).toBeTruthy();
  expect(screen.getByText('2 bingos · quest found')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Month'));
  expect(await screen.findByText('October: 2 bingos, 1 side quest')).toBeTruthy();
  // before Monday's card the app wasn't played: those days aren't misses
  expect(screen.getByLabelText('25: no card')).toBeTruthy();
  expect(screen.getByLabelText('27: no bingo')).toBeTruthy();
}, 30000);
