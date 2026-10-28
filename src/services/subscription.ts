import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { type CustomerInfo, RevenueCatService, REVENUECAT_CONFIG } from './revenuecat';

/** PicDump Pro as Profile shows it. renews false = cancelled: Pro until `until`, then it ends. */
export type Sub = { plan: 'Weekly' | 'Monthly' | 'Yearly'; until: number; renews: boolean };

const FAKE = '@daydump_fake_sub';
const DAY = 86_400_000;

/**
 * PicDump Pro as RevenueCat says, or the dev fake sub in dev builds. null = no entitlement (free); undefined = couldn't
 * tell (RevenueCat unreachable or failing, with no cached customer info): callers keep what they last knew.
 */
export async function getSubscription(): Promise<Sub | null | undefined> {
  let rc: Sub | null | undefined;
  try {
    // null here is an error the service already logged
    const info = await RevenueCatService.getCustomerInfo();
    rc = info ? subOf(info) : undefined;
  } catch (e) {
    console.warn('[subscription] Failed to fetch customer info:', e);
  }
  if (rc) return rc;
  if (__DEV__) {
    try {
      const fake: Sub | null = JSON.parse((await AsyncStorage.getItem(FAKE)) ?? 'null');
      if (fake) return fake;
    } catch { /* no fake sub */ }
  }
  return rc;
}

function subOf(info: CustomerInfo): Sub | null {
  if (!RevenueCatService.isEntitledToPro(info)) return null;
  const activeEnt =
    info.entitlements.active[REVENUECAT_CONFIG.ENTITLEMENT_ID] ??
    info.entitlements.active['picdump_pro'] ??
    Object.values(info.entitlements.active)[0];
  if (!activeEnt) return null;
  const prodId = (activeEnt.productIdentifier || '').toLowerCase();
  const plan: Sub['plan'] = prodId.includes('week') ? 'Weekly' : prodId.includes('month') ? 'Monthly' : 'Yearly';
  const until = activeEnt.expirationDateMillis ?? (Date.now() + 30 * DAY);
  const renews = activeEnt.willRenew ?? true;
  return { plan, until, renews };
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
  : 'https://play.google.com/store/account/subscriptions?package=com.horizonzeta.picdump';
