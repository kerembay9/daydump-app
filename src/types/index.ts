export type FrameStyle = 'clean' | 'film35mm' | 'editorial' | 'polaroid';

export type CaptionTone = 'minimal' | 'witty' | 'story';

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
  base64?: string; // cached thumbnail base64 for Gemini Nano / VLM
  aestheticScore?: number;
}

export interface CarouselSlide {
  id: string;
  photo: PhotoAsset;
  role: 'Cover / The Hook' | 'Atmosphere / Setting' | 'Close-up Detail' | 'Candid / Person' | 'Movement / Action' | 'Outro / Memory';
  slideIndex: number;
  subtitle?: string;
}

export interface CuratedCarousel {
  id: string;
  themeTitle: string;
  themeDescription: string;
  vibeTag: string;
  slides: CarouselSlide[];
  captions: {
    minimal: string;
    witty: string;
    story: string;
  };
  suggestedTags: string[];
  suggestedAudioVibe: string;
  frameStyle: FrameStyle;
  createdAt: number;
  isCustomTheme: boolean;
}

export type SubscriptionPlanId = 'weekly' | 'annual' | 'lifetime';

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
