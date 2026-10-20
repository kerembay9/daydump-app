import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/** DayDump Pro as Profile shows it. renews false = cancelled: Pro until `until`, then it ends. */
export type Sub = { plan: 'Monthly' | 'Yearly'; until: number; renews: boolean };

const FAKE = '@daydump_fake_sub';
const DAY = 86_400_000;

/**
 * Not wired to the store yet (PAYWALLS_ENABLED = false): null, or a fake one from developer tools in dev builds.
 * ponytail: read RevenueCat customerInfo.entitlements.active.daydump_pro (expirationDate, willRenew, productIdentifier) when Pro ships.
 */
export async function getSubscription(): Promise<Sub | null> {
  if (!__DEV__) return null;
  try { return JSON.parse((await AsyncStorage.getItem(FAKE)) ?? 'null'); } catch { return null; }
}

/** Developer tools (dev builds): none → yearly, renewing → monthly, cancelled → none. */
export async function cycleFakeSubscription(cur: Sub | null): Promise<Sub | null> {
  const next: Sub | null = !cur ? { plan: 'Yearly', until: Date.now() + 200 * DAY, renews: true }
    : cur.renews ? { plan: 'Monthly', until: Date.now() + 12 * DAY, renews: false } : null;
  await (next ? AsyncStorage.setItem(FAKE, JSON.stringify(next)) : AsyncStorage.removeItem(FAKE));
  return next;
}

/** The store's own subscriptions page (cancel, change plan, payment method). */
export const MANAGE_URL = Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions'
  : 'https://play.google.com/store/account/subscriptions?package=com.daydump.app';
