import fs from 'fs';
import path from 'path';
import { ToastAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, dump, settle } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
import { cashmere, espresso } from '../../src/theme/tokens';
import { getProfile, setProfile } from '../../src/services/profile';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///cache/picked.jpg' }] }) }));

const toasts = () => (ToastAndroid.show as jest.Mock).mock.calls.map((c) => c[0] as string);
const painted = (color: string) => JSON.stringify(screen.toJSON()).includes(`"backgroundColor":"${color}"`);
const PAYWALL = /crown|paywall|premium|upgrade|subscri|go pro|pro plan|unlock/i;

beforeAll(() => seedWorld());

test('theme override sticks', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  expect(screen.getByRole('button', { name: /^Cashmere/, selected: true })).toBeTruthy();
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

test('release build: no developer tools, even if unlocked before', async () => {
  const dev = __DEV__;
  (global as any).__DEV__ = false;
  try {
    await setProfile({ dev: true });
    await bootApp('/profile');
    await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
    for (let i = 0; i < 5; i++) await fireEvent.press(screen.getByText('Version'));
    expect(screen.queryByText('Developer tools')).toBeNull();
    expect(screen.queryByText(/more taps? for developer tools/)).toBeNull();
  } finally { (global as any).__DEV__ = dev; }
}, 30000);

test('Profile: no Connected accounts section', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  expect(screen.queryByText('Connected accounts')).toBeNull();
  expect(screen.queryByText('Connect Instagram')).toBeNull();
}, 30000);

test('Profile: stats show Total Photos and Library, no Discover count', async () => {
  await bootApp('/profile');
  await screen.findByText('Total Photos', {}, { timeout: 10000 });
  expect(screen.getByText('Library')).toBeTruthy();
  expect(screen.queryByText('Discover')).toBeNull();
}, 30000);

test('Profile: Go Pro opens paywall; no Done, no bio', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  expect(screen.getByText('PicDump Pro')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Go Pro' }));
  expect(await screen.findByText('Curate and export without limits.')).toBeTruthy();
  expect(screen.queryByText('Done')).toBeNull();
  expect(screen.queryByPlaceholderText('Add a short bio')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Close paywall'));
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

test('a new avatar shows only once its file is written, and Discover\'s header picks it up', async () => {
  // The header's image loaded the avatar while File.copy was still writing it: an empty file, and expo-image never retries.
  type Node = { props?: { source?: unknown }; children?: (Node | string)[] | null } | Node[] | string | null;
  const uris = (n: Node): string[] => !n || typeof n === 'string' ? [] : Array.isArray(n) ? n.flatMap(uris)
    : [...[n.props?.source].flat().map((x) => (x as { uri?: string } | undefined)?.uri ?? ''), ...uris(n.children ?? null)];
  const avatars = () => [...new Set(uris(screen.toJSON() as Node).filter((u) => u.includes('/doc/avatar-')))];
  await bootApp('/');
  await screen.findByText('Other dumps', {}, { timeout: 10000 });
  await fireEvent.press(screen.getByLabelText('Profile and settings'));
  await fireEvent.press(await screen.findByLabelText('Change profile photo'));
  world.files.held = [];
  await fireEvent.press(await screen.findByText('Choose from gallery'));
  await settle();
  expect(world.files.held).toHaveLength(1); // the copy is still running...
  expect(avatars()).toEqual([]); // ...so nothing shows the avatar yet

  await act(async () => { world.files.held!.forEach((write) => write()); world.files.held = null; });
  await settle();
  const [uri] = avatars();
  expect(world.files.written.has(uri)).toBe(true);
  expect((await getProfile()).avatar).toBe(uri);

  // back on Discover, the header shows it
  await fireEvent.press(screen.getByLabelText('Back'));
  await screen.findByText('Other dumps');
  expect(avatars()).toEqual([uri]);
}, 30000);

test('Include screenshots starts off and saves when switched on', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  expect((await getProfile()).screenshots).toBe(false);
  const row = () => screen.getByRole('switch', { name: /Include screenshots/ });
  expect(row().props.accessibilityState.checked).toBe(false);
  await fireEvent.press(row());
  await settle();
  expect(row().props.accessibilityState.checked).toBe(true);
  expect((await getProfile()).screenshots).toBe(true);
}, 30000);
