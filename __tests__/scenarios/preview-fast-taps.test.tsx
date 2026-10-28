import { act, fireEvent, screen } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
import { createDraft } from '../../src/services/dumps';

beforeAll(() => seedWorld());

test('Preview pager: fast taps aren\'t undone by the scroll events of our own animation; a swipe still turns the page', async () => {
  const d = await createDraft({ source: 'create', photos: world.photos.slice(0, 3).map((p) => ({ id: p.id, uri: p.uri })), layout: 'single' });
  await bootApp(`/preview/${d.id}`);
  expect(await screen.findByText('1/3')).toBeTruthy();
  let pager = screen.getAllByLabelText('Next slide')[0];
  while (!pager.props.onScrollEndDrag) pager = pager.parent!;
  const w = pager.props.getItemLayout(null, 1).offset;
  const settle = (x: number) => act(() => pager.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x, y: 0 } } }));

  await fireEvent.press(screen.getAllByLabelText('Next slide')[0]);
  await fireEvent.press(screen.getAllByLabelText('Next slide')[0]);
  expect(await screen.findByText('3/3')).toBeTruthy();
  // Android: the second tap cancels the first animation, which reports momentum end at its half-way offset
  await settle(0.4 * w);
  await settle(0);
  expect(screen.getByText('3/3')).toBeTruthy();

  await act(() => pager.props.onScrollEndDrag({ nativeEvent: { contentOffset: { x: 0.6 * w, y: 0 } } }));
  await settle(w);
  expect(await screen.findByText('2/3')).toBeTruthy();
}, 30000);
