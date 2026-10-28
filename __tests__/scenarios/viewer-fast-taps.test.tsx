import { act, fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';

beforeAll(() => seedWorld());

test('photo viewer: late scroll events of our own animation don\'t move the counter, so ‹ after a few › goes left; a swipe still does', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  await settle();
  await fireEvent(screen.getAllByLabelText(/^Photo from /)[0], 'longPress');
  expect(await screen.findByText('1 / 77')).toBeTruthy();
  let list = screen.getByLabelText('Photo 1 of 77');
  while (!list.props.onScrollBeginDrag) list = list.parent!;
  const slot = list.props.getItemLayout(null, 1).offset;
  const scroll = (x: number) => act(() => list.props.onScroll({ nativeEvent: { contentOffset: { x, y: 0 }, contentSize: { width: 77 * slot, height: 500 }, layoutMeasurement: { width: slot, height: 500 } }, timeStamp: Date.now() }));

  for (let k = 0; k < 3; k++) await fireEvent.press(screen.getByLabelText('Next photo'));
  expect(screen.getByText('4 / 77')).toBeTruthy();
  // the animation is still on its way: its offsets arrive after the taps
  await scroll(1.2 * slot);
  await fireEvent.press(screen.getByLabelText('Previous photo'));
  await scroll(2.6 * slot);
  expect(screen.getByText('3 / 77')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Previous photo'));
  expect(screen.getByText('2 / 77')).toBeTruthy();

  await act(() => list.props.onScrollBeginDrag({ nativeEvent: { contentOffset: { x: slot, y: 0 } } }));
  await scroll(4 * slot);
  expect(screen.getByText('5 / 77')).toBeTruthy();
}, 30000);
