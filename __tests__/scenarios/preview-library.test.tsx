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
  await screen.findByLabelText('Post on Instagram or TikTok');
  expect(screen.getByRole('tab', { name: 'IG Post', selected: true })).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Post on Instagram or TikTok'));
  // done sheet (board 10)
  expect(await screen.findByText('Posted to Instagram')).toBeTruthy();
  expect(screen.getByText('Caption copied · 6 slides saved to the DayDump album.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Back to Discover'));
  await waitFor(() => expect(app.getPathname()).toBe('/'));
  expect(share()).toHaveBeenCalledTimes(1);
  const [uris, caption, target] = share().mock.calls[0];
  expect(target).toBe('instagram');
  expect(uris).toHaveLength(6); // one 1-photo slide per pick
  expect(uris.every((u: string) => u.endsWith('.jpg'))).toBe(true);
  expect(typeof caption).toBe('string');
  await settle();
  const posted = (await list()).filter((d) => d.status === 'posted');
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ title: LONG, platform: 'instagram', caption });

  // TikTok tab -> the TikTok target
  // back on Discover the Seattle trip is the hero again
  world.shareResult = 'com.zhiliaoapp.musically';
  await fireEvent.press(await screen.findByLabelText('Preview A week in Seattle'));
  await fireEvent.press(await screen.findByRole('tab', { name: 'TikTok 9:16' }));
  await fireEvent.press(screen.getByLabelText('Post on Instagram or TikTok'));
  await waitFor(() => expect(share()).toHaveBeenCalledTimes(2));
  expect(share().mock.calls[1][2]).toBe('tiktok');
  expect(await screen.findByText('Posted to TikTok')).toBeTruthy();
  await fireEvent.press(screen.getByText('View in Library'));

  // Library → Posted
  await waitFor(() => expect(app.getPathname()).toBe('/library'));
  expect(await screen.findByText('Posted (2)')).toBeTruthy();
  expect(screen.getByLabelText(`${LONG}, posted`)).toBeTruthy();
  expect(screen.getByText(new RegExp(`^6 photos · .+\\sShared to IG · ${today()}$`))).toBeTruthy();
  expect(screen.getByText(new RegExp(`^6 photos · .+\\sShared to TikTok · ${today()}$`))).toBeTruthy();

  // Reuse: an editable copy, "{title} (2)", opened in Edit
  const before = (await list()).length;
  const row = screen.getByLabelText(`${LONG}, posted`);
  const reuse = screen.getAllByText('Reuse').find((n) => { for (let p = n.parent; p; p = p.parent) if (p === row) return true; return false; })!;
  await fireEvent.press(reuse);
  expect(await screen.findByText(`${LONG} (2)`)).toBeTruthy();
  const all = await list();
  expect(all).toHaveLength(before + 1);
  const copy = all.find((d) => d.title === `${LONG} (2)`)!;
  expect(copy.status).toBe('draft');
  expect(app.getPathname()).toBe(`/edit/${copy.id}`);
}, 30000);

test('Save only shows the done sheet; Start a new dump opens Create', async () => {
  const app = await bootApp('/');
  // the Seattle trip is the hero; the long topic's tile opens its preview
  await fireEvent.press(await screen.findByLabelText(`${LONG}, 6 photos · Sep 22–Oct 22, 2025`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByLabelText('Save only, to the DayDump album'));
  expect(await screen.findByText('Saved to your phone')).toBeTruthy();
  expect(screen.getByText('6 slides saved to the DayDump album.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Start a new dump'));
  await waitFor(() => expect(app.getPathname()).toBe('/create'));
}, 30000);
