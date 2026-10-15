import { Platform } from 'react-native';
import Purchases, { PurchasesPackage, CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SubscriptionPlanId, UserSubscriptionState } from '../types';
import { MAX_FREE_DAILY_DUMPS } from '../constants/plans';

const STORAGE_KEYS = {
  DAILY_DUMPS_COUNT: '@daydump_daily_dumps_count',
  LAST_DUMP_DATE: '@daydump_last_dump_date',
  SIMULATED_PRO: '@daydump_simulated_pro',
  API_KEY: '@daydump_revenuecat_api_key',
};

// Default RevenueCat Keys (configured dynamically or via dashboard)
const DEFAULT_RC_KEYS = {
  apple: 'appl_YOUR_REVENUECAT_APPLE_KEY',
  google: 'goog_YOUR_REVENUECAT_GOOGLE_KEY',
};

/**
 * Resilient package identifiers matching App Store and Google Play variations
 */
export function isYearlySubscriptionPackage(pkg: any): boolean {
  const rcId = String(pkg?.identifier ?? '').toLowerCase();
  const storeId = String(pkg?.product?.identifier ?? '').toLowerCase();
  return (
    rcId.includes('annual') ||
    rcId.includes('yearly') ||
    rcId.includes('year') ||
    storeId.includes('annual') ||
    storeId.includes('yearly') ||
    storeId.includes('year')
  );
}

export function isWeeklySubscriptionPackage(pkg: any): boolean {
  const rcId = String(pkg?.identifier ?? '').toLowerCase();
  const storeId = String(pkg?.product?.identifier ?? '').toLowerCase();
  return rcId.includes('week') || storeId.includes('week');
}

export function isLifetimePackage(pkg: any): boolean {
  const rcId = String(pkg?.identifier ?? '').toLowerCase();
  const storeId = String(pkg?.product?.identifier ?? '').toLowerCase();
  return rcId.includes('life') || storeId.includes('life');
}

export class RevenueCatService {
  private static isInitialized = false;

  static async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const customKey = await AsyncStorage.getItem(STORAGE_KEYS.API_KEY);
      const apiKey = customKey || (Platform.OS === 'ios' ? DEFAULT_RC_KEYS.apple : DEFAULT_RC_KEYS.google);

      // Only configure if not using placeholder
      if (apiKey && !apiKey.includes('YOUR_REVENUECAT')) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        await Purchases.configure({ apiKey });
        this.isInitialized = true;
        console.log('[RevenueCat] Initialized successfully');
      } else {
        console.log('[RevenueCat] Placeholder API key detected; running in mock/dev mode');
      }
    } catch (error) {
      console.warn('[RevenueCat] Init error (running in mock mode):', error);
    }
  }

  static async setCustomApiKey(key: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.API_KEY, key);
    this.isInitialized = false;
    await this.init();
  }

  static async getCustomApiKey(): Promise<string | null> {
    return await AsyncStorage.getItem(STORAGE_KEYS.API_KEY);
  }

  static async getUserSubscriptionState(): Promise<UserSubscriptionState> {
    // 1. Check daily dumps usage
    const todayStr = new Date().toISOString().split('T')[0];
    const lastDate = await AsyncStorage.getItem(STORAGE_KEYS.LAST_DUMP_DATE);
    let dumpsUsed = 0;

    if (lastDate === todayStr) {
      const count = await AsyncStorage.getItem(STORAGE_KEYS.DAILY_DUMPS_COUNT);
      dumpsUsed = count ? parseInt(count, 10) : 0;
    } else {
      // New day, reset count
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_DUMP_DATE, todayStr);
      await AsyncStorage.setItem(STORAGE_KEYS.DAILY_DUMPS_COUNT, '0');
    }

    // 2. Check RevenueCat active entitlements
    if (this.isInitialized) {
      try {
        const customerInfo: CustomerInfo = await Purchases.getCustomerInfo();
        const isPro = !!(
          customerInfo.entitlements.active['pro_access'] ||
          customerInfo.entitlements.active['pro'] ||
          customerInfo.entitlements.active['creator_pass'] ||
          customerInfo.entitlements.active['daydump_pro']
        );

        let activePlan: SubscriptionPlanId | undefined;
        if (isPro) {
          const proEntitlement =
            customerInfo.entitlements.active['pro_access'] ||
            customerInfo.entitlements.active['pro'] ||
            customerInfo.entitlements.active['creator_pass'] ||
            customerInfo.entitlements.active['daydump_pro'];

          const identifier = proEntitlement?.productIdentifier?.toLowerCase() || '';
          if (identifier.includes('week')) activePlan = 'weekly';
          else if (identifier.includes('year') || identifier.includes('annual')) activePlan = 'annual';
          else if (identifier.includes('life')) activePlan = 'lifetime';
        }

        return {
          isPro,
          activePlan,
          expirationDate: isPro ? 'Active' : null,
          dailyDumpsUsedToday: dumpsUsed,
          maxFreeDailyDumps: MAX_FREE_DAILY_DUMPS,
        };
      } catch (err) {
        console.warn('[RevenueCat] Failed to fetch customer info:', err);
      }
    }

    // 3. Fallback to simulated local Pro (for local development & demoing)
    const simulatedPro = await AsyncStorage.getItem(STORAGE_KEYS.SIMULATED_PRO);
    const isPro = simulatedPro === 'true';

    return {
      isPro,
      activePlan: isPro ? 'weekly' : undefined,
      expirationDate: isPro ? 'Active (Test Mode)' : null,
      dailyDumpsUsedToday: dumpsUsed,
      maxFreeDailyDumps: MAX_FREE_DAILY_DUMPS,
    };
  }

  static async recordDumpGenerated(): Promise<number> {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastDate = await AsyncStorage.getItem(STORAGE_KEYS.LAST_DUMP_DATE);
    let count = 0;

    if (lastDate === todayStr) {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.DAILY_DUMPS_COUNT);
      count = (stored ? parseInt(stored, 10) : 0) + 1;
    } else {
      count = 1;
    }

    await AsyncStorage.setItem(STORAGE_KEYS.LAST_DUMP_DATE, todayStr);
    await AsyncStorage.setItem(STORAGE_KEYS.DAILY_DUMPS_COUNT, count.toString());
    return count;
  }

  static async setSimulatedPro(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.SIMULATED_PRO, enabled ? 'true' : 'false');
  }

  static async purchasePlan(planId: SubscriptionPlanId): Promise<{ success: boolean; error?: string }> {
    if (!this.isInitialized) {
      // In dev/mock mode, simulate instant successful purchase
      await this.setSimulatedPro(true);
      return { success: true };
    }

    try {
      const offerings = await Purchases.getOfferings();
      if (!offerings.current) {
        // Fallback to simulation if offerings aren't configured yet in RevenueCat dashboard
        await this.setSimulatedPro(true);
        return { success: true };
      }

      let selectedPackage: PurchasesPackage | undefined;
      const availablePackages = offerings.current.availablePackages;

      if (planId === 'weekly') {
        selectedPackage = availablePackages.find(
          (p) => p.packageType === 'WEEKLY' || isWeeklySubscriptionPackage(p)
        );
      } else if (planId === 'annual') {
        selectedPackage = availablePackages.find(
          (p) => p.packageType === 'ANNUAL' || isYearlySubscriptionPackage(p)
        );
      } else if (planId === 'lifetime') {
        selectedPackage = availablePackages.find(
          (p) => p.packageType === 'LIFETIME' || isLifetimePackage(p)
        );
      }

      if (!selectedPackage && availablePackages.length > 0) {
        selectedPackage = availablePackages[0];
      }

      if (selectedPackage) {
        const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
        const isPro = !!(
          customerInfo.entitlements.active['pro_access'] ||
          customerInfo.entitlements.active['pro'] ||
          customerInfo.entitlements.active['creator_pass']
        );
        return { success: isPro };
      } else {
        await this.setSimulatedPro(true);
        return { success: true };
      }
    } catch (err: any) {
      if (err.userCancelled) {
        return { success: false, error: 'User cancelled' };
      }
      console.warn('[RevenueCat] Purchase failed:', err);
      return { success: false, error: err.message || 'Purchase could not be completed' };
    }
  }

  static async restorePurchases(): Promise<{ success: boolean; isPro: boolean; error?: string }> {
    if (!this.isInitialized) {
      const simulated = await AsyncStorage.getItem(STORAGE_KEYS.SIMULATED_PRO);
      return { success: true, isPro: simulated === 'true' };
    }

    try {
      const customerInfo = await Purchases.restorePurchases();
      const isPro = !!(
        customerInfo.entitlements.active['pro_access'] ||
        customerInfo.entitlements.active['pro'] ||
        customerInfo.entitlements.active['creator_pass']
      );
      return { success: true, isPro };
    } catch (err: any) {
      return { success: false, isPro: false, error: err.message };
    }
  }
}
