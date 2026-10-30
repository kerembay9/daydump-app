import { fireEvent, screen } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';
import { bootApp, settle } from '../../jest/app';
import { defaultLibrary, seedWorld } from '../../jest/world';

const alike = (axis: number, cos: number) => { const v = new Array(axis + 2).fill(0); v[axis] = cos; v[axis + 1] = Math.sqrt(1 - cos * cos); return v; };

// Two pairs that look a bit alike, one person the first pass split in two, and one person found twice in the same photos.
beforeAll(() => {
  const photos = defaultLibrary();
  const seattle = photos.filter((p) => p.lat === 47.6);
  const rest = photos.filter((p) => p.lat !== 47.6);
  seattle.slice(0, 5).forEach((p) => (p.faces = [0]));
  rest.slice(0, 3).forEach((p) => (p.faces = [alike(0, 0.45)]));
  rest.slice(3, 5).forEach((p) => (p.faces = [10]));
  rest.slice(5, 7).forEach((p) => (p.faces = [alike(10, 0.45)]));
  rest.slice(7, 9).forEach((p) => (p.faces = [20, 20]));
  // newest is scanned first: two of the person, a face too unlike them to join, one that joins that face, not them
  rest.slice(11, 13).forEach((p) => (p.faces = [30]));
  rest[10].faces = [alike(30, 0.45)];
  rest[9].faces = [alike(30, 0.7)];
  seedWorld(photos);
});

jest.setTimeout(40000);
const seen = { timeout: 10000 };
const row = () => screen.getAllByLabelText(/: any$/); // sheet closed
const inSheet = () => screen.getAllByLabelText(/^Edit /);

test('Create: the sheet asks "Same person?"; holding a face merges; a face can be taken out; all of it can be undone', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, seen);
  // the split person is one by itself; the one found twice in a photo stays two, and is never asked about
  await screen.findAllByLabelText(/: any$/, {}, seen);
  expect(row()).toHaveLength(7);

  await fireEvent.press(screen.getByLabelText('All people'));
  expect(await screen.findByText('Same person?', {}, seen)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Same person'));
  expect(await screen.findByText('Merged into one person.', {}, seen)).toBeTruthy();
  expect(inSheet()).toHaveLength(6);

  // Undo puts them back and doesn't ask about them again: the other pair is asked next
  await fireEvent.press(screen.getByLabelText('Undo'));
  await settle();
  expect(inSheet()).toHaveLength(7);
  expect(screen.getByText('Same person?')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Not the same'));
  await settle();
  expect(screen.queryByText('Same person?')).toBeNull();

  // a face that isn't them
  const faces = screen.getAllByLabelText('Edit Unnamed person');
  await fireEvent.press(faces[0]);
  await fireEvent.press(await screen.findByLabelText('Face 1 of Unnamed person', {}, seen));
  await fireEvent.press(await screen.findByLabelText('Not this person', {}, seen));
  await settle();
  expect(screen.queryByText('5 photos')).toBeNull(); // the only one with 5 has 4 now

  // hold a face in the row: the picker, likeliest first
  await fireEvent.press(screen.getByLabelText('Merge with…'));
  expect(await screen.findByText('Same person as…', {}, seen)).toBeTruthy();
  await fireEvent.press(screen.getAllByLabelText(/^Merge with Unnamed person/)[0]);
  expect(await screen.findByText('Merged into one person.', {}, seen)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Done'));
  await settle();
  expect(inSheet()).toHaveLength(6);

  // and Separate, for a merge done earlier
  await fireEvent.press(screen.getAllByLabelText('Edit Unnamed person')[0]);
  await fireEvent.press(await screen.findByLabelText('Separate', {}, seen));
  await settle();
  expect(inSheet()).toHaveLength(7);
});

test('holding a face merges, on Create and on Discover', async () => {
  await bootApp('/create');
  await screen.findByText(/^Your gallery/, {}, seen);
  const before = (await screen.findAllByLabelText(/: any$/, {}, seen)).length;
  await fireEvent(row()[0], 'longPress');
  expect(await screen.findByText('Same person as…', {}, seen)).toBeTruthy();
  await fireEvent.press(screen.getAllByLabelText(/^Merge with Unnamed person/)[0]);
  await fireEvent.press(await screen.findByLabelText('Done', {}, seen));
  await settle();
  expect(row()).toHaveLength(before - 1);

  await bootApp('/');
  const badges = await screen.findAllByLabelText(/^Photos with /, {}, { timeout: 15000 });
  await fireEvent(badges[0], 'longPress');
  expect(await screen.findByText('Same person as…', {}, seen)).toBeTruthy();
});

test('naming someone: a tick takes the place of Edit until the name is done', async () => {
  await bootApp('/create');
  await screen.findAllByLabelText(/: any$/, {}, seen);
  await fireEvent.press(screen.getByLabelText('All people'));
  const name = (await screen.findAllByPlaceholderText('Add a name', {}, seen))[0];
  const edits = screen.getAllByLabelText(/^Edit /).length;

  await fireEvent(name, 'focus');
  expect(await screen.findByLabelText('Done naming', {}, seen)).toBeTruthy();
  expect(screen.getAllByLabelText(/^Edit /)).toHaveLength(edits - 1);

  await fireEvent(name, 'endEditing', { nativeEvent: { text: 'Ada' } }); // what the tick's Keyboard.dismiss does on the phone
  await settle();
  expect(screen.queryByLabelText('Done naming')).toBeNull();
  expect(screen.getByDisplayValue('Ada')).toBeTruthy();
});

test("the sheet's list reaches past its padding, so a swipe from the edge or bottom of the sheet scrolls it", async () => {
  await bootApp('/create');
  await screen.findAllByLabelText(/: any$/, {}, seen);
  await fireEvent.press(screen.getByLabelText('All people'));
  let node: any = (await screen.findAllByLabelText(/^Edit /, {}, seen))[0];
  while (node && !StyleSheet.flatten(node.props.style)?.marginHorizontal) node = node.parent;
  expect(StyleSheet.flatten(node.props.style)).toMatchObject({ marginHorizontal: -16, marginBottom: -16 });
});

test('nothing tappable wraps the sheet: it would take a slow swipe from the list, from any spot that is not a button', async () => {
  await bootApp('/create');
  await screen.findAllByLabelText(/: any$/, {}, seen);
  await fireEvent.press(screen.getByLabelText('All people'));
  let node: any = (await screen.findAllByText(/^\d+ photos$/, {}, seen))[0].parent;
  for (; node; node = node.parent) expect(node.props.onClick).toBeUndefined();
  await fireEvent.press(screen.getByLabelText('Close'));
  await settle();
  expect(screen.queryByText('People')).toBeNull();
});
