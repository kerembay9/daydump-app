import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import * as MediaLibrary from 'expo-media-library/legacy';
import { burst, byId, defaultLibrary, NAMES, photo, seedWorld } from '../../jest/world';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { questFor } from '../../src/services/today';

// The last 10 days: a street and a sunset every day, so those are the two prompts this user shoots most and sit either side
// of the free middle. Today: a burst of one brunch shot (the other takes are the same shot), a street (15:00), a sunset (18:00)
// and, at 16:00, a photo of today's side quest (concept 12 is named after it).
const now = new Date();
const at = (h: number, d = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, h);
const quest = questFor(Date.now());
NAMES[12] = quest.phrase;
const found = photo(at(16), [12]);
const history = Array.from({ length: 10 }, (_, i) => [photo(at(12, i + 1), [0]), photo(at(19, i + 1), [9])]).flat();
beforeAll(() => seedWorld([...defaultLibrary(), ...history, ...burst(at(11), 3, [7]), photo(at(15), [0]), found, photo(at(18), [9])]));

test('Today hub: the card is drawn from what you shoot, two everyday photos make a bingo and a print, one square swaps', async () => {
  const app = await bootApp('/');
  const card = await screen.findByLabelText('Bingo: Bingo! Today’s print is in', {}, { timeout: 10000 });
  expect(screen.queryByLabelText('Preview A week in Seattle')).toBeNull();

  await fireEvent.press(card);
  await waitFor(() => expect(app.getPathname()).toBe('/today'));
  expect(await screen.findByLabelText('The sky, done')).toBeTruthy();
  expect(screen.getByLabelText('Somewhere wide, done')).toBeTruthy();
  expect(screen.getByText(/^Bingo! Today’s print is in/)).toBeTruthy();
  // this week's side quest: found today, and the stamp holds that photo
  expect(screen.getByText('Found today')).toBeTruthy();
  expect(screen.getByText('Stuck on today’s polaroid. Next quest on Monday.')).toBeTruthy();
  expect(JSON.stringify(screen.getByTestId('quest-photo').props.source)).toContain(byId(found.id)!.uri);

  // the bingo card and the found quest save to the PicDump album and share with their hashtags
  const share = jest.spyOn(ClipEmbedder!, 'shareImages');
  // the captured photos are RN Images, which clip to their rounded square in the saved PNG (expo-image spills out of it there)
  for (const id of ['square-photo', 'quest-photo']) expect(screen.getAllByTestId(id)[0].type).toBe('Image');
  // the buttons sit over the card, outside the capture: they stay up while it is taken
  const skia = jest.requireMock('@shopify/react-native-skia');
  let up: boolean[] = [];
  skia.makeImageFromView.mockImplementationOnce(async () => {
    up = ['Open camera', 'Save bingo card', 'Share bingo card'].map((l) => screen.queryByLabelText(l) != null && !JSON.stringify(screen.getByLabelText(l).props.style).includes('"opacity":0'));
    return skia.drawAsImage();
  });
  await fireEvent.press(screen.getByLabelText('Share bingo card'));
  await waitFor(() => expect(up).toEqual([true, true, true]));
  await waitFor(() => expect(share).toHaveBeenLastCalledWith([expect.stringMatching(/^file:\/\/\/cache\/bingo card-.*\.png$/)], expect.stringContaining('Bingo! Today’s photo bingo #picdumpbingo'), null));
  await fireEvent.press(screen.getByLabelText('Share side quest'));
  const tag = quest.label.toLowerCase().replace(/[^a-z]/g, '');
  await waitFor(() => expect(share).toHaveBeenLastCalledWith([expect.stringContaining('side quest-')], `Side quest: ${quest.label} ✓ #picdumpquest #${tag}`, null));
  const saved = (MediaLibrary.createAlbumAsync as jest.Mock).mock.calls.length + (MediaLibrary.createAssetAsync as jest.Mock).mock.calls.length;
  await fireEvent.press(screen.getByLabelText('Save bingo card'));
  expect(await screen.findByText('Saved to PicDump ✓')).toBeTruthy();
  expect((MediaLibrary.createAlbumAsync as jest.Mock).mock.calls.length + (MediaLibrary.createAssetAsync as jest.Mock).mock.calls.length).toBe(saved + 1);

  // one swap a day: the empty square gets another prompt, and no square offers a swap after it
  const empty = screen.getAllByLabelText(/, empty\. Tap to swap$/);
  expect(empty).toHaveLength(6);
  const before = empty[0].props.accessibilityLabel;
  await fireEvent.press(empty[0]);
  await waitFor(() => expect(screen.queryAllByLabelText(/Tap to swap$/)).toHaveLength(0));
  // no swap left: the hint line says nothing about it
  await waitFor(() => expect(screen.queryByText(/swap/)).toBeNull(), { timeout: 5000 }); // after the 3 s "Saved" note
  expect(screen.queryByLabelText(before.replace('. Tap to swap', ''))).toBeNull();

  // Album: today's print on the week's line with the quest's sticker; the days before had no card (the app wasn't open)
  await fireEvent.press(screen.getByLabelText('Album'));
  const today = await screen.findByLabelText(`Today: bingo, ${quest.label}`);
  expect(JSON.stringify(within(today).getByTestId('album-sticker-photo').props.source)).toContain(byId(found.id)!.uri);
  expect(screen.getByText(/^1 bingo · quest found$/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Share week'));
  await waitFor(() => expect(share).toHaveBeenLastCalledWith([expect.stringContaining('week-')], 'My week in photo bingo #picdumpbingo', null));
  await fireEvent.press(screen.getByLabelText('Month'));
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  expect(await screen.findByText(`${month}: 1 bingo, 1 side quest`)).toBeTruthy();
  expect(screen.getByLabelText(`${now.getDate()}: bingo, ${quest.label}`)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Bingo'));

  await fireEvent.press(await screen.findByText(/^Make a dump from today · \d+ photos$/));
  await waitFor(() => expect(app.getPathname()).toMatch(/^\/preview\//));
}, 30000);
