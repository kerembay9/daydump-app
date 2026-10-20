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

  // "seattle" is a place in the library: a place filter, no CLIP needed
  await fireEvent.changeText(screen.getByPlaceholderText('Search keyword, place, date...'), 'seattle');
  await screen.findByText('Matches for "seattle" (21)');
  for (const c of screen.getAllByLabelText(/^Photo from Aug \d+, 2025$/).slice(0, 3)) await fireEvent.press(c);
  expect(screen.getByLabelText('3 selected. Review')).toBeTruthy();
  expect(screen.getByText('3/6')).toBeTruthy();
  expect(screen.getAllByLabelText(/number \d in the basket$/)).toHaveLength(3);

  // Suggest fills: two ways to finish, each 3 yours + 3 suggested
  await fireEvent.press(screen.getByLabelText('Suggest fills'));
  expect(await screen.findAllByLabelText('Use these suggestions')).toHaveLength(2);
  expect(screen.getAllByText('3 yours + 3 suggested')).toHaveLength(2);

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

  // Back in Create: picking one more photo makes the suggestions stale
  await fireEvent.press(screen.getByLabelText('Create'));
  await screen.findByText('Matches for "seattle" (21)');
  await fireEvent.press(screen.getAllByLabelText(/^Photo from Aug \d+, 2025$/)[0]);
  const refresh = await screen.findByLabelText('Selection changed. Refresh suggestions');
  await fireEvent.press(screen.getAllByLabelText('Save this way as a draft')[0]);
  expect(toasts()).toContain('Selection changed. Tap Refresh first');
  await fireEvent.press(refresh);
  expect(await screen.findAllByText('4 yours + 3 suggested')).toHaveLength(2);
  expect(screen.queryByLabelText('Selection changed. Refresh suggestions')).toBeNull();
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
