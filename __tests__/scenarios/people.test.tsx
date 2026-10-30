import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { defaultLibrary, seedWorld } from '../../jest/world';

// Person 0 is in 4 Seattle photos, person 1 in 3 of those plus 2 others; someone in one photo isn't offered, nor a toy in two.
beforeAll(() => {
  const photos = defaultLibrary();
  const seattle = photos.filter((p) => p.lat === 47.6);
  seattle.slice(0, 4).forEach((p) => (p.faces = [0]));
  seattle.slice(1, 4).forEach((p) => (p.faces = [0, 1]));
  seattle.slice(4, 6).forEach((p) => (p.faces = [1]));
  seattle[6].faces = [2];
  seattle.slice(7, 9).forEach((p) => (p.faces = [100]));
  seedWorld(photos);
});

jest.setTimeout(40000); // a loaded machine: booting the app and the scan take seconds
const seen = { timeout: 10000 };

test('the sheet says how it works; a face sets the search, and Edit opens their faces', async () => {
  const hint = 'Tap a face to include them in your search. Tap again to exclude them.';
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, seen);
  await fireEvent.press(await screen.findByLabelText('All people', {}, seen));
  expect(await screen.findByText(hint, {}, seen)).toBeTruthy();
  const tap = async (state: string) => fireEvent.press((await screen.findAllByLabelText(`Search for Unnamed person: ${state}`, {}, seen))[0]);

  await tap('off');
  expect(await screen.findByText('Your gallery with 1 person (5)', {}, seen)).toBeTruthy();
  expect(screen.getByText('Photos with 1 person · 5')).toBeTruthy();
  expect(screen.getByText('Included in search')).toBeTruthy();
  expect(screen.queryByText(hint)).toBeNull();
  expect(screen.queryByLabelText('Face 1 of Unnamed person')).toBeNull(); // the face no longer opens them

  await tap('included');
  expect(await screen.findByText('Photos without 1 person · 72', {}, seen)).toBeTruthy();
  expect(screen.getByText('Excluded from search')).toBeTruthy();

  await tap('excluded');
  expect(await screen.findByText(hint, {}, seen)).toBeTruthy();
  expect(await screen.findByText('Your gallery (77)', {}, seen)).toBeTruthy();

  await fireEvent.press(screen.getAllByLabelText('Edit Unnamed person')[0]);
  expect(await screen.findByLabelText('Face 1 of Unnamed person', {}, seen)).toBeTruthy();
});

test('Create: tapping a face goes with, without, off; the sheet names people and sets Either', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, seen);
  const faces = await screen.findAllByLabelText(/^Unnamed person: any$/, {}, seen);
  expect(faces).toHaveLength(2); // the one-photo stranger and the toy aren't offered

  await fireEvent.press(faces[0]);
  expect(await screen.findByText('Your gallery with 1 person (5)', {}, seen)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Unnamed person: with'));
  expect(await screen.findByText('Your gallery without 1 person (72)', {}, seen)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Unnamed person: without'));
  expect(await screen.findByText('Your gallery (77)', {}, seen)).toBeTruthy();

  // both with: together, then either, from the sheet
  for (const f of screen.getAllByLabelText('Unnamed person: any')) await fireEvent.press(f);
  expect(await screen.findByText('Your gallery with 2 people (3)', {}, seen)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('All people'));
  await fireEvent.press(await screen.findByLabelText('Either', {}, seen));
  await settle();

  const names = screen.getAllByPlaceholderText('Add a name');
  await fireEvent(names[0], 'endEditing', { nativeEvent: { text: 'Ada' } });
  await fireEvent(names[1], 'endEditing', { nativeEvent: { text: 'Ben' } });
  expect(await screen.findByText(/^Your gallery with (Ada or Ben|Ben or Ada) \(6\)$/, {}, seen)).toBeTruthy();
});

test('Discover: a dump shows who is in it; tapping a face opens Create with their photos', async () => {
  await bootApp('/');
  const faces = await screen.findAllByLabelText(/^Photos with /, {}, { timeout: 15000 });
  await fireEvent.press(faces[0]);
  expect(await screen.findByText(/^Your gallery with .+ \(\d+\)$/, {}, seen)).toBeTruthy();
});
