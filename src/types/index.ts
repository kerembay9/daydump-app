export interface PhotoAsset {
  id: string;
  uri: string;
  filename?: string;
  creationTime: number; // timestamp in ms
  width: number;
  height: number;
  mediaType: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export type SubscriptionPlanId = 'weekly' | 'yearly' | 'annual' | 'lifetime';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  title: string;
  priceString: string;
  billingPeriod: string;
  badge?: string;
  trialDays?: number;
  popular?: boolean;
}

export interface UserSubscriptionState {
  isPro: boolean;
  activePlan?: SubscriptionPlanId;
  expirationDate?: string | null;
  dailyDumpsUsedToday: number;
  maxFreeDailyDumps: number;
}
