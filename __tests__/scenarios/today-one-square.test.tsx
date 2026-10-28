import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { defaultLibrary, photo, seedWorld } from '../../jest/world';

// Street (concept 0) and sunset (9) every day for 10 days put "Somewhere wide" and "The sky" on the card. Today: one photo that
// is both, scoring the same for each square (like a hand on a book): it fills one square, not two.
const now = new Date();
const at = (h: number, d = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, h);
const history = Array.from({ length: 10 }, (_, i) => [photo(at(12, i + 1), [0]), photo(at(19, i + 1), [9])]).flat();
beforeAll(() => seedWorld([...defaultLibrary(), ...history, photo(at(9), [0, 9])]));

test('Today hub: one photo fills one square; the week’s quest is open, no dump footer', async () => {
  const app = await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(/^Bingo: /, {}, { timeout: 10000 }));
  await waitFor(() => expect(app.getPathname()).toBe('/today'));
  await screen.findByText('This week’s side quest');
  expect(screen.queryAllByLabelText(/^(The sky|Somewhere wide), done$/)).toHaveLength(1);
  expect(screen.getByText(/^Tap an empty square to swap it, once a day$/)).toBeTruthy();
  expect(screen.getByText('Find it any day this week.')).toBeTruthy();
  expect(screen.getByText(/^(\d days left|Last day)$/)).toBeTruthy();
  expect(screen.queryByText(/today becomes a dump/)).toBeNull();
}, 30000);
