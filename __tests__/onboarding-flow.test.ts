import en from '../src/i18n/locales/en.json';
import { FITS, FREQS, LASTS, LAYOUTS, LOOKS, MATTES, PAINS, POSTS, TOPICS, VOICES } from '../src/services/onboardingFlow';
import { dateSpan, hasBack, hourOf, inProgress, isStep, librarySize, nextStep, progressOf, setAnswer, START, STEPS, toggleAnswer } from '../src/services/onboardingFlow';

const walk = (access: 'full' | 'limited' | 'denied', caps: { index?: boolean; tidy?: boolean } = {}) => {
  const seen = ['1'];
  while (seen[seen.length - 1] !== '30') seen.push(nextStep(seen[seen.length - 1], access, caps));
  return seen;
};

test('full access with an on-device index walks all 30 screens', () => {
  expect(walk('full')).toEqual(['1', '2', '3', '4', '5', ...Array.from({ length: 25 }, (_, i) => String(i + 6))]);
});

test('4 goes to the library count when everything was shared, 4b when limited, and stays when denied', () => {
  expect(nextStep('4', 'full')).toBe('5');
  expect(nextStep('4', 'limited')).toBe('4b');
  expect(nextStep('4', 'denied')).toBe('4');
});

test('limited access counts the photos shared, then skips the screens that read the library', () => {
  const w = walk('limited');
  expect(w.slice(0, 7)).toEqual(['1', '2', '3', '4', '4b', '5', '6']);
  for (const s of ['12', '20', '21', '22', '23']) expect(w).not.toContain(s);
  expect(w).toContain('24');
});

test('no access never gets past 4: the app needs photos', () => {
  expect(nextStep('4', 'denied')).toBe('4');
});

test('no Tidy (Android 10 and older) hides clutter but keeps search', () => {
  const w = walk('full', { tidy: false });
  expect(w).not.toContain('22');
  expect(w).toContain('23');
});

test('no on-device index (iOS today) hides clutter and search but keeps the first dump', () => {
  const w = walk('full', { index: false });
  expect(w).toContain('21');
  expect(w).not.toContain('22');
  expect(w).not.toContain('23');
});

test('an edit from the recap goes back to it, only for the style screens', () => {
  for (const s of ['13', '14', '15', '16', '17']) expect(nextStep(s, 'full', { editing: true })).toBe('19');
  expect(nextStep('18', 'full', { editing: true })).toBe('19'); // 18 leads to 19 anyway
  expect(nextStep('13', 'full')).toBe('14');
});

test('back: none on 1, 4b, 5, the paywall and done; 6 has none without full access', () => {
  expect(STEPS.filter((s) => !hasBack(s))).toEqual(['1', '4b', '5', '29', '30']);
  expect(hasBack('6', 'full')).toBe(true);
  expect(hasBack('6', 'limited')).toBe(false);
  expect(hasBack('6', 'denied')).toBe(false);
});

test('route params are checked before use', () => {
  expect(isStep('4b')).toBe(true);
  expect(isStep('30')).toBe(true);
  expect(isStep('31')).toBe(false);
  expect(isStep(undefined)).toBe(false);
});

test('the progress bar runs on 6-27 only', () => {
  expect(['5', '6', '27', '28'].map(inProgress)).toEqual([false, true, true, false]);
  expect(progressOf('5')).toBe(0);
  expect(progressOf('6')).toBeCloseTo(1 / 22);
  expect(progressOf('27')).toBe(1);
  expect(progressOf('29')).toBe(1);
});

test('where they post sets the shape until it is picked by hand', () => {
  let a = setAnswer(START, 'post', 'ig-stories');
  expect(a.ratio).toBe('9:16');
  a = setAnswer(a, 'ratio', '1:1');
  expect(a.ratioTouched).toBe(true);
  a = setAnswer(a, 'post', 'ig-feed');
  expect(a.ratio).toBe('1:1');
});

test('topics: Everything clears the rest and any other pick clears Everything', () => {
  expect(toggleAnswer(['trips', 'food'], 'all')).toEqual(['all']);
  expect(toggleAnswer(['all'], 'pets')).toEqual(['pets']);
  expect(toggleAnswer(['all'], 'all')).toEqual([]);
  expect(toggleAnswer(['trips'], 'trips')).toEqual([]);
});

test('library size follows the design breakpoints', () => {
  expect(librarySize(3963, 'full')).toBe('large');
  expect(librarySize(1000, 'full')).toBe('large');
  expect(librarySize(640, 'full')).toBe('mid');
  expect(librarySize(50, 'full')).toBe('mid');
  expect(librarySize(32, 'full')).toBe('small');
  expect(librarySize(3963, 'limited')).toBe('limited');
});

test('date span collapses what repeats', () => {
  const d = (y: number, m: number) => new Date(y, m, 15).getTime();
  expect(dateSpan(d(2019, 2), d(2026, 9), 'en-US')).toBe('Mar 2019 – Oct 2026');
  expect(dateSpan(d(2026, 7), d(2026, 9), 'en-US')).toBe('Aug – Oct 2026');
  expect(dateSpan(d(2026, 9), d(2026, 9), 'en-US')).toBe('Oct 2026');
  expect(dateSpan(d(2026, 9), d(2019, 2), 'en-US')).toBe('Mar 2019 – Oct 2026');
});

test('recap time pills read as 24h hours', () => {
  expect(['7 PM', '8 PM', '9 PM', '10 PM'].map(hourOf)).toEqual([19, 20, 21, 22]);
});

test('every option the screens look up by id has its English text', () => {
  const opt = (en as any).onboarding.flow.opt;
  const need: [string, readonly string[]][] = [['post', POSTS], ['freq', FREQS], ['topics', TOPICS], ['last', LASTS], ['pains', PAINS], ['layout', LAYOUTS], ['look', LOOKS], ['fit', FITS], ['matte', MATTES], ['voice', VOICES]];
  for (const [group, ids] of need) for (const id of ids) expect({ group, id, text: opt[group][id] }).toEqual({ group, id, text: expect.any(String) });
  for (const id of POSTS) expect(opt.post[`${id}Sub`]).toEqual(expect.any(String));
  for (const k of ['finding', 'grouping', 'spotting']) expect((en as any).onboarding.flow.finding[k]).toEqual(expect.any(String));
  for (const k of ['one', 'other']) { expect((en as any).onboarding.flow.found.title[k]).toEqual(expect.any(String)); expect((en as any).onboarding.flow.paywall.titleFound[k]).toEqual(expect.any(String)); }
});
