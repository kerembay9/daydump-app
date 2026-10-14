import { SubscriptionPlan } from '../types';

export const AGGRESSIVE_CREATOR_PLANS: SubscriptionPlan[] = [
  {
    id: 'weekly',
    title: 'Weekly Access',
    priceString: '$3.99 / week',
    billingPeriod: 'Renews weekly, cancel anytime',
    badge: '3-DAY FREE TRIAL',
    trialDays: 3,
    popular: true,
  },
  {
    id: 'annual',
    title: 'Annual Creator Pass',
    priceString: '$34.99 / year',
    billingPeriod: '$2.91/mo, billed annually',
    badge: 'SAVE 83%',
    popular: false,
  },
  {
    id: 'lifetime',
    title: 'Lifetime Pass',
    priceString: '$59.99',
    billingPeriod: 'Pay once, own forever',
    popular: false,
  },
];

export const PRO_FEATURES = [
  {
    title: 'Unlimited Custom Prompts',
    description: 'Ask for "6 pics from December", "My summer vacation", or any vibe.',
    icon: 'Sparkles',
  },
  {
    title: 'Aesthetic Frames & 35mm Grain',
    description: 'Unlock Vintage 35mm film borders, Kodak Portra & Editorial layouts.',
    icon: 'Frame',
  },
  {
    title: 'Multi-Tone AI Captions & Audio',
    description: 'Aesthetic, Witty, and Storytelling captions plus trending sound vibes.',
    icon: 'PenTool',
  },
  {
    title: '100% Watermark Free',
    description: 'Completely clean exports with no app branding on your posts.',
    icon: 'CheckCircle2',
  },
  {
    title: 'Unlimited Daily Dumps',
    description: 'Curate as many carousels as you want every single day.',
    icon: 'Zap',
  },
];

export const MAX_FREE_DAILY_DUMPS = 1;
