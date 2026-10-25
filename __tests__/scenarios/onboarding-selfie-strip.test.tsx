import path from 'path';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { getProfile } from '../../src/services/profile';

// every photo is a solo selfie: one big, sure, centered face
const CE = (globalThis as any).expo.modules.ClipEmbedder;
const scan = () => ({ aspect: 0.75, faces: [{ score: 0.9, x: 0.25, y: 0.2, w: 0.5, h: 0.4 }] });
CE.faces = async (uris: string[]) => uris.map(scan);
CE.selfieCheck = async (uris: string[]) => ({ scans: uris.map(scan), vecs: '', reject: uris.map(() => 0), gateVecs: '', sharp: uris.map(() => 100) });

beforeAll(() => seedWorld());
beforeEach(() => AsyncStorage.clear());

/** The image sources drawn under a node (expo-image hands the native view an array). */
const sources = (n: any): string[] =>
  n == null || typeof n === 'string' ? [] : Array.isArray(n) ? n.flatMap(sources) : [...[n.props?.source].flat().flatMap((x) => (x?.uri ? [x.uri] : [])), ...sources(n.children ?? [])];

test('onboarding: the other-selfies strip draws small face crops, not the whole photos', async () => {
  await renderRouter(path.resolve(__dirname, '../../src/app'), { initialUrl: '/' });
  const hook = await screen.findByText('Turn camera roll chaos into dumps', {}, { timeout: 10000 });
  let pager = hook;
  while (!pager.props.onScroll) pager = pager.parent!;
  await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: Dimensions.get('window').width } } });
  await fireEvent.press(await screen.findByText('Allow photos & continue'));
  await fireEvent.press(await screen.findByText('Not now'));
  await fireEvent.changeText(await screen.findByPlaceholderText('Your name'), 'Ada');
  await fireEvent.press(screen.getByText('Next'));

  expect(await screen.findByText('Is this you?', {}, { timeout: 10000 })).toBeTruthy();
  await fireEvent.press(screen.getByText("That's me"));
  await settle();
  const thumb = await screen.findByLabelText('Photo 2');
  expect(screen.getByLabelText('Photo 8')).toBeTruthy();
  for (let i = 1; i <= 8; i++) {
    const src = sources(screen.getByLabelText(`Photo ${i}`));
    expect(src).toHaveLength(1);
    expect(src[0]).toMatch(/^file:\/\/\/cache\/faces\/.+\.jpg$/); // FaceThumb's crop
  }

  // swap to another (its flight doesn't land here: jest's measureInWindow never calls back)
  await fireEvent.press(thumb);
  await settle();
  await fireEvent.press(screen.getByText('Continue'));
  await settle();
  expect((await getProfile()).avatar).toMatch(/^file:\/\/\/doc\/avatar-/);
}, 30000);
