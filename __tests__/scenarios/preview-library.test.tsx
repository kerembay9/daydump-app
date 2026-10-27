import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { list } from '../../src/services/dumps';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';
const share = () => ClipEmbedder!.shareImages as jest.Mock;
const today = () => new Date().toLocaleString('en-US', { month: 'short', day: 'numeric' }); // "Oct 20"

beforeAll(() => seedWorld());

test('Post shares to the chosen app and marks the dump Posted; Library shows it; Reuse makes "{title} (2)"', async () => {
  const app = await bootApp('/');
  // the Seattle trip is the hero; the long topic's tile opens its preview
  await fireEvent.press(await screen.findByLabelText(`${LONG}, 6 photos · Sep 22–Oct 22, 2025`, {}, { timeout: 10000 }));
  await screen.findByLabelText('Post');
  expect(screen.getByRole('tab', { name: 'IG Post', selected: true })).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Post'));
  await fireEvent.press(await screen.findByLabelText('Instagram post'));
  // done sheet (board 10)
  expect(await screen.findByText('Posted to Instagram')).toBeTruthy();
  expect(screen.getByText('6 slides saved to the PicDump album.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Back to Discover'));
  await waitFor(() => expect(app.getPathname()).toBe('/'));
  expect(share()).toHaveBeenCalledTimes(1);
  const [uris, caption, target] = share().mock.calls[0];
  expect(target).toBe('instagram');
  expect(uris).toHaveLength(6); // one 1-photo slide per pick
  expect(uris.every((u: string) => u.endsWith('.jpg'))).toBe(true);
  expect(caption).toBe(''); // no caption: the share carries only the slides
  await settle();
  const posted = (await list()).filter((d) => d.status === 'posted');
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ title: LONG, platform: 'instagram', caption: null });

  // TikTok from the app picker
  // back on Discover the Seattle trip is the hero again
  world.shareResult = 'com.zhiliaoapp.musically';
  await fireEvent.press(await screen.findByLabelText('Preview A week in Seattle'));
  await fireEvent.press(await screen.findByRole('tab', { name: 'TikTok 9:16' }));
  await fireEvent.press(screen.getByLabelText('Post'));
  await fireEvent.press(await screen.findByLabelText('TikTok'));
  await waitFor(() => expect(share()).toHaveBeenCalledTimes(2));
  expect(share().mock.calls[1][2]).toBe('tiktok');
  expect(await screen.findByText('Posted to TikTok')).toBeTruthy();
  await fireEvent.press(screen.getByText('View in Library'));

  // Library → Posted
  await waitFor(() => expect(app.getPathname()).toBe('/library'));
  expect(await screen.findByText('Posted (2)')).toBeTruthy();
  expect(screen.getByLabelText(`${LONG}, posted`)).toBeTruthy();
  expect(screen.getByText(new RegExp(`^6 photos · .+\\sShared to IG · ${today()}$`))).toBeTruthy();
  expect(screen.getByText(new RegExp(`^9 photos · .+\\sShared to TikTok · ${today()}$`))).toBeTruthy();

  // Reuse: an editable copy, "{title} (2)", opened in Edit
  const before = (await list()).length;
  const row = screen.getByLabelText(`${LONG}, posted`);
  const reuse = screen.getAllByText('Reuse').find((n) => { for (let p = n.parent; p; p = p.parent) if (p === row) return true; return false; })!;
  await fireEvent.press(reuse);
  expect(await screen.findByDisplayValue(`${LONG} (2)`)).toBeTruthy();
  const all = await list();
  expect(all).toHaveLength(before + 1);
  const copy = all.find((d) => d.title === `${LONG} (2)`)!;
  expect(copy.status).toBe('draft');
  expect(app.getPathname()).toBe(`/edit/${copy.id}`);
}, 30000);

test('Save to phone shows the done sheet; Start a new dump opens Create', async () => {
  const app = await bootApp('/');
  // the Seattle trip is the hero; the long topic's tile opens its preview
  await fireEvent.press(await screen.findByLabelText(`${LONG}, 6 photos · Sep 22–Oct 22, 2025`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByLabelText('Save to phone'));
  expect(await screen.findByText('Saved to your phone')).toBeTruthy();
  expect(screen.getByText('6 slides saved to the PicDump album.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Start a new dump'));
  await waitFor(() => expect(app.getPathname()).toBe('/create'));
}, 30000);

test('Preview renders the slides in the background; Post reuses them, a Quality change renders again', async () => {
  const draw = jest.requireMock('@shopify/react-native-skia').drawAsImage as jest.Mock;
  await bootApp('/');
  const tile = await screen.findByLabelText(`${LONG}, 6 photos · Sep 22–Oct 22, 2025`, {}, { timeout: 10000 });
  draw.mockClear();
  (ClipEmbedder!.holdIndexing as jest.Mock).mockClear();
  await fireEvent.press(tile);
  // nothing tapped: the 6 slides render anyway, and indexing is held while they do
  await waitFor(() => expect(draw).toHaveBeenCalledTimes(6));
  expect(ClipEmbedder!.holdIndexing).toHaveBeenCalled();
  // Quality → the other setting (the header chip): a fresh export
  const chip = screen.getByLabelText('HD export for this dump');
  const was = chip.props.accessibilityState.checked;
  await fireEvent.press(chip);
  expect(screen.getByLabelText('HD export for this dump')).toHaveTextContent(was ? 'Standard' : 'HD');
  await waitFor(() => expect(draw).toHaveBeenCalledTimes(12));
  await settle();
  share().mockClear();
  await fireEvent.press(screen.getByLabelText('Post'));
  await fireEvent.press(await screen.findByLabelText('Instagram post'));
  expect(await screen.findByText('Posted to Instagram')).toBeTruthy();
  expect(draw).toHaveBeenCalledTimes(12); // Post drew nothing new
  expect(share().mock.calls[0][0]).toHaveLength(6);
}, 30000);

test('Post lists only the installed apps; Story opens Instagram Stories', async () => {
  world.shareTargets = ['instagram', 'instagram-story', 'instagram-reel'];
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, 6 photos · Sep 22–Oct 22, 2025`, {}, { timeout: 10000 }));
  share().mockClear();
  await fireEvent.press(await screen.findByLabelText('Post'));
  expect(await screen.findByText('A carousel of 6 slides')).toBeTruthy();
  expect(screen.getByText('6 stories, one per slide')).toBeTruthy();
  expect(screen.getByLabelText('Instagram reel')).toBeTruthy();
  expect(screen.queryByLabelText('TikTok')).toBeNull(); // not installed
  await fireEvent.press(screen.getByLabelText('Instagram story'));
  expect(await screen.findByText('Posted to Instagram Stories')).toBeTruthy();
  expect(share().mock.calls[0][2]).toBe('instagram-story');
  await settle();
  expect((await list()).filter((d) => d.platform === 'instagram-story')).toMatchObject([{ status: 'posted' }]);
}, 30000);

test('Post to WhatsApp: sends the slides, marks it posted as whatsapp', async () => {
  world.shareTargets = ['instagram', 'whatsapp'];
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, 6 photos · Sep 22–Oct 22, 2025`, {}, { timeout: 10000 }));
  share().mockClear();
  await fireEvent.press(await screen.findByLabelText('Post'));
  expect(await screen.findByText('Send 6 slides to a chat')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('WhatsApp'));
  expect(await screen.findByText('Sent to WhatsApp')).toBeTruthy();
  expect(share().mock.calls[0][2]).toBe('whatsapp');
  await settle();
  expect((await list()).filter((d) => d.platform === 'whatsapp')).toMatchObject([{ status: 'posted' }]);
}, 30000);

test('no Instagram or TikTok installed: Post skips the picker, straight to the system share sheet', async () => {
  world.shareTargets = [];
  world.shareResult = 'chooser';
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText('Preview A week in Seattle', {}, { timeout: 10000 }));
  share().mockClear();
  await fireEvent.press(await screen.findByLabelText('Post'));
  expect(await screen.findByText('Shared')).toBeTruthy();
  expect(share()).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Share to')).toBeNull();
}, 30000);
