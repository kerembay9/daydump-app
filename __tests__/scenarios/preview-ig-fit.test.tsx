import { fireEvent, screen } from 'expo-router/testing-library';
import { Canvas } from '@shopify/react-native-skia';
import { bootApp } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
import { createDraft } from '../../src/services/dumps';

beforeAll(() => seedWorld());

test('IG Post preview shows a 3:4 slide whole (side bars), not cropped to the 4:5 frame', async () => {
  const [p] = world.photos;
  const d = await createDraft({ source: 'create', photos: [{ id: p.id, uri: p.uri }], ratio: '3:4' });
  await bootApp(`/preview/${d.id}`);
  expect(await screen.findByRole('tab', { name: 'IG Post', selected: true })).toBeTruthy();
  // the mocked Canvas draws nothing; read the slide's placement off the Group it was handed
  const [{ translateX }, { translateY }] = (Canvas as unknown as jest.Mock).mock.lastCall[0].children.props.transform;
  expect(translateX).toBeGreaterThan(0); // narrower than the frame: bars left and right
  expect(translateY).toBe(0); // full frame height: nothing cut top or bottom
}, 30000);

test('IG Profile Grid tile shows a 4:5 slide whole (side bars), not cropped to the square tile', async () => {
  const [p] = world.photos;
  const d = await createDraft({ source: 'create', photos: [{ id: p.id, uri: p.uri }], ratio: '4:5' });
  await bootApp(`/preview/${d.id}`);
  fireEvent.press(await screen.findByRole('tab', { name: 'IG Profile Grid' }));
  expect(await screen.findByRole('tab', { name: 'IG Profile Grid', selected: true })).toBeTruthy();
  const [{ translateX }, { translateY }] = (Canvas as unknown as jest.Mock).mock.lastCall[0].children.props.transform;
  expect(translateX).toBeGreaterThan(0);
  expect(translateY).toBe(0);
}, 30000);
