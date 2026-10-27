import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { currentCreateDraft, list, update } from '../../src/services/dumps';

const suggestedIds = async () => ((await currentCreateDraft())?.photos ?? []).filter((p) => p.suggested).map((p) => p.id).sort();

beforeAll(() => seedWorld());

test('search, pick 3: the Similar strip leads with "N sets"; its sheet stacks them, ticks per set, Add N adds only those', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  expect(screen.queryByText('Similar to your picks')).toBeNull();

  // "seattle" is a place in the library: a place filter, no CLIP needed
  await fireEvent.changeText(screen.getByPlaceholderText('Search keyword, place, date...'), 'seattle');
  await screen.findByText('Matches for "seattle" (21)');
  for (const c of screen.getAllByLabelText(/^Photo from Aug \d+, 2025$/).slice(0, 3)) await fireEvent.press(c);
  await settle();
  expect(screen.getByLabelText('Picks: 3. Review')).toBeTruthy();

  // no Total stepper, no Suggest fills: the strip is the Similar photos, led by the sets tile
  expect(await screen.findByText('Similar to your picks')).toBeTruthy();
  expect(screen.queryByLabelText('More photos')).toBeNull();
  expect(screen.queryByLabelText('Suggest fills')).toBeNull();
  await fireEvent.press(screen.getByLabelText(/^\d sets? of similar photos$/));
  expect(await screen.findByText('Sets for your 3 picks')).toBeTruthy();
  const adds = screen.getAllByLabelText(/^Add 0 from /);
  expect(adds.length).toBeGreaterThan(0);

  // tick 2 photos of the first set: only its button counts them; Add puts them in as ✧ picks, the sheet stays open
  const boxes = screen.getAllByLabelText('Tick this photo');
  await fireEvent.press(boxes[0]);
  await fireEvent.press(boxes[1]);
  const add2 = screen.getByLabelText(/^Add 2 from /);
  expect(screen.queryAllByLabelText(/^Add 0 from /)).toHaveLength(adds.length - 1);
  await fireEvent.press(add2);
  await settle();
  expect(screen.getByLabelText('Continue with 5 photos')).toBeTruthy();
  expect(await suggestedIds()).toHaveLength(2);
  expect(screen.getAllByLabelText('In your picks')).toHaveLength(2);
  expect(screen.getByText('Sets for your 5 picks')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Close sets'));
  expect(screen.queryByText('Sets for your 5 picks')).toBeNull();
}, 30000);

test('an untitled draft is named by its dates; emptying the basket keeps a draft worked on in Edit, drops a bare one', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  await fireEvent.press(screen.getByLabelText(/^Picks: \d+\. Review$/));
  await fireEvent.press(await screen.findByText(/^Start a new dump/));
  await settle();

  // no search: the draft is titled by its photo's date, not "New dump"
  const cell = () => screen.getAllByLabelText(/^Photo from /)[0];
  const day = cell().props.accessibilityLabel.replace('Photo from ', '');
  await fireEvent.press(cell());
  await settle();
  const d = (await currentCreateDraft())!;
  expect(d.title).toBe(day); // same dateRange() as the grid's label

  // worked on in Edit (a layout picked), then emptied in Create: it stays in Drafts, unlinked from Create
  await update(d.id, { layout: 'grid' });
  await fireEvent.press(screen.getAllByLabelText(/number 1 in your picks$/)[0]);
  await settle();
  expect(await currentCreateDraft()).toBeNull();
  expect((await list()).some((x) => x.id === d.id)).toBe(true);

  // a bare draft (photos only) emptied: gone
  await fireEvent.press(cell());
  await settle();
  const bare = (await currentCreateDraft())!;
  await fireEvent.press(screen.getAllByLabelText(/number 1 in your picks$/)[0]);
  await settle();
  expect((await list()).some((x) => x.id === bare.id)).toBe(false);
}, 30000);

test('search shows a spinner until results land; a half-typed search left by tapping away is replaced in Last searches', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  const input = screen.getByPlaceholderText('Search keyword, place, date...');

  // "s", then tap away (blur saves it), then the full "seattle"
  await fireEvent(input, 'focus');
  await fireEvent.changeText(input, 's');
  expect(screen.getByLabelText('Searching')).toBeTruthy();
  await fireEvent(input, 'blur');
  await fireEvent(input, 'focus');
  await fireEvent.changeText(input, 'seattle');
  await screen.findByText('Matches for "seattle" (21)');
  expect(screen.queryByLabelText('Searching')).toBeNull();
  await fireEvent(input, 'submitEditing');

  expect(screen.getByLabelText('Search seattle')).toBeTruthy();
  expect(screen.queryByLabelText('Search s')).toBeNull();
});

test('hold a photo to enlarge it: swipe with the arrows, add / remove from the viewer; the basket shows the tapped one big', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  await settle();
  if (!screen.queryByLabelText('Picks: 0. Review')) { // an earlier test's basket: start empty
    await fireEvent.press(screen.getByLabelText(/^Picks: \d+\. Review$/));
    await fireEvent.press(await screen.findByText(/^Start a new dump/));
    await settle();
  }
  expect(screen.getByText('Hold to enlarge')).toBeTruthy();

  // hold the 2nd grid photo: the viewer opens on it, 2 / 77, both arrows
  const cells = screen.getAllByLabelText(/^Photo from /);
  await fireEvent(cells[1], 'longPress');
  expect(await screen.findByText('2 / 77')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Previous photo'));
  expect(screen.getByText('1 / 77')).toBeTruthy();
  expect(screen.queryByLabelText('Previous photo')).toBeNull(); // nothing before the first
  await fireEvent.press(screen.getByLabelText('Next photo'));
  expect(screen.getByText('2 / 77')).toBeTruthy();

  // add it from the viewer: the grid shows it picked; Remove takes it out again
  await fireEvent.press(screen.getByLabelText('Add to picks'));
  expect(screen.getByText('Pick #1 · Remove')).toBeTruthy();
  expect(screen.getAllByLabelText(/number 1 in your picks$/)).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('Remove from picks'));
  expect(screen.getByLabelText('Add to picks')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Add to picks'));
  await fireEvent.press(screen.getByLabelText('Next photo'));
  await fireEvent.press(screen.getByLabelText('Add to picks'));
  await fireEvent.press(screen.getByLabelText('Close photo'));
  await waitFor(() => expect(screen.queryByText('3 / 77')).toBeNull());
  expect(screen.getByLabelText('Picks: 2. Review')).toBeTruthy();

  // the basket: tapping a photo shows it big; tapping that opens the viewer over the basket, in basket order
  await fireEvent.press(screen.getByLabelText('Picks: 2. Review'));
  expect(screen.queryByLabelText(/^Enlarge photo/)).toBeNull();
  await fireEvent.press(await screen.findByLabelText('Photo 2'));
  await fireEvent.press(screen.getByLabelText('Enlarge photo 2'));
  expect(await screen.findByText('2 / 2')).toBeTruthy();
  expect(screen.getByText('Pick #2 · Remove')).toBeTruthy();
  expect(screen.queryByLabelText('Next photo')).toBeNull();
}, 30000);

test('unpicking a photo renumbers the later picks in the grid', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  await settle();
  if (!screen.queryByLabelText('Picks: 0. Review')) { // an earlier test's basket: start empty
    await fireEvent.press(screen.getByLabelText(/^Picks: \d+\. Review$/));
    await fireEvent.press(await screen.findByText(/^Start a new dump/));
    await settle();
  }

  // the grid rows only redraw when their own badges change: the 2nd and 3rd picks must still move up
  const cells = screen.getAllByLabelText(/^Photo from /);
  for (const i of [0, 4, 8]) await fireEvent.press(cells[i]);
  expect(screen.getAllByLabelText(/number \d in your picks$/)).toHaveLength(3);
  await fireEvent.press(screen.getAllByLabelText(/number 1 in your picks$/)[0]);
  expect(screen.getAllByLabelText(/number \d in your picks$/)).toHaveLength(2);
  expect(screen.getAllByLabelText(/number 1 in your picks$/)).toHaveLength(1);
  expect(screen.getAllByLabelText(/number 2 in your picks$/)).toHaveLength(1);
  expect(screen.queryByLabelText(/number 3 in your picks$/)).toBeNull();
  expect(screen.getByLabelText('Picks: 2. Review')).toBeTruthy();
}, 30000);
