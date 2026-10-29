import { Platform } from 'react-native';
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  PurchasesOfferings,
} from 'react-native-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type { PurchasesPackage, CustomerInfo, PurchasesOfferings };

const STORAGE_KEYS = {
  API_KEY: '@daydump_revenuecat_api_key',
};

/**
 * RevenueCat Configuration Constants
 */
export const REVENUECAT_CONFIG = {
  // Official project API keys
  API_KEYS: {
    APPLE: 'appl_kYyUYfKiGKmKrTPIQExVIKKVHyQ',
    GOOGLE: 'goog_FhTcNYytRCliZcHsDRHiRuEZfUU',
  },
  // In production and dev on Android, use Google Play key; on iOS use Apple key.
  API_KEY: Platform.OS === 'ios'
    ? 'appl_kYyUYfKiGKmKrTPIQExVIKKVHyQ'
    : 'goog_FhTcNYytRCliZcHsDRHiRuEZfUU',
  // Primary Pro Entitlement Identifier
  ENTITLEMENT_ID: 'daydump_pro',
};

type CustomerInfoCallback = (customerInfo: CustomerInfo, isPro: boolean) => void;

export class RevenueCatService {
  private static isConfigured = false;
  private static listeners: CustomerInfoCallback[] = [];
  /** the init in flight: every caller on a cold start (Pro, the paywall) waits for one configure and one listener */
  private static initing: Promise<void> | null = null;

  /**
   * 1. Initialize and configure the RevenueCat SDK
   */
  static init(): Promise<void> {
    if (this.isConfigured) return Promise.resolve();
    // a failed init clears itself, so the next call tries again
    this.initing ??= this.configure().finally(() => { this.initing = null; });
    return this.initing;
  }

  private static async configure(): Promise<void> {
    try {
      // Use custom key if overridden in developer tools, otherwise use configured API key
      // the key override is for debug builds only: in a release build a stored key would point the SDK at another project
      const customKey = __DEV__ ? await AsyncStorage.getItem(STORAGE_KEYS.API_KEY) : null;
      const apiKey = customKey?.trim() || REVENUECAT_CONFIG.API_KEY;

      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);

      await Purchases.configure({
        apiKey,
      });

      this.isConfigured = true;
      console.log('[RevenueCat] Configured successfully with API key:', apiKey.slice(0, 8) + '...');

      // Listen for real-time customer info changes (renewals, cancellations, family sharing)
      Purchases.addCustomerInfoUpdateListener((customerInfo) => {
        const isPro = this.isEntitledToPro(customerInfo);
        console.log('[RevenueCat] Customer info updated. Pro status:', isPro);
        this.listeners.forEach((callback) => callback(customerInfo, isPro));
      });
    } catch (error) {
      console.warn('[RevenueCat] Initialization error:', error);
    }
  }

  /**
   * Subscribe to real-time subscription changes
   */
  static addCustomerInfoListener(callback: CustomerInfoCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Check if customer holds the active 'daydump_pro' entitlement
   */
  static isEntitledToPro(customerInfo: CustomerInfo | null | undefined): boolean {
    if (!customerInfo || !customerInfo.entitlements || !customerInfo.entitlements.active) {
      return false;
    }

    // Primary check for requested 'daydump_pro' or 'picdump_pro' entitlement
    if (
      customerInfo.entitlements.active[REVENUECAT_CONFIG.ENTITLEMENT_ID] !== undefined ||
      customerInfo.entitlements.active['picdump_pro'] !== undefined
    ) {
      return true;
    }

    // Resilient fallbacks for test environments and legacy aliases
    return !!(
      customerInfo.entitlements.active['pro_access'] ||
      customerInfo.entitlements.active['pro'] ||
      customerInfo.entitlements.active['creator_pass']
    );
  }

  /**
   * 2. Retrieve latest Customer Info
   */
  static async getCustomerInfo(): Promise<CustomerInfo | null> {
    if (!this.isConfigured) await this.init();

    try {
      return await Purchases.getCustomerInfo();
    } catch (err) {
      console.warn('[RevenueCat] Failed to fetch customer info:', err);
      return null;
    }
  }

  /**
   * 3. Fetch active offerings and products
   */
  static async getOfferings(): Promise<PurchasesOfferings | null> {
    if (!this.isConfigured) await this.init();

    try {
      const offerings = await Purchases.getOfferings();
      if (!offerings.current) {
        console.log('[RevenueCat] No current offering configured in RevenueCat dashboard.');
      }
      return offerings;
    } catch (err) {
      console.warn('[RevenueCat] Failed to fetch offerings:', err);
      return null;
    }
  }

  /**
   * 5b. Purchase a specific RevenueCat package directly
   */
  static async purchasePackage(
    targetPackage: PurchasesPackage
  ): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
    if (!this.isConfigured) await this.init();

    try {
      const { customerInfo } = await Purchases.purchasePackage(targetPackage);
      const isPro = this.isEntitledToPro(customerInfo);
      return { success: isPro, customerInfo };
    } catch (err: any) {
      if (err.userCancelled || err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        return { success: false, error: 'User cancelled' };
      }
      console.warn('[RevenueCat] Purchase package failed:', err);
      return { success: false, error: err.message || 'Purchase could not be completed' };
    }
  }

  /**
   * 6. Restore previously completed purchases
   */
  static async restorePurchases(): Promise<{ success: boolean; isPro: boolean; error?: string }> {
    if (!this.isConfigured) await this.init();

    try {
      const customerInfo = await Purchases.restorePurchases();
      const isPro = this.isEntitledToPro(customerInfo);
      return { success: true, isPro };
    } catch (err: any) {
      console.warn('[RevenueCat] Restore error:', err);
      return { success: false, isPro: false, error: err.message || 'Could not restore purchases' };
    }
  }

  /** Which paywall the user saw last (first-discover, locked-dump, search…), as a subscriber attribute: no photo data. */
  static async setPaywallSource(source: string): Promise<void> {
    if (!this.isConfigured) await this.init();
    try {
      await Purchases.setAttributes({ paywall_source: source });
    } catch (err) {
      console.warn('[RevenueCat] setAttributes failed:', err);
    }
  }

  static async setCustomApiKey(key: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.API_KEY, key);
    this.isConfigured = false;
    await this.init();
  }

  static async getCustomApiKey(): Promise<string | null> {
    return await AsyncStorage.getItem(STORAGE_KEYS.API_KEY);
  }
}
