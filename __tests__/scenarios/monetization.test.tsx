import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { bootApp, settle } from '../../jest/app';
import { defaultLibrary, photo, seedWorld, world } from '../../jest/world';
import { recapPeriods } from '../../src/services/stories';
import { createDraft, list, remove, update } from '../../src/services/dumps';
import { getProfile } from '../../src/services/profile';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';
const META = '6 photos · Sep 22–Oct 22, 2025';
const KNOWN = '@picdump_pro_known';
const rc = jest.requireMock('react-native-purchases').default as { getCustomerInfo: jest.Mock };
const realCustomerInfo = rc.getCustomerInfo.getMockImplementation()!;
const draw = jest.requireMock('@shopify/react-native-skia').drawAsImage as jest.Mock;

/** RevenueCat holds its answer until answer() (a slow network on a cold start). */
function slowRevenueCat() {
  let answer!: () => void;
  const gate = new Promise<void>((go) => { answer = go; });
  rc.getCustomerInfo.mockImplementation(async () => { await gate; return realCustomerInfo(); });
  return () => answer();
}
const cachePro = () => AsyncStorage.setItem(KNOWN, JSON.stringify({ sub: { plan: 'Yearly', until: Date.now() + 365 * 86400000, renews: true } }));
const lockedOnScreen = () => screen.queryByLabelText(/, locked$/);
/** Discover's Seattle tile (the hero is gone in 0.0.6: every dump is a bento tile) */
const SEATTLE_LOCKED = /^A week in Seattle, .*, locked$/;
const SEATTLE_OPEN = /^A week in Seattle, .*\d{4}$/;

beforeEach(async () => {
  seedWorld();
  world.pro = false;
  await AsyncStorage.removeItem('@picdump_unlocks');
  await AsyncStorage.removeItem(KNOWN);
  rc.getCustomerInfo.mockImplementation(realCustomerInfo);
  // the first-full-Discover paywall has its own test
  await AsyncStorage.setItem('@picdump_first_paywall_shown', '1');
  for (const d of await list()) await remove(d.id);
});
afterAll(() => { world.pro = true; });

test('free: dumps are locked; the free unlock opens one, the next asks for Pro', async () => {
  await bootApp('/');
  const tile = await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 });
  expect(screen.getByLabelText(SEATTLE_LOCKED)).toBeTruthy();

  await fireEvent.press(tile);
  await fireEvent.press(await screen.findByText('Use free unlock'));
  // the unlocked dump opens in Preview
  expect(await screen.findByLabelText('Post')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Back'));

  // it stays open; the next locked one says when the next free unlock is, and offers Pro
  expect(await screen.findByLabelText(`${LONG}, ${META}`)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(SEATTLE_LOCKED));
  expect(await screen.findByText(/Your next free dump is in 7 days\.$/)).toBeTruthy();
  expect(screen.queryByText('Use free unlock')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Unlock all with Pro'));
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
}, 30000);

test('Pro: nothing is locked', async () => {
  world.pro = true;
  await bootApp('/');
  expect(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByLabelText(SEATTLE_OPEN)).toBeTruthy();
  expect(lockedOnScreen()).toBeNull();
}, 30000);

test('the first time Discover is full of locked dumps, the paywall names them, once', async () => {
  await AsyncStorage.removeItem('@picdump_first_paywall_shown');
  await bootApp('/');
  expect(await screen.findByText('We found 3 dumps in your roll.', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText(/^A week in Seattle, .*\. Pro opens all of them\.$/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Close paywall'));
  screen.unmount();

  await bootApp('/');
  await screen.findByLabelText(SEATTLE_LOCKED, {}, { timeout: 10000 });
  expect(screen.queryByText(/We found \d+ dumps/)).toBeNull();
}, 30000);

test('free: tapping search opens the paywall instead of the field', async () => {
  await bootApp('/create');
  const field = await screen.findByPlaceholderText('Search keyword, place, date...', {}, { timeout: 10000 });
  // the field can't take focus (no keyboard flash): a tap over it asks for Pro
  expect(field.props.editable).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('Search your camera roll.')).toBeTruthy();
  expect(screen.queryByText('Last searches')).toBeNull();
  expect(screen.queryByText('Try')).toBeNull();
}, 30000);

/** RevenueCat's customer-info listener (renewals, lapses, purchases elsewhere), as the SDK would call it. */
async function customerInfoChanged() {
  const listener = (rc as unknown as { addCustomerInfoUpdateListener: jest.Mock }).addCustomerInfoUpdateListener.mock.lastCall![0];
  await act(async () => { listener(await realCustomerInfo()); });
  await settle();
}

test('a subscriber who taps search before RevenueCat answers sees the paywall close when it does', async () => {
  world.pro = true;
  const answer = slowRevenueCat();
  await bootApp('/create');
  const field = await screen.findByPlaceholderText('Search keyword, place, date...', {}, { timeout: 10000 });
  // nothing cached: assumed free until RevenueCat answers
  await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('Search your camera roll.')).toBeTruthy();

  answer();
  await waitFor(() => expect(screen.queryByText('Search your camera roll.')).toBeNull());
  expect(field.props.editable).toBe(true);
  expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
}, 30000);

test('Pro lapsing on Create drops the search and its results', async () => {
  world.pro = true;
  await bootApp('/create');
  const field = await screen.findByPlaceholderText('Search keyword, place, date...', {}, { timeout: 10000 });
  await fireEvent.changeText(field, 'seattle');
  expect(await screen.findByText(/^Matches for "seattle"/)).toBeTruthy();

  world.pro = false;
  await customerInfoChanged();
  expect(screen.getByPlaceholderText('Search keyword, place, date...').props.value).toBe('');
  expect(screen.queryByText(/^Matches for/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('Search your camera roll.')).toBeTruthy();
}, 30000);

test('free: changing photos per dump opens the paywall and keeps the range', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  await fireEvent.press(screen.getByLabelText('Raise most photos'));
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
  expect((await getProfile()).slidesMax).toBe(10);
}, 30000);

test('free exports end with the PicDump slide; Pro exports do not', async () => {
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 }));
  draw.mockClear();
  await fireEvent.press(await screen.findByText('Use free unlock'));
  // 6 photo slides + the end slide, rendered ahead in the background
  await waitFor(() => expect(draw).toHaveBeenCalledTimes(7));
  // the counts say 7 too: no "6 slides" then "7 slides saved"
  await fireEvent.press(screen.getByLabelText('Post'));
  expect(await screen.findByText('A carousel of 7 slides')).toBeTruthy();
  screen.unmount();

  // the same dump for a Pro user: the 6 photo slides only
  world.pro = true;
  await bootApp('/');
  draw.mockClear();
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 }));
  await waitFor(() => expect(draw).toHaveBeenCalledTimes(6));
  await settle(3000);
  expect(draw).toHaveBeenCalledTimes(6);
  await fireEvent.press(screen.getByLabelText('Post'));
  expect(await screen.findByText('A carousel of 6 slides')).toBeTruthy();
}, 30000);

test('free: saving a dump with a Pro film look asks first; "Export without finish" saves it anyway', async () => {
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByText('Use free unlock'));
  await screen.findByLabelText('Post');
  await fireEvent.press(screen.getByLabelText('Back'));
  // the unlock made its Library draft; give it a Pro look, then open it again
  const [draft] = await list('draft');
  await update(draft.id, { filter: { key: 'cashmere', pct: 68, per: {}, adj: {} } });
  const photoSlides = (calls = draw.mock.calls) => calls.map(([el]) => el.props.photos as { dev: { matrix: number[] | null } | null }[] | undefined).filter((ps) => ps != null);
  draw.mockClear();
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`));

  // the background export draws the Pro look (it is what Preview shows)
  await waitFor(() => expect(photoSlides()).toHaveLength(6));
  expect(photoSlides().flat().every((p) => p.dev?.matrix != null)).toBe(true);
  await settle();

  draw.mockClear();
  await fireEvent.press(await screen.findByLabelText('Save to phone'));
  expect(await screen.findByText('This film look is Pro')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Export without finish'));
  expect(await screen.findByText('Saved to your phone')).toBeTruthy();
  // the saved slides (the first export after the tap): Original instead of the Pro look, then the end slide.
  // Preview then renders its own look again in the background, for the next Post.
  const saved = draw.mock.calls.slice(0, 7);
  expect(photoSlides(saved)).toHaveLength(6);
  expect(photoSlides(saved).flat().every((p) => p.dev?.matrix == null)).toBe(true);
  expect(saved[6][0].props.photos).toBeUndefined();
}, 30000);

/** Unlocks the puppy dump (free), backs out of its Preview and returns its Library draft. */
async function unlockedPuppyDraft() {
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByText('Use free unlock'));
  await screen.findByLabelText('Post');
  await fireEvent.press(screen.getByLabelText('Back'));
  const [draft] = await list('draft');
  return draft;
}
type Drawn = { dev: { matrix: number[] | null; grain: number; vignette: number } | null };
const drawnPhotos = (calls = draw.mock.calls) => calls.map(([el]) => el.props.photos as Drawn[] | undefined).filter((ps) => ps != null).flat();

test('free: Edit previews Pro looks and texture with a Pro badge; Adjust and the free looks have none', async () => {
  const draft = await unlockedPuppyDraft();
  screen.unmount();
  await bootApp(`/edit/${draft.id}`);
  await fireEvent.press(await screen.findByRole('tab', { name: 'Photos' }, { timeout: 10000 }));
  for (const name of ['Cashmere', 'Soft Film', 'Sunfade', 'B&W Roll']) expect(screen.getByLabelText(`${name}, Pro`)).toBeTruthy();
  expect(screen.getByLabelText('Original')).toBeTruthy();
  expect(screen.getByLabelText('Warm 35mm')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Adjust' })).toBeTruthy();
  // picking a Pro look previews it (no paywall in Edit)
  await fireEvent.press(screen.getByLabelText('Cashmere, Pro'));
  expect(screen.queryByText('Every dump in your roll.')).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Texture, Pro' }));
  expect(screen.getByLabelText('Grain')).toBeTruthy();
  screen.unmount();

  world.pro = true;
  await bootApp(`/edit/${draft.id}`);
  await fireEvent.press(await screen.findByRole('tab', { name: 'Photos' }, { timeout: 10000 }));
  expect(screen.getByLabelText('Cashmere')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Texture' })).toBeTruthy();
}, 30000);

test('free: texture on a free look still asks; "Export without finish" drops it and keeps Adjust', async () => {
  const draft = await unlockedPuppyDraft();
  const first = draft.photos[0].id;
  await update(draft.id, { filter: { key: 'warm35', pct: 68, grain: 40, vignette: 25, per: {}, adj: { [first]: { light: 30 } } } });
  draw.mockClear();
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`));
  await waitFor(() => expect(drawnPhotos()).toHaveLength(6));
  expect(drawnPhotos().every((p) => p.dev && p.dev.grain > 0)).toBe(true);
  await settle();

  draw.mockClear();
  await fireEvent.press(screen.getByLabelText('Save to phone'));
  expect(await screen.findByText('This film look is Pro')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Export without finish'));
  expect(await screen.findByText('Saved to your phone')).toBeTruthy();
  const saved = drawnPhotos(draw.mock.calls.slice(0, 7));
  expect(saved).toHaveLength(6);
  expect(saved.every((p) => p.dev!.grain === 0 && p.dev!.vignette === 0)).toBe(true);
  // Warm 35mm (free) stays on every photo, so each still has a colour matrix
  expect(saved.every((p) => p.dev!.matrix != null)).toBe(true);
}, 30000);

test('free: Adjust alone exports without asking', async () => {
  const draft = await unlockedPuppyDraft();
  await update(draft.id, { filter: { key: 'none', pct: 68, per: {}, adj: { [draft.photos[0].id]: { light: 30, sharpen: 20 } } } });
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`));
  await settle();
  await fireEvent.press(await screen.findByLabelText('Save to phone'));
  expect(await screen.findByText('Saved to your phone')).toBeTruthy();
  expect(screen.queryByText('This film look is Pro')).toBeNull();
}, 30000);

/** The puppy story's id: Pro's Discover opens its Preview at /preview/<id>. Leaves nothing behind (no draft). */
async function puppyStoryId() {
  world.pro = true;
  const app = await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 }));
  await screen.findByLabelText('Post');
  const id = decodeURIComponent(app.getPathname().replace('/preview/', ''));
  screen.unmount();
  world.pro = false;
  return id;
}

test.each(['preview', 'edit'])('free: a deep link to a locked story\'s %s shows the lock and makes no draft', async (route) => {
  const id = await puppyStoryId();
  expect(id).toMatch(/^topic:/);
  await bootApp(`/${route}/${encodeURIComponent(id)}`);
  expect(await screen.findByText(/This dump is locked\.$/, {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.queryByLabelText('Post')).toBeNull();
  await settle();
  expect(await list('draft')).toHaveLength(0);
}, 30000);

test('free: unlocking from a locked story\'s Edit replaces it with the Preview, so Back goes to Discover', async () => {
  const id = await puppyStoryId();
  const app = await bootApp('/');
  await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 });
  // (Preview's own stub is dangerouslySingular: the unlocked Preview lands on the same screen either way)
  await act(async () => { router.push({ pathname: '/edit/[id]', params: { id } }); });
  await fireEvent.press(await screen.findByRole('button', { name: 'Unlock' }));
  await fireEvent.press(await screen.findByText('Use free unlock'));
  expect(await screen.findByLabelText('Post')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Back'));
  await waitFor(() => expect(app.getPathname()).toBe('/'));
  expect(await screen.findByLabelText(`${LONG}, ${META}`)).toBeTruthy();
}, 30000);

/** The IG Profile Grid's other tiles (covers of past posts and open dumps) for a manual one-photo dump. */
async function gridCovers() {
  const p = world.photos.at(-1)!;
  const d = await createDraft({ source: 'create', photos: [{ id: p.id, uri: p.uri }] });
  await bootApp(`/preview/${d.id}`);
  await fireEvent.press(await screen.findByRole('tab', { name: 'IG Profile Grid' }, { timeout: 10000 }));
  await settle();
  const covers = screen.queryAllByTestId('grid-cover').map((el) => (el.props.source as { uri: string }).uri);
  screen.unmount();
  await remove(d.id);
  return covers;
}

test('free: the IG Profile Grid shows only open dumps\' covers (a locked cover is one of its picks)', async () => {
  world.pro = true;
  const all = await gridCovers();
  world.pro = false;
  const free = await gridCovers();
  expect(free.length).toBeLessThan(all.length);
  expect(free.every((u) => all.includes(u))).toBe(true);

  // unlocking a dump adds its cover
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByText('Use free unlock'));
  await screen.findByLabelText('Post');
  screen.unmount();
  for (const d of await list()) await remove(d.id);
  const unlocked = await gridCovers();
  expect(unlocked.length).toBe(free.length + 1);
  expect(unlocked.every((u) => all.includes(u))).toBe(true);
}, 60000);

test('free: the 8 PM recap route is never locked', async () => {
  await bootApp('/preview/today');
  expect(await screen.findByText(/Nothing taken today yet/, {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.queryByText(/This dump is locked/)).toBeNull();
}, 30000);

test('free: the week recap is open, on Discover and from the Sunday notification', async () => {
  // 9 camera photos over the recap week's first 3 days (all before today, whichever weekday this runs on)
  const week = recapPeriods(Date.now())[0];
  const day0 = new Date(week.start);
  const at = (d: number, h: number) => new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + d, h);
  seedWorld([...defaultLibrary(), ...[0, 1, 2].flatMap((d) => [9, 13, 18].map((h) => photo(at(d, h), [3])))]);
  world.pro = false;
  // the weekly unlock is already spent: a recap doesn't need it
  await AsyncStorage.setItem('@picdump_unlocks', JSON.stringify({ lastAt: Date.now(), ids: [], spans: {} }));

  await bootApp('/');
  const tile = await screen.findByLabelText(new RegExp(`^${week.title}, `), {}, { timeout: 10000 });
  expect(tile.props.accessibilityLabel).not.toMatch(/, locked$/);
  expect(screen.getByLabelText(`${LONG}, ${META}, locked`)).toBeTruthy();
  await fireEvent.press(tile);
  expect(await screen.findByLabelText('Post')).toBeTruthy();
  expect(screen.queryByText(/This dump is locked/)).toBeNull();
  screen.unmount();

  // the Sunday noon notification opens /preview/recap:week:…
  await bootApp(`/preview/${encodeURIComponent(week.id)}`);
  expect(await screen.findByLabelText('Post', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.queryByText(/This dump is locked/)).toBeNull();
}, 30000);

test('after Pro lapses, a Library draft still opens in Edit from its Preview', async () => {
  // the draft a Pro user made of the (now locked) puppy story
  const storyId = await puppyStoryId();
  const draft = await createDraft({ title: 'Puppy', source: 'story', storyId, photos: world.photos.slice(0, 4).map((p) => ({ id: p.id, uri: p.uri, created: p.created })) });

  const app = await bootApp(`/preview/${draft.id}`);
  await fireEvent.press(await screen.findByLabelText('Edit', {}, { timeout: 10000 }));
  await waitFor(() => expect(app.getPathname()).toBe(`/edit/${draft.id}`));
  expect(await screen.findByLabelText('1:1 Square')).toBeTruthy();
  expect(screen.queryByText(/This dump is locked/)).toBeNull();
}, 30000);

test('a subscriber with a cached Pro answer never sees a lock while RevenueCat is slow', async () => {
  world.pro = true;
  await cachePro();
  const answer = slowRevenueCat();
  await bootApp('/');
  expect(lockedOnScreen()).toBeNull();
  expect(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByLabelText(SEATTLE_OPEN)).toBeTruthy();
  await settle(3000);
  expect(lockedOnScreen()).toBeNull();

  answer();
  await settle();
  expect(screen.getByLabelText(`${LONG}, ${META}`)).toBeTruthy();
  expect(lockedOnScreen()).toBeNull();
}, 30000);

test('RevenueCat failing keeps the last known answer', async () => {
  world.pro = false;
  await cachePro();
  rc.getCustomerInfo.mockImplementation(async () => { throw new Error('offline'); });
  await bootApp('/');
  expect(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 })).toBeTruthy();
  await settle();
  expect(lockedOnScreen()).toBeNull();
  expect(JSON.parse((await AsyncStorage.getItem(KNOWN))!).sub).not.toBeNull();
}, 30000);

test('a first-boot subscriber gets no first-Discover paywall while RevenueCat has not answered', async () => {
  world.pro = true;
  await AsyncStorage.removeItem('@picdump_first_paywall_shown');
  const answer = slowRevenueCat();
  await bootApp('/');
  // nothing cached: assumed free, so the dumps show locked until RevenueCat answers
  expect(await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 })).toBeTruthy();
  await settle(3000);
  expect(screen.queryByText(/We found \d+ dumps/)).toBeNull();

  answer();
  expect(await screen.findByLabelText(`${LONG}, ${META}`)).toBeTruthy();
  await settle();
  expect(screen.queryByText(/We found \d+ dumps/)).toBeNull();
  expect(await AsyncStorage.getItem('@picdump_first_paywall_shown')).toBeNull();
}, 30000);

test('the first-Discover paywall waits for Discover to be on screen', async () => {
  await AsyncStorage.removeItem('@picdump_first_paywall_shown');
  const answer = slowRevenueCat();
  await bootApp('/');
  await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 });
  // RevenueCat answers "free" while the user is on Create
  await fireEvent.press(screen.getByLabelText('Create'));
  await screen.findByPlaceholderText('Search keyword, place, date...');
  answer();
  await settle(3000);
  expect(screen.queryByText(/We found \d+ dumps/)).toBeNull();

  await fireEvent.press(screen.getByLabelText('Discover'));
  expect(await screen.findByText('We found 3 dumps in your roll.')).toBeTruthy();
}, 30000);

test('free: Edit\'s add sheet ranks the whole library, as Create\'s Similar strip does', async () => {
  const basket = await createDraft({ title: 'Mine', source: 'create', photos: world.photos.slice(0, 3).map((p) => ({ id: p.id, uri: p.uri, created: p.created })) });
  await bootApp(`/edit/${basket.id}`);
  await fireEvent.press(await screen.findByLabelText('Add photos', {}, { timeout: 10000 }));
  expect(await screen.findByText('Similar photos')).toBeTruthy();
  expect(screen.getAllByLabelText('Use this photo').length).toBeGreaterThan(2);
  expect(screen.queryByText(/come with Pro/)).toBeNull();
}, 30000);

test('Pro: Edit\'s add sheet ranks the whole library too', async () => {
  world.pro = true;
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByLabelText('Edit'));
  await fireEvent.press(await screen.findByLabelText('Add photos', {}, { timeout: 10000 }));
  expect(await screen.findByText('Similar photos')).toBeTruthy();
  expect(screen.getAllByLabelText('Use this photo').length).toBeGreaterThan(2);
}, 30000);
