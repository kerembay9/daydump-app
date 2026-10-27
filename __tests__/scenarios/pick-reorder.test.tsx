import { StyleSheet } from 'react-native';
import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { SLIDE_MS } from '../../src/components/create/PickRow';

beforeAll(() => seedWorld());

/** The animated thumb holding `Photo N`. (Reanimated's jest mock doesn't run animations: this checks the views, not the motion.) */
const thumb = (n: number) => {
  let v: ReturnType<typeof screen.getByLabelText> | null = screen.getByLabelText(`Photo ${n}`);
  while (v && v.props.testID !== 'pick-thumb') v = v.parent;
  return v!;
};
const z = (n: number) => StyleSheet.flatten(thumb(n).props.style).zIndex;

test('Picks: the selected photo sits above the rest, and Move later moves the same view (so it glides) to #3, still selected', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  const cells = screen.getAllByLabelText(/^Photo from /);
  for (const i of [0, 4, 8]) await fireEvent.press(cells[i]);
  await fireEvent.press(screen.getByLabelText('Picks: 3. Review'));
  await fireEvent.press(await screen.findByLabelText('Photo 2'));
  expect([z(1), z(2), z(3)]).toEqual([1, 2, 1]);

  const moving = thumb(2), passed = thumb(3);
  await fireEvent.press(screen.getByLabelText('Move later'));
  await settle(SLIDE_MS);
  expect(thumb(3)).toBe(moving);
  expect(thumb(2)).toBe(passed);
  expect(screen.getByLabelText('Photo 3').props.accessibilityState).toMatchObject({ selected: true });
  expect([z(1), z(2), z(3)]).toEqual([1, 1, 2]);
}, 30000);
