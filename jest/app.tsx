// Boots the real app (src/app routes, root layout, AppState) on the fake phone from jest/world.ts.
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

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

/** The stack keeps earlier screens mounted, so a button every step shares ("Continue") is pressed on the newest one. */
export async function pressLast(text: string) {
  const all = await screen.findAllByText(text, {}, { timeout: 10000 });
  await fireEvent.press(all[all.length - 1]);
}

/** First run through the hook screens (1-3); returns screen 4's photo-access button. */
export async function firstRunToAsk() {
  await renderRouter(path.resolve(__dirname, '../src/app'), { initialUrl: '/' });
  await pressLast('Get started');
  await pressLast('Continue');
  await pressLast('Continue');
  return screen.findByText('Allow photos and continue');
}

/** After a grant: screen 5 (library count) on to the recap ask. */
export const pastLibrary = () => pressLast('Continue');

/** Jumps to an onboarding screen by its route (the flow's answers and photo access stay): tests of one screen skip the 20 before it. */
export async function goToStep(step: string) {
  await act(async () => { router.push(`/onboarding/${step}` as never); });
}
