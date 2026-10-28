import * as Haptics from 'expo-haptics';
import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { THROW_MS } from '../../src/components/create/BasketThrow';

// The test renderer has no layout: every View (the screen, the basket) says it sits at the window's origin.
const views = jest.requireActual('@react-native/jest-preset/jest/MockNativeMethods').default;
const tile = (x: number, y: number) => ({ currentTarget: { measureInWindow: (cb: (...r: number[]) => void) => cb(x, y, 110, 76) } });

beforeAll(() => seedWorld());

test('adding a photo tosses it into the basket, which lands with a light haptic; taking it out throws nothing', async () => {
  views.measureInWindow.mockImplementation((cb: (...r: number[]) => void) => cb(0, 0, 400, 800));
  const haptic = jest.spyOn(Haptics, 'impactAsync');
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });

  const [first] = screen.getAllByLabelText(/^Photo from /);
  await fireEvent.press(first, tile(16, 300));
  expect(screen.getByLabelText('Picks: 1. Review')).toBeTruthy(); // the basket counts it at once...
  expect(screen.getAllByTestId('basket-throw')).toHaveLength(1); // ...while the copy is in the air
  expect(haptic).not.toHaveBeenCalled();

  await settle(THROW_MS);
  expect(screen.queryByTestId('basket-throw')).toBeNull();
  expect(haptic).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);

  // taking it back out: no throw
  await fireEvent.press(screen.getByLabelText(/number 1 in your picks$/), tile(16, 300));
  expect(screen.queryByTestId('basket-throw')).toBeNull();
  expect(screen.getByLabelText('Picks: 0. Review')).toBeTruthy();
}, 30000);
