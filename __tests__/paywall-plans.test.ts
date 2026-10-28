import { paywallPlans, trialText } from '../src/services/paywallPlans';

const pkg = (packageType: string, priceString: string, extra: object = {}) =>
  ({ identifier: `$rc_${packageType.toLowerCase()}`, packageType, product: { title: 'x', priceString, introPrice: null, defaultOption: null, ...extra } }) as never;

test('Play free phase reads as days', () => {
  expect(trialText(pkg('ANNUAL', '$29.99', { defaultOption: { freePhase: { billingPeriod: { iso8601: 'P1W' } } } }))).toBe('7-day free trial');
  expect(trialText(pkg('ANNUAL', '$29.99', { defaultOption: { freePhase: { billingPeriod: { iso8601: 'P3D' } } } }))).toBe('3-day free trial');
  expect(trialText(pkg('ANNUAL', '$29.99', { defaultOption: { freePhase: { billingPeriod: { iso8601: 'P1M' } } } }))).toBe('1-month free trial');
});

test('App Store intro price at 0 is a trial; a paid intro is not', () => {
  expect(trialText(pkg('ANNUAL', '$29.99', { introPrice: { price: 0, periodNumberOfUnits: 7, periodUnit: 'DAY' } }))).toBe('7-day free trial');
  expect(trialText(pkg('ANNUAL', '$29.99', { introPrice: { price: 0.99, periodNumberOfUnits: 1, periodUnit: 'WEEK' } }))).toBeNull();
});

test('rows keep the offering order and say the period', () => {
  const rows = paywallPlans([pkg('WEEKLY', '$3.99'), pkg('ANNUAL', '$29.99'), pkg('LIFETIME', '$49.99')]);
  expect(rows.map((r) => [r.title, r.price, r.trial])).toEqual([
    ['Weekly', '$3.99 / week', null],
    ['Annual', '$29.99 / year', null],
    ['Lifetime', '$49.99 once', null],
  ]);
});

test('multi-month plans say their period', () => {
  const rows = paywallPlans([pkg('TWO_MONTH', '$6.99'), pkg('THREE_MONTH', '$9.99'), pkg('SIX_MONTH', '$17.99')]);
  expect(rows.map((r) => [r.title, r.price])).toEqual([
    ['2 months', '$6.99 / 2 months'],
    ['3 months', '$9.99 / 3 months'],
    ['6 months', '$17.99 / 6 months'],
  ]);
});
