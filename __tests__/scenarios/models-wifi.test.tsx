import { screen } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld } from '../../jest/world';

beforeAll(() => seedWorld([]));

test('on mobile data, Home says the dumps wait for Wi-Fi, not "next in line", while facepack waits for Wi-Fi', async () => {
  // Play holds facepack until Wi-Fi; visionpack is queued behind it (one download at a time).
  (globalThis as any).expo.modules.ClipEmbedder.modelState = async () => ({
    faces: { state: 'waiting', progress: 0 }, vision: { state: 'queued', progress: 0 }, text: { state: 'queued', progress: 0 },
  });
  await bootApp('/');
  expect(await screen.findByText('Getting your dumps ready', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText(/^Waiting for Wi-Fi to download 11 MB, once\./)).toBeTruthy();
  expect(screen.queryByText(/Next in line/)).toBeNull();
}, 30000);
