import { act, screen, waitFor } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { defaultLibrary, seedWorld } from '../../jest/world';
import { ClipEmbedder } from '../../modules/clip-embedder';

const WAITING = "Finding the people in your photos. They'll show up here.";
const seen = { timeout: 15000 };

test('Create says people are being found while the scan runs, and the line goes when it ends with nobody', async () => {
  seedWorld(defaultLibrary()); // nobody has a face
  const faces = ClipEmbedder!.faces as jest.Mock;
  const real = faces.getMockImplementation()!;
  let release = () => {};
  faces.mockImplementationOnce((...a: unknown[]) => new Promise((resolve) => { release = () => resolve(real(...a)); }));

  await bootApp('/create');
  expect(await screen.findByText(WAITING, {}, seen)).toBeTruthy();
  expect(screen.queryByLabelText('All people')).toBeNull();

  await act(async () => release());
  await waitFor(() => expect(screen.queryByText(WAITING)).toBeNull(), seen);
  expect(screen.queryByLabelText('All people')).toBeNull();
}, 60000);
