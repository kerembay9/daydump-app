import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld } from '../../jest/world';

beforeAll(() => seedWorld([]));

test('waiting for Wi-Fi offers "Download now with mobile data": Play asks, and on yes the card shows the download', async () => {
  // the module mock is copied at its first import (bootApp), so set it up first
  const CE = (globalThis as any).expo.modules.ClipEmbedder;
  let vision = { state: 'waiting', progress: 0 };
  CE.modelState = async () => ({ faces: { state: 'ready', progress: 1 }, vision, text: { state: 'queued', progress: 0 } });
  CE.askToDownload = jest.fn(async () => { vision = { state: 'downloading', progress: 0.25 }; return true; });
  await bootApp('/');
  await screen.findByText(/^Waiting for Wi-Fi to download 11 MB, once\./, {}, { timeout: 10000 });
  await fireEvent.press(screen.getByText('Download now with mobile data'));
  expect(CE.askToDownload).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/^Downloading 11 MB, once \(25%\)\./)).toBeTruthy();
  expect(screen.queryByText('Download now with mobile data')).toBeNull();
}, 30000);
