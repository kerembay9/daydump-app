import { act, fireEvent, screen } from 'expo-router/testing-library';
import { AppState } from 'react-native';
import { bootApp, dump, settle } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';

beforeAll(() => seedWorld());

/** Back in front: every 'change' listener (AppState, models) hears 'active'. */
const resume = async () => {
  const subs = (AppState.addEventListener as jest.Mock).mock.calls.filter(([e]) => e === 'change').map(([, f]) => f);
  await act(async () => { subs.forEach((f) => f('active')); });
  await settle(5000);
};
/** Host nodes showing a library photo (expo-image prints). */
type Node = { props?: { source?: { uri?: string } | { uri?: string }[]; cachePolicy?: string }; children?: unknown[] };
const photos = (n: unknown): Node[] => {
  if (!n || typeof n !== 'object') return [];
  if (Array.isArray(n)) return n.flatMap(photos);
  const src = (n as Node).props?.source;
  const uri = Array.isArray(src) ? src[0]?.uri : src?.uri;
  return [...(uri?.startsWith('file://') ? [n as Node] : []), ...photos((n as Node).children ?? [])];
};
const order = () => dump().filter((l) => /^\[(Preview .*|.*, \d+ photos · .*)\]$/.test(l)).map((l) => l.replace(/, \d+ photos · .*/, ''));

test('back in front after a background index: Discover keeps its order, and prints come from the memory cache', async () => {
  await bootApp('/');
  await screen.findByLabelText(/^A week in Seattle, /, {}, { timeout: 10000 });
  const before = order();
  expect(before).toEqual(['[A week in Seattle', '[An autumn of golden retriever puppy splashing through the shallow waves', '[Cinnamon rolls']);

  // Leave with indexing handed to the background worker (paused there), come back.
  world.bg.state = 'paused';
  await resume();
  // Away again: the two latest retriever photos are deleted, so a fresh ranking puts Cinnamon rolls first.
  const dog = world.photos.filter((p) => p.concepts[0] === 8);
  world.photos = world.photos.filter((p) => !dog.slice(-2).includes(p));
  await resume();

  // A reshuffle would remount every tile and reload every photo; the story just updates in place.
  expect(order()).toEqual(before);
  expect(screen.getByLabelText(/^An autumn of golden retriever .*, 6 photos/)).toBeTruthy();
  // photo stacks draw once they know their width
  for (const stack of screen.root!.queryAll((n) => n.props.pointerEvents === 'none' && !!n.props.onLayout)) {
    await fireEvent(stack, 'layout', { nativeEvent: { layout: { width: 300, height: 200 } } });
  }
  const prints = photos(screen.toJSON());
  expect(prints.length).toBeGreaterThan(0);
  for (const p of prints) expect(p.props?.cachePolicy).toBe('memory-disk');
  world.bg.state = 'idle';
}, 30000);
