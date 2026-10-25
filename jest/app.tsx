// Boots the real app (src/app routes, root layout, AppState) on the fake phone from jest/world.ts.
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderRouter, screen } from 'expo-router/testing-library';

export async function bootApp(initialUrl = '/') {
  await AsyncStorage.setItem('@daydump_has_completed_onboarding', 'true');
  // renderRouter switches to fake timers (waitFor/findBy advance them) and, with RNTL 14, returns a promise that also
  // carries the router getters.
  const r = renderRouter(path.resolve(__dirname, '../src/app'), { initialUrl });
  const res = await r;
  return Object.assign(res, { getPathname: r.getPathname, getSearchParams: r.getSearchParams });
}

/** Every text and accessibility label on screen, in order (for debugging a failing scenario). */
export function dump(node: unknown = screen.toJSON()): string[] {
  if (node == null) return [];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap((n) => dump(n));
  const n = node as { props?: { accessibilityLabel?: string }; children?: unknown[] };
  return [...(n.props?.accessibilityLabel ? [`[${n.props.accessibilityLabel}]`] : []), ...dump(n.children ?? [])];
}

/** Lets pending saves, debounces and timers run (fake timers: renderRouter installs them). */
export async function settle(ms = 1000) {
  await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
}
