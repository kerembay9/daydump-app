import { act, fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
import { currentCreateDraft, list } from '../../src/services/dumps';

const media = (id: string) => `content://media/external/images/media/${id}`;
const ids = async () => ((await currentCreateDraft())?.photos ?? []).map((p) => p.id);
const shareIn = (uris: string[]) => act(async () => world.shareListener!({ action: 'SEND_MULTIPLE', uris, mimeType: 'image/*' }));
const ASK = 'Add to your draft or start a new one?';

beforeAll(() => seedWorld());

test('opened with photos and no draft in progress: a new Create draft, no question', async () => {
  world.initialShare = { action: 'VIEW', uris: [media('5'), 'content://com.whatsapp.provider/media/IMG-1.jpg'], mimeType: 'image/jpeg' };
  const app = await bootApp('/');
  expect(await screen.findByLabelText('Picks: 2. Review', {}, { timeout: 10000 })).toBeTruthy();
  expect(app.getPathname()).toBe('/create');
  expect(screen.queryByText(ASK)).toBeNull();
  const d = await currentCreateDraft();
  expect(d).toMatchObject({ title: 'Shared photos', status: 'draft' });
  expect(d!.photos[0]).toMatchObject({ id: '5', uri: world.photos[4].uri }); // MediaStore id -> the library photo
  expect(d!.photos[1].uri).toMatch(/^file:\/\/\/doc\/shared\/\d+-1\.jpg$/); // another app's file, copied in
  world.initialShare = null;
}, 30000);

test('shared while a draft is in progress: opens Create and asks; Add joins it, Start a new dump starts another', async () => {
  // still running from the first test: the Create draft holds 2 photos; shared in while on Discover
  const app = await bootApp('/');
  const first = (await currentCreateDraft())!.id;

  await shareIn([media('10'), media('11')]);
  expect(await screen.findByText(ASK, {}, { timeout: 10000 })).toBeTruthy();
  expect(app.getPathname()).toBe('/create'); // on Create already, under the question
  expect(screen.getByText(/^2 photos shared to PicDump\./)).toBeTruthy();
  await fireEvent.press(screen.getByText('Add to my draft'));
  expect(await screen.findByLabelText('Picks: 4. Review')).toBeTruthy();
  expect((await currentCreateDraft())!.id).toBe(first);
  expect((await ids()).slice(2)).toEqual(['10', '11']);

  await settle(); // Create reloads on a new `shared` param (Date.now()): let the fake clock move
  await shareIn([media('12')]);
  expect(await screen.findByText(/^1 photo shared to PicDump\./)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Start a new dump'));
  expect(await screen.findByLabelText('Picks: 1. Review')).toBeTruthy();
  await settle();
  const now = (await currentCreateDraft())!;
  expect(now.id).not.toBe(first);
  expect(await ids()).toEqual(['12']);
  // the earlier draft is kept in Library → Drafts
  expect((await list()).find((d) => d.id === first)?.photos).toHaveLength(4);
}, 30000);
