import type { PurchasesPackage } from './revenuecat';

/** One plan on the paywall, all from the store offering: prices and trials change in Play Console / RevenueCat, not here. */
export type PlanRow = { pkg: PurchasesPackage; id: string; title: string; price: string; trial: string | null };

const TITLE: Record<string, string> = { WEEKLY: 'Weekly', MONTHLY: 'Monthly', TWO_MONTH: '2 months', THREE_MONTH: '3 months', SIX_MONTH: '6 months', ANNUAL: 'Annual', LIFETIME: 'Lifetime' };
const PER: Record<string, string> = { WEEKLY: '/ week', MONTHLY: '/ month', TWO_MONTH: '/ 2 months', THREE_MONTH: '/ 3 months', SIX_MONTH: '/ 6 months', ANNUAL: '/ year', LIFETIME: 'once' };
const UNIT: Record<string, string> = { D: 'day', W: 'week', M: 'month', Y: 'year', DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' };

const trial = (n: number, unit: string | undefined) => (!unit ? null : unit === 'week' ? `${n * 7}-day free trial` : `${n}-${unit} free trial`);

/** "7-day free trial" from Play's free phase (P1W) or the App Store's free intro price; null = no trial. */
export function trialText(p: PurchasesPackage): string | null {
  const iso = p.product.defaultOption?.freePhase?.billingPeriod?.iso8601;
  const m = iso ? /^P(\d+)([DWMY])$/.exec(iso) : null;
  if (m) return trial(+m[1], UNIT[m[2]]);
  const intro = p.product.introPrice;
  if (intro && intro.price === 0) return trial(intro.periodNumberOfUnits, UNIT[intro.periodUnit]);
  return null;
}

export const paywallPlans = (pkgs: PurchasesPackage[]): PlanRow[] => pkgs.map((p) => ({
  pkg: p,
  id: p.identifier,
  title: TITLE[p.packageType] ?? p.product.title,
  price: `${p.product.priceString} ${PER[p.packageType] ?? ''}`.trim(),
  trial: trialText(p),
}));
