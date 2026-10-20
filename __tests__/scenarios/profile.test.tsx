import fs from 'fs';
import path from 'path';
import { ToastAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, within } from 'expo-router/testing-library';
import { bootApp, dump } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { cashmere, espresso } from '../../src/theme/tokens';
import { getProfile } from '../../src/services/profile';

const toasts = () => (ToastAndroid.show as jest.Mock).mock.calls.map((c) => c[0] as string);
const painted = (color: string) => JSON.stringify(screen.toJSON()).includes(`"backgroundColor":"${color}"`);
const PAYWALL = /crown|paywall|premium|upgrade|subscri|go pro|pro plan|unlock/i;

beforeAll(() => seedWorld());

test('theme override sticks', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  expect(screen.getByRole('button', { name: /^System/, selected: true })).toBeTruthy();
  expect(painted(cashmere.bgScreen)).toBe(true);

  await fireEvent.press(screen.getByRole('button', { name: /^Espresso/ }));
  expect(await screen.findByRole('button', { name: /^Espresso/, selected: true })).toBeTruthy();
  expect(painted(espresso.bgScreen)).toBe(true);
  expect(painted(cashmere.bgScreen)).toBe(false);
  expect(await AsyncStorage.getItem('daydump.themeMode')).toBe('dark');

  // next launch: still Espresso
  screen.unmount();
  await bootApp('/profile');
  expect(await screen.findByRole('button', { name: /^Espresso/, selected: true })).toBeTruthy();
  expect(painted(espresso.bgScreen)).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: /^Cashmere/ }));
  expect(await AsyncStorage.getItem('daydump.themeMode')).toBe('light');
}, 30000);

test('5 taps on Version unlock the developer tools', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  expect(screen.queryByText('Developer tools')).toBeNull();
  for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByText('Version'));
  expect(screen.getByText('2 more taps for developer tools')).toBeTruthy(); // countdown is the row's subtitle, not a toast
  await fireEvent.press(screen.getByText('Version'));
  expect(screen.getByText('1 more tap for developer tools')).toBeTruthy();
  expect(screen.queryByText('Developer tools')).toBeNull();
  expect(toasts()).toEqual([]);
  await fireEvent.press(screen.getByText('Version'));
  expect(await screen.findByText('Developer tools')).toBeTruthy();
  expect(screen.getByText('Stories debug')).toBeTruthy();
  expect(screen.queryByText(/more taps? for developer tools/)).toBeNull();
  expect((await getProfile()).dev).toBe(true);
}, 30000);

test('Connect rows say Soon', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  for (const name of ['Connect Instagram', 'Connect TikTok']) {
    const row = screen.getByText(name).parent!.parent!;
    expect(within(row).getByText('Soon')).toBeTruthy();
  }
}, 30000);

test('Profile: Go Pro says coming soon; no Done, no bio', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  expect(screen.getByText('DayDump Pro')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Go Pro' }));
  expect(toasts()).toContain('DayDump Pro is coming soon');
  expect(screen.queryByText('Done')).toBeNull();
  expect(screen.queryByPlaceholderText('Add a short bio')).toBeNull();
}, 30000);

test('a renewing subscription shows its renewal date and Manage', async () => {
  await AsyncStorage.setItem('@daydump_fake_sub', JSON.stringify({ plan: 'Yearly', until: Date.UTC(2027, 4, 12, 12), renews: true }));
  await bootApp('/profile');
  expect(await screen.findByText(/^Yearly · renews .*2027/, {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText('Manage')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Go Pro' })).toBeNull();
  await AsyncStorage.removeItem('@daydump_fake_sub');
}, 30000);

// Profile has the Pro card (above); everywhere else stays paywall-free
test('no paywall or crown anywhere', async () => {
  for (const url of ['/', '/create', '/library']) {
    await bootApp(url);
    await screen.findAllByLabelText('Profile and settings', {}, { timeout: 10000 }).catch(() => screen.findByText('Profile & Settings'));
    expect(dump().filter((s) => PAYWALL.test(s))).toEqual([]);
    screen.unmount();
  }
  // and no route or component draws one (comments saying there is none are fine)
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : []));
  for (const f of files(path.resolve(__dirname, '../../src'))) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect([f, /\bCrown\b|react-native-purchases|presentPaywall/.test(code)]).toEqual([f, false]);
  }
}, 30000);
