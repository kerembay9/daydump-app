import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
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
const lockedOnScreen = () => screen.queryByLabelText(/, locked$/) ?? screen.queryByLabelText(/^Unlock /);

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
  expect(screen.getByLabelText('Unlock A week in Seattle')).toBeTruthy();

  await fireEvent.press(tile);
  await fireEvent.press(await screen.findByText('Use free unlock'));
  // the unlocked dump opens in Preview
  expect(await screen.findByLabelText('Post on Instagram or TikTok')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Back'));

  // it stays open; the next locked one says when the next free unlock is, and offers Pro
  expect(await screen.findByLabelText(`${LONG}, ${META}`)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Unlock A week in Seattle'));
  expect(await screen.findByText(/Your next free dump is in 7 days\.$/)).toBeTruthy();
  expect(screen.queryByText('Use free unlock')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Unlock all with Pro'));
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
}, 30000);

test('Pro: nothing is locked', async () => {
  world.pro = true;
  await bootApp('/');
  expect(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByLabelText('Preview A week in Seattle')).toBeTruthy();
  expect(screen.queryByText('Unlock')).toBeNull();
}, 30000);

test('the first time Discover is full of locked dumps, the paywall names them, once', async () => {
  await AsyncStorage.removeItem('@picdump_first_paywall_shown');
  await bootApp('/');
  expect(await screen.findByText('We found 3 dumps in your roll.', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText(/^A week in Seattle, .*\. Pro opens all of them\.$/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Close paywall'));
  screen.unmount();

  await bootApp('/');
  await screen.findByLabelText('Unlock A week in Seattle', {}, { timeout: 10000 });
  expect(screen.queryByText(/We found \d+ dumps/)).toBeNull();
}, 30000);

test('free: tapping search opens the paywall instead of the field', async () => {
  await bootApp('/create');
  const field = await screen.findByPlaceholderText('Search keyword, place, date...', {}, { timeout: 10000 });
  await fireEvent(field, 'focus');
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
  expect(screen.queryByText('Last searches')).toBeNull();
  expect(screen.queryByText('Try')).toBeNull();
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
  screen.unmount();

  // the same dump for a Pro user: the 6 photo slides only
  world.pro = true;
  await bootApp('/');
  draw.mockClear();
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 }));
  await waitFor(() => expect(draw).toHaveBeenCalledTimes(6));
  await settle(3000);
  expect(draw).toHaveBeenCalledTimes(6);
}, 30000);

test('free: saving a dump with a Pro film look asks first; "Export without finish" saves it anyway', async () => {
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByText('Use free unlock'));
  await screen.findByLabelText('Post on Instagram or TikTok');
  await fireEvent.press(screen.getByLabelText('Back'));
  // the unlock made its Library draft; give it a Pro look, then open it again
  const [draft] = await list('draft');
  await update(draft.id, { filter: { key: 'cashmere', pct: 68, all: true, per: {} } });
  const photoSlides = (calls = draw.mock.calls) => calls.map(([el]) => el.props.photos as { matrix: number[] | null }[] | undefined).filter((ps) => ps != null);
  draw.mockClear();
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`));

  // the background export draws the Pro look (it is what Preview shows)
  await waitFor(() => expect(photoSlides()).toHaveLength(6));
  expect(photoSlides().flat().every((p) => p.matrix != null)).toBe(true);
  await settle();

  draw.mockClear();
  await fireEvent.press(await screen.findByLabelText('Save only, to the PicDump album'));
  expect(await screen.findByText('This film look is Pro')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Export without finish'));
  expect(await screen.findByText('Saved to your phone')).toBeTruthy();
  // the saved slides (the first export after the tap): Original instead of the Pro look, then the end slide.
  // Preview then renders its own look again in the background, for the next Post.
  const saved = draw.mock.calls.slice(0, 7);
  expect(photoSlides(saved)).toHaveLength(6);
  expect(photoSlides(saved).flat().every((p) => p.matrix == null)).toBe(true);
  expect(saved[6][0].props.photos).toBeUndefined();
}, 30000);

/** The puppy story's id: Pro's Discover opens its Preview at /preview/<id>. Leaves nothing behind (no draft). */
async function puppyStoryId() {
  world.pro = true;
  const app = await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 }));
  await screen.findByLabelText('Post on Instagram or TikTok');
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
  expect(screen.queryByLabelText('Post on Instagram or TikTok')).toBeNull();
  await settle();
  expect(await list('draft')).toHaveLength(0);
}, 30000);

test('free: the 8 PM recap route is never locked', async () => {
  await bootApp('/preview/today');
  expect(await screen.findByText(/Nothing taken today yet/, {}, { timeout: 10000 })).toBeTruthy();
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
  expect(screen.getByLabelText('Preview A week in Seattle')).toBeTruthy();
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
