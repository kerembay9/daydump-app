import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { RevenueCatService } from '../services/revenuecat';
import { UserSubscriptionState } from '../types';

interface PremiumContextValue {
  subscription: UserSubscriptionState;
  isPro: boolean;
  loading: boolean;
  refreshSubscription: () => Promise<UserSubscriptionState>;
  setSimulatedPro: (enabled: boolean) => Promise<void>;
}

const PremiumStatusContext = createContext<PremiumContextValue | null>(null);

export const PremiumStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [subscription, setSubscription] = useState<UserSubscriptionState>({
    isPro: false,
    dailyDumpsUsedToday: 0,
    maxFreeDailyDumps: 1,
  });
  const [loading, setLoading] = useState(true);

  const refreshSubscription = useCallback(async (): Promise<UserSubscriptionState> => {
    try {
      const state = await RevenueCatService.getUserSubscriptionState();
      setSubscription(state);
      return state;
    } catch (e) {
      console.warn('Error refreshing subscription:', e);
      return subscription;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSetSimulatedPro = async (enabled: boolean) => {
    await RevenueCatService.setSimulatedPro(enabled);
    await refreshSubscription();
  };

  useEffect(() => {
    const init = async () => {
      await RevenueCatService.init();
      await refreshSubscription();

      // Listen for background updates from RevenueCat (e.g. trial expire, restore, auto-renewal)
      let removeListener: (() => void) | null = null;
      if (Platform.OS !== 'web') {
        try {
          Purchases.addCustomerInfoUpdateListener(() => {
            void refreshSubscription();
          });
        } catch (e) {
          // RevenueCat listener optional in mock dev mode
        }
      }
    };

    void init();
  }, [refreshSubscription]);

  const value = useMemo(
    () => ({
      subscription,
      isPro: subscription.isPro,
      loading,
      refreshSubscription,
      setSimulatedPro: handleSetSimulatedPro,
    }),
    [subscription, loading, refreshSubscription]
  );

  return (
    <PremiumStatusContext.Provider value={value}>
      {children}
    </PremiumStatusContext.Provider>
  );
};

export function usePremiumStatus(): PremiumContextValue {
  const ctx = useContext(PremiumStatusContext);
  if (!ctx) {
    throw new Error('usePremiumStatus must be used within a PremiumStatusProvider');
  }
  return ctx;
}
