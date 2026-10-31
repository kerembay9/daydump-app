import { redirectSystemPath } from '../src/app/+native-intent';

const go = (path: string | null) => redirectSystemPath({ path, initial: true });

describe('redirectSystemPath', () => {
  const dev = (global as { __DEV__?: boolean }).__DEV__;
  afterEach(() => { (global as { __DEV__?: boolean }).__DEV__ = dev; });

  test('shared images (content:// and file://) go to Create', () => {
    expect(go('content://media/external/images/1')).toBe('/create');
    expect(go('file:///sdcard/a.jpg')).toBe('/create');
  });

  test('ordinary routes pass through', () => {
    expect(go('/profile')).toBe('/profile');
    expect(go(null)).toBeNull();
  });

  test('experiment screens are only reachable in debug builds', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    for (const p of ['/selfie', '/people', '/today-tags', '/people?x=1']) expect(go(p)).toBe('/');
    expect(go('/selfiefoo')).toBe('/selfiefoo');
    (global as { __DEV__?: boolean }).__DEV__ = true;
    expect(go('/selfie')).toBe('/selfie');
  });
});
