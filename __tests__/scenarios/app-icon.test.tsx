import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { setProfile } from '../../src/services/profile';

beforeAll(async () => { await seedWorld(); });

test('Developer tools → App icon cycles the launcher icon', async () => {
  const native = (globalThis as any).expo.modules.AppIcon;
  await setProfile({ dev: true });
  await bootApp('/profile');
  const row = await screen.findByText('App icon', {}, { timeout: 10000 });
  const n = (text: string) => screen.queryAllByText(text).length; // Dark and Cards are also the theme's and the Cards row's
  const dark = n('Dark'), cards = n('Cards');
  expect(screen.getByText('Pic dump')).toBeTruthy();
  await fireEvent.press(row);
  await settle();
  expect(native.set).toHaveBeenLastCalledWith('dark');
  expect(n('Dark')).toBe(dark + 1);
  await fireEvent.press(row);
  await settle();
  expect(native.set).toHaveBeenLastCalledWith('cards');
  expect(n('Cards')).toBe(cards + 1);
  expect(n('Dark')).toBe(dark);
}, 30000);
