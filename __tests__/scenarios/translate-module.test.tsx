import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';

// Release builds get ML Kit's code (the translate feature module) from Play only when a search language besides English is wanted.
beforeAll(() => seedWorld());

test('an English phone never asks for the translate module', async () => {
  world.lang.module = false;
  world.lang.device = 'en';
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  await fireEvent.changeText(screen.getByPlaceholderText('Search keyword, place, date...'), 'gün batımı');
  await screen.findByText(/^(Matches for "gün batımı"|No matches)/);
  expect(screen.queryByText(/still downloading/)).toBeNull();
  expect(world.lang.module).toBe(false);
});

test('a Turkish phone on a fresh install: the search waits for the module and model, then uses the translation', async () => {
  world.lang.module = false;
  world.lang.device = 'tr';
  world.lang.downloaded = ['en'];
  let release!: () => void;
  world.lang.gate = new Promise<void>((r) => { release = r; });
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  const search = screen.getByPlaceholderText('Search keyword, place, date...');

  await fireEvent.changeText(search, 'sunset');
  const sunsets = Number((await screen.findByText(/^Matches for "sunset"/)).props.children.match(/\((\d+)\)/)[1]);

  // no module yet: language ID finds nothing, so every search language counts as pending
  await fireEvent.changeText(search, 'gün batımı');
  expect(await screen.findByText(/Turkish is still downloading/)).toBeTruthy();

  await act(async () => { release(); });
  await waitFor(() => expect(screen.queryByText(/still downloading/)).toBeNull());
  expect(world.lang.module).toBe(true);
  expect(await screen.findByText(`Matches for "gün batımı" (${sunsets})`)).toBeTruthy();
});
