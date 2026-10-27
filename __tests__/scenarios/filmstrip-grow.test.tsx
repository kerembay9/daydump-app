import { StyleSheet } from 'react-native';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { State } from 'react-native-gesture-handler';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { get } from '../../src/services/dumps';
import { PICKED, slotOf } from '../../src/components/edit/Filmstrip';

beforeAll(() => seedWorld());

/** Scale of Edit's filmstrip thumb N. (Reanimated's jest mock jumps animations to their end and reads styles at render.) */
const scale = (n: number) => {
  const t = StyleSheet.flatten(screen.getByLabelText(new RegExp(`^Photo ${n}(, cover)?\\. Hold`)).props.style).transform as Record<string, number>[];
  return t.find((x) => 'scale' in x)!.scale;
};

test('Edit filmstrip: the tapped photo grows to PICKED; a dragged one lands where it is dropped', async () => {
  const app = await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  const cells = screen.getAllByLabelText(/^Photo from /);
  for (const i of [0, 4, 8]) await fireEvent.press(cells[i]);
  await fireEvent.press(screen.getByLabelText('Continue with 3 photos'));
  await screen.findByLabelText('1:1 Square');
  const id = app.getPathname().split('/').pop()!;
  const ids = (await get(id))!.photos.map((p) => p.id);
  expect([scale(1), scale(2), scale(3)]).toEqual([1, 1, 1]);

  await act(async () => { fireGestureHandler(getByGestureTestId(`strip-tap-${ids[1]}`), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]); });
  await settle();
  expect([scale(1), scale(2), scale(3)]).toEqual([1, PICKED, 1]);

  // hold #1 and drag it two slots right: it lands at #3, the two it passed each step back one
  await act(async () => { fireGestureHandler(getByGestureTestId(`strip-hold-${ids[0]}`), [
    { state: State.BEGAN, translationX: 0 }, { state: State.ACTIVE, translationX: 60 }, { state: State.ACTIVE, translationX: 110 }, { state: State.END, translationX: 110 },
  ]); });
  await waitFor(async () => expect((await get(id))!.photos.map((p) => p.id)).toEqual([ids[1], ids[2], ids[0]]));
}, 30000);

test('Edit filmstrip: while #1 is held over #3 (or #4 over #2), the photos between step aside into its slot', () => {
  const at = (from: number, to: number) => [0, 1, 2, 3, 4].map((k) => slotOf(k, { on: true, from, to }));
  expect(at(0, 2)).toEqual([2, 0, 1, 3, 4]);
  expect(at(3, 1)).toEqual([0, 2, 3, 1, 4]);
  expect(at(2, 2)).toEqual([0, 1, 2, 3, 4]);
});
