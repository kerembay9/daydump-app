import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { burst, defaultLibrary, photo, seedWorld } from '../../jest/world';

// Today's camera roll: a burst of one brunch shot (11:00; the listing drops the take 2 s after the first, 2 stay), a street (15:00),
// a sunset (18:00) and one late photo (23:00).
const now = new Date();
const at = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h);
beforeAll(() => seedWorld([...defaultLibrary(), ...burst(at(11), 3, [7]), photo(at(15), [0]), photo(at(18), [9]), photo(at(23), [])]));

test('Discover: the Today card replaces the hero; it shows what today covers and what is missing, and its sheet opens today’s dump', async () => {
  const app = await bootApp('/');
  // sky (sunset), wide (street) and night (23:00) of the 8 slots; the other brunch takes are the same shot
  const card = await screen.findByLabelText('Today, 38%. Missing you, friends and 3 more', {}, { timeout: 10000 });
  // no big hero: the top story is an ordinary tile, and today's own dump isn't one
  expect(screen.queryByLabelText('Preview A week in Seattle')).toBeNull();
  expect(screen.getByLabelText('A week in Seattle, 9 photos · Aug 4–10, 2025')).toBeTruthy();
  expect(screen.queryByLabelText(/^Today, \d+ photos/)).toBeNull();

  await fireEvent.press(card);
  expect(await screen.findByText('Today · 38%')).toBeTruthy();
  expect(screen.getByText('5 photos · 1 same shot')).toBeTruthy();
  for (const s of ['Sky: 1', 'Wide shot: 1', 'Night: 1', 'Food: missing', 'You: missing', 'Mirror: missing']) expect(screen.getByLabelText(s)).toBeTruthy();
  await fireEvent.press(screen.getByText('Make a dump from what I have'));
  await waitFor(() => expect(app.getPathname()).toMatch(/^\/preview\//));
}, 30000);
