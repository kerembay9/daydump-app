import { ToastAndroid } from 'react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { list } from '../../src/services/dumps';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';
const share = () => ClipEmbedder!.shareImages as jest.Mock;
const toasts = () => (ToastAndroid.show as jest.Mock).mock.calls.map((c) => c[0] as string);
const today = () => new Date().toLocaleString('en-US', { month: 'short', day: 'numeric' }); // "Oct 20"

beforeAll(() => seedWorld());

test('Post shares to the chosen app and marks the dump Posted; Library shows it; Reuse makes "{title} (2)"', async () => {
  const app = await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`Preview ${LONG}`, {}, { timeout: 10000 }));
  await screen.findByLabelText('Post on Instagram or TikTok');
  expect(screen.getByRole('tab', { name: 'IG Post', selected: true })).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Post on Instagram or TikTok'));
  await waitFor(() => expect(toasts().some((m) => m.startsWith('Paste your caption in Instagram.'))).toBe(true));
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
  await fireEvent.press(screen.getByLabelText('Back'));
  await fireEvent.press(await screen.findByLabelText('A week in Seattle, 6 photos · Aug 4–9, 2025'));
  world.shareResult = 'com.zhiliaoapp.musically';
  await fireEvent.press(await screen.findByLabelText('Preview A week in Seattle'));
  await fireEvent.press(await screen.findByRole('tab', { name: 'TikTok 9:16' }));
  await fireEvent.press(screen.getByLabelText('Post on Instagram or TikTok'));
  await waitFor(() => expect(share()).toHaveBeenCalledTimes(2));
  expect(share().mock.calls[1][2]).toBe('tiktok');
  await waitFor(() => expect(toasts().some((m) => m.startsWith('Paste your caption in TikTok.'))).toBe(true));

  // Library → Posted
  await fireEvent.press(screen.getByLabelText('Back'));
  await fireEvent.press(await screen.findByLabelText('Library'));
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
