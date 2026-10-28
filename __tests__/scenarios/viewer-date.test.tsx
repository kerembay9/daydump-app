import { fireEvent, screen, within } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';

beforeAll(() => seedWorld());

const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

test('photo viewer: the shown photo\'s date sits under the n / m counter and follows the swipe', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  await settle();
  const newest = [...world.photos].sort((a, b) => b.created - a.created);
  await fireEvent(screen.getAllByLabelText(/^Photo from /)[0], 'longPress');
  const head = () => within(screen.getByText(/^\d+ \/ 77$/).parent!);
  expect(await screen.findByText('1 / 77')).toBeTruthy();
  expect(head().getByText(fmt(newest[0].created))).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Next photo'));
  expect(head().getByText(fmt(newest[1].created))).toBeTruthy();
  expect(head().queryByText(fmt(newest[0].created))).toBeNull();
}, 30000);
