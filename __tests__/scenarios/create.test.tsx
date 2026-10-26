import { ToastAndroid } from 'react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { currentCreateDraft, list, update } from '../../src/services/dumps';

const toasts = () => (ToastAndroid.show as jest.Mock).mock.calls.map((c) => c[0]);
const suggestedIds = async () => ((await currentCreateDraft())?.photos ?? []).filter((p) => p.suggested).map((p) => p.id).sort();

beforeAll(() => seedWorld());

test('search, pick 3, Suggest fills, use / swap / save a way, then a selection change asks for Refresh', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  expect(screen.queryByText('Tap to add to basket')).toBeNull();

  // "seattle" is a place in the library: a place filter, no CLIP needed
  await fireEvent.changeText(screen.getByPlaceholderText('Search keyword, place, date...'), 'seattle');
  await screen.findByText('Matches for "seattle" (21)');
  for (const c of screen.getAllByLabelText(/^Photo from Aug \d+, 2025$/).slice(0, 3)) await fireEvent.press(c);
  expect(screen.getByLabelText('3 selected. Review')).toBeTruthy();
  expect(screen.getByText('3/6')).toBeTruthy();
  expect(screen.getAllByLabelText(/number \d in the basket$/)).toHaveLength(3);

  // Suggest fills (in the dock): two ways to finish, each 3 yours + 3 suggested; the button now reads Suggest again
  await fireEvent.press(screen.getByLabelText('Suggest fills'));
  expect(await screen.findAllByLabelText('Use these suggestions')).toHaveLength(2);
  expect(screen.getAllByText(/^3 yours \+ 3 suggested/)).toHaveLength(2);
  expect(screen.getByLabelText('Suggest again')).toBeTruthy();

  // Use this: the 3 ✨ photos join the basket
  await fireEvent.press(screen.getAllByLabelText('Use these suggestions')[0]);
  expect(await screen.findByLabelText('Added. Tap to take these out')).toBeTruthy();
  expect(screen.getByText('6/6')).toBeTruthy();
  expect(screen.getByText('3 + 3')).toBeTruthy(); // footer: yours + ✨
  await settle();
  expect(await suggestedIds()).toHaveLength(3);
  const first = await suggestedIds();

  // Use the other: swaps the ✨ set instead of stacking it
  await fireEvent.press(screen.getByLabelText('Use these suggestions'));
  await settle();
  const second = await suggestedIds();
  expect(second).toHaveLength(3);
  expect(second.filter((id) => first.includes(id))).toEqual([]); // the two ways are disjoint
  expect(screen.getByText('6/6')).toBeTruthy();
  expect(screen.getAllByLabelText('Added. Tap to take these out')).toHaveLength(1);

  // Save as draft (way 1): its own draft, the basket stays as it is
  await fireEvent.press(screen.getAllByLabelText('Save this way as a draft')[0]);
  expect(await screen.findByLabelText('Saved to Drafts')).toBeTruthy();
  expect(toasts()).toContain('Saved to Drafts');
  const saved = (await list()).filter((d) => d.status === 'draft' && d.photos.filter((p) => p.suggested).map((p) => p.id).sort().join() === first.join());
  expect(saved).toHaveLength(1);
  expect(saved[0].photos).toHaveLength(6);

  // Library → Drafts has it (next to the Create basket's own draft)
  await fireEvent.press(screen.getByLabelText('Library'));
  await fireEvent.press(await screen.findByText(/^Drafts/));
  await waitFor(() => expect(screen.getByLabelText('Seattle (2), draft')).toBeTruthy()); // same title → " (2)"
  expect(screen.getByLabelText('Seattle, draft')).toBeTruthy();
  expect(screen.getByText('Drafts (2)')).toBeTruthy();

  // Back in Create: picking one more photo fades the ways under one big Refresh (3C, no auto-refresh)
  await fireEvent.press(screen.getByLabelText('Create'));
  await screen.findByText('Matches for "seattle" (21)');
  await fireEvent.press(screen.getAllByLabelText(/^Photo from Aug \d+, 2025$/)[0]);
  await settle();
  expect(screen.getAllByText(/^3 yours \+ 3 suggested/)).toHaveLength(2);
  await fireEvent.press(await screen.findByLabelText('Refresh for 4 picks'));
  expect(await screen.findAllByText(/^4 yours \+ 3 suggested/)).toHaveLength(2);
  expect(screen.queryByLabelText('Refresh for 4 picks')).toBeNull();
}, 30000);

test('the dock, the way preview (Add N picked / Use this), Undo, and Refresh for N picks', async () => {
  await bootApp('/create');
  await screen.findByText(/^Your gallery/, {}, { timeout: 10000 });
  await fireEvent.press(screen.getByLabelText(/selected\. Review$/));
  await fireEvent.press(await screen.findByText(/^Start a new dump/));
  await settle();
  await fireEvent.changeText(screen.getByPlaceholderText('Search keyword, place, date...'), 'seattle');
  await screen.findByText('Matches for "seattle" (21)');
  for (const c of screen.getAllByLabelText(/^Photo from Aug \d+, 2025$/).slice(0, 2)) await fireEvent.press(c);

  // picked 2 of 6: each way shows 2 yours + 4 suggested; folding the section gives back Suggest fills
  await fireEvent.press(screen.getByLabelText('Suggest fills'));
  expect(await screen.findAllByText(/^2 yours \+ 4 suggested/)).toHaveLength(2);
  await fireEvent.press(screen.getByLabelText('2 ways to finish'));
  expect(screen.queryByLabelText('Use these suggestions')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Suggest fills'));
  expect(await screen.findAllByLabelText('Use these suggestions')).toHaveLength(2);

  // preview: way 1 of 2, arrows switch, 2 yours tagged, 4 pick circles; Add 0 picked does nothing
  const DATE = /^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/;
  const gridDates = screen.getAllByText(DATE).length; // the Create grid already dates its photos
  await fireEvent.press(screen.getByLabelText('Preview way 1'));
  expect(await screen.findByText('Way 1 of 2')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Next way'));
  expect(screen.getByText('Way 2 of 2')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Previous way'));
  expect(screen.getAllByText('Yours')).toHaveLength(2);
  expect(screen.getAllByLabelText('Pick this suggested photo')).toHaveLength(4);
  // every photo carries its taken-on date ("Sep 12", ", 2024" when not this year)
  expect(screen.getAllByText(DATE)).toHaveLength(gridDates + 6);
  expect(screen.getByText('Use this (6)')).toBeTruthy();
  await fireEvent.press(screen.getByText('Add 0 picked'));
  expect(screen.getByText('2/6')).toBeTruthy();

  // circle 2, Add 2 picked: they join as picks, the toast offers Undo, the ways redraw for 4 picks (board 9)
  for (const c of screen.getAllByLabelText('Pick this suggested photo').slice(0, 2)) await fireEvent.press(c);
  await fireEvent.press(screen.getByText('Add 2 picked'));
  expect(screen.getByText('4/6')).toBeTruthy();
  expect(screen.getByText(/^Added 2 photos/)).toBeTruthy();
  // picked from a way = the user's own, in the dock as in the ways
  expect(screen.getByText('(You 4 · App +2)')).toBeTruthy();
  expect(await screen.findAllByText(/^4 yours \+ 2 suggested/)).toHaveLength(2);
  expect(screen.queryByLabelText('Refresh for 4 picks')).toBeNull();
  // Undo puts the basket and the ways back as they were
  await fireEvent.press(screen.getByLabelText('Undo'));
  expect(screen.getByText('2/6')).toBeTruthy();
  expect(screen.getAllByText(/^2 yours \+ 4 suggested/)).toHaveLength(2);
  expect(screen.queryByLabelText('Refresh for 2 picks')).toBeNull();

  // the card's Preview button opens the same sheet; Close shuts it
  await fireEvent.press(screen.getByLabelText('Open preview of way 2'));
  expect(await screen.findByText('Way 2 of 2')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Close preview'));
  await waitFor(() => expect(screen.queryByText('Way 2 of 2')).toBeNull());

  // Use this (6) takes the whole way; Undo would put it back
  await fireEvent.press(screen.getByLabelText('Open preview of way 1'));
  await fireEvent.press(await screen.findByText('Use this (6)'));
  expect(screen.getByText('6/6')).toBeTruthy();
  expect(screen.getByText(/^Added 4 photos/)).toBeTruthy();
  expect(screen.getByLabelText('Added. Tap to take these out')).toBeTruthy();
  await settle(5000);
  expect(screen.queryByText(/^Added 4 photos/)).toBeNull();

  // one more pick: Refresh for 3 picks rebuilds the ways for 3 yours
  const free = screen.getAllByLabelText(/^Photo from Aug \d+, 2025$/).find((c) => !c.props.accessibilityState?.selected)!;
  await fireEvent.press(free);
  await fireEvent.press(await screen.findByLabelText('Refresh for 3 picks'));
  expect(await screen.findAllByText(/^3 yours \+ 4 suggested/)).toHaveLength(2);
}, 30000);

test('an untitled draft is named by its dates; emptying the basket keeps a draft worked on in Edit, drops a bare one', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  await fireEvent.press(screen.getByLabelText(/selected\. Review$/));
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
  await fireEvent.press(screen.getAllByLabelText(/number 1 in the basket$/)[0]);
  await settle();
  expect(await currentCreateDraft()).toBeNull();
  expect((await list()).some((x) => x.id === d.id)).toBe(true);

  // a bare draft (photos only) emptied: gone
  await fireEvent.press(cell());
  await settle();
  const bare = (await currentCreateDraft())!;
  await fireEvent.press(screen.getAllByLabelText(/number 1 in the basket$/)[0]);
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
  if (!screen.queryByLabelText('0 selected. Review')) { // an earlier test's basket: start empty
    await fireEvent.press(screen.getByLabelText(/selected\. Review$/));
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
  await fireEvent.press(screen.getByLabelText('Add to basket'));
  expect(screen.getByText('#1 in basket · Remove')).toBeTruthy();
  expect(screen.getAllByLabelText(/number 1 in the basket$/)).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('Remove from basket'));
  expect(screen.getByLabelText('Add to basket')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Add to basket'));
  await fireEvent.press(screen.getByLabelText('Next photo'));
  await fireEvent.press(screen.getByLabelText('Add to basket'));
  await fireEvent.press(screen.getByLabelText('Close photo'));
  await waitFor(() => expect(screen.queryByText('3 / 77')).toBeNull());
  expect(screen.getByText('2/6')).toBeTruthy();

  // the basket: tapping a photo shows it big; tapping that opens the viewer over the basket, in basket order
  await fireEvent.press(screen.getByLabelText('2 selected. Review'));
  expect(screen.queryByLabelText(/^Enlarge photo/)).toBeNull();
  await fireEvent.press(await screen.findByLabelText('Photo 2'));
  await fireEvent.press(screen.getByLabelText('Enlarge photo 2'));
  expect(await screen.findByText('2 / 2')).toBeTruthy();
  expect(screen.getByText('#2 in basket · Remove')).toBeTruthy();
  expect(screen.queryByLabelText('Next photo')).toBeNull();
}, 30000);

test('unpicking a photo renumbers the later picks in the grid', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  await settle();
  if (!screen.queryByLabelText('0 selected. Review')) { // an earlier test's basket: start empty
    await fireEvent.press(screen.getByLabelText(/selected\. Review$/));
    await fireEvent.press(await screen.findByText(/^Start a new dump/));
    await settle();
  }

  // the grid rows only redraw when their own badges change: the 2nd and 3rd picks must still move up
  const cells = screen.getAllByLabelText(/^Photo from /);
  for (const i of [0, 4, 8]) await fireEvent.press(cells[i]);
  expect(screen.getAllByLabelText(/number \d in the basket$/)).toHaveLength(3);
  await fireEvent.press(screen.getAllByLabelText(/number 1 in the basket$/)[0]);
  expect(screen.getAllByLabelText(/number \d in the basket$/)).toHaveLength(2);
  expect(screen.getAllByLabelText(/number 1 in the basket$/)).toHaveLength(1);
  expect(screen.getAllByLabelText(/number 2 in the basket$/)).toHaveLength(1);
  expect(screen.queryByLabelText(/number 3 in the basket$/)).toBeNull();
  expect(screen.getByText('2/6')).toBeTruthy();
}, 30000);
