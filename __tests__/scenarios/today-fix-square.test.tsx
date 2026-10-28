import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';
import { bootApp } from '../../jest/app';
import { defaultLibrary, photo, seedWorld } from '../../jest/world';

// Street (concept 0) and sunset (9) every day for 10 days put "Somewhere wide" and "The sky" on the card. Today: a sunset (9:00)
// and a street (10:00), each in its square. The user says the street isn't "Somewhere wide", then that it's the sky.
const now = new Date();
const at = (h: number, d = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, h);
const history = Array.from({ length: 10 }, (_, i) => [photo(at(12, i + 1), [0]), photo(at(19, i + 1), [9])]).flat();
const sunset = photo(at(9), [9]), street = photo(at(10), [0]);
beforeAll(() => seedWorld([...defaultLibrary(), ...history, sunset, street]));

const photoIn = (label: string) => JSON.stringify(within(screen.getByLabelText(label)).getByTestId('square-photo').props.source);

test('Today: a filled square takes another of today’s photos or none; the camera button opens the camera', async () => {
  const app = await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(/^Today: /, {}, { timeout: 10000 }));
  await waitFor(() => expect(app.getPathname()).toBe('/today'));
  expect(await screen.findByLabelText('Somewhere wide, done')).toBeTruthy();
  expect(photoIn('The sky, done')).toContain(sunset.uri);

  // take the street out of "Somewhere wide": no other photo is a street, so it's empty
  await fireEvent.press(screen.getByLabelText('Somewhere wide, done'));
  await fireEvent.press(await screen.findByText('Take this photo out'));
  expect(await screen.findByLabelText('Somewhere wide, empty. Tap to swap')).toBeTruthy();

  // put the street in "The sky" instead of the sunset
  await fireEvent.press(screen.getByLabelText('The sky, done'));
  await fireEvent.press(await screen.findByLabelText('Photo 2 of today'));
  await waitFor(() => expect(photoIn('The sky, done')).toContain(street.uri));
  expect(screen.getByLabelText('Somewhere wide, empty. Tap to swap')).toBeTruthy();

  const camera = jest.spyOn(Linking, 'sendIntent').mockResolvedValue();
  await fireEvent.press(screen.getByLabelText('Open camera'));
  expect(camera).toHaveBeenCalledWith('android.media.action.STILL_IMAGE_CAMERA');
}, 30000);
