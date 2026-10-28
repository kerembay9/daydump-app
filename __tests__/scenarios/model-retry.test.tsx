import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld } from '../../jest/world';

beforeAll(() => seedWorld([]));

test('a failed download says its size and has Try again, which restarts it', async () => {
  const CE = (globalThis as any).expo.modules.ClipEmbedder;
  CE.modelState = jest.fn(async () => ({
    faces: { state: 'ready', progress: 1 }, vision: { state: 'failed', progress: 0 }, text: { state: 'queued', progress: 0 },
  }));
  await bootApp('/');
  expect(await screen.findByText('The 11 MB download stopped. Check your connection, then try again.', {}, { timeout: 10000 })).toBeTruthy();
  const calls = CE.modelState.mock.calls.length;
  await fireEvent.press(screen.getByText('Try again'));
  expect(CE.modelState.mock.calls.length).toBe(calls + 1);
}, 30000);
