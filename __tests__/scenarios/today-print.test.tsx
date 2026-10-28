import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { defaultLibrary, photo, seedWorld } from '../../jest/world';

// Street (concept 0) and sunset (9) every day for 10 days put "Somewhere wide" and "The sky" either side of the free middle.
// Today: a street (15:00) and a sunset (18:00): a bingo, and a print.
const now = new Date();
const at = (h: number, d = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, h);
const history = Array.from({ length: 10 }, (_, i) => [photo(at(12, i + 1), [0]), photo(at(19, i + 1), [9])]).flat();
const street = photo(at(15), [0]), sunset = photo(at(18), [9]);
beforeAll(() => seedWorld([...defaultLibrary(), ...history, street, sunset]));

const print = () => JSON.stringify(within(screen.getByLabelText('Today: bingo')).getByTestId('album-print').props.source);

test('Album: tap a polaroid to pick its photo; taking the photos out of the bingo takes the print away', async () => {
  const app = await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(/^Bingo: /, {}, { timeout: 10000 }));
  await waitFor(() => expect(app.getPathname()).toBe('/today'));
  expect(await screen.findByLabelText('The sky, done')).toBeTruthy();

  await fireEvent.press(screen.getByText('Album'));
  await screen.findByLabelText('Today: bingo');
  // the print is today's street, then today's sunset, whichever the user taps
  await fireEvent.press(screen.getByLabelText('Today: bingo'));
  await fireEvent.press(await screen.findByLabelText('Photo 1 of the day'));
  await waitFor(() => expect(print()).toContain(street.uri));
  await fireEvent.press(screen.getByLabelText('Today: bingo'));
  await fireEvent.press(await screen.findByLabelText('Photo 2 of the day'));
  await waitFor(() => expect(print()).toContain(sunset.uri));

  // the sunset out of "The sky": the row breaks, so the day has no print
  await fireEvent.press(screen.getAllByText('Bingo')[0]);
  await fireEvent.press(await screen.findByLabelText('The sky, done'));
  await fireEvent.press(await screen.findByText('Take this photo out'));
  await screen.findByLabelText(/^The sky, empty/);
  await fireEvent.press(screen.getByText('Album'));
  expect(await screen.findByLabelText('Today: not yet')).toBeTruthy();

  // hold a filled square or a polaroid: its photo full screen
  await fireEvent.press(screen.getByText('Week'));
  await fireEvent.press(screen.getAllByText('Bingo')[0]);
  fireEvent(await screen.findByLabelText('Somewhere wide, done'), 'longPress');
  expect(await screen.findByLabelText('Close photo')).toBeTruthy();
  expect(screen.getByLabelText('Photo 1 of 1')).toBeTruthy();
}, 30000);
