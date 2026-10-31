import fs from 'node:fs';
import path from 'node:path';
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { LANGUAGES } from '../src/i18n/languages';
import { translations } from '../src/i18n/translations';
import { getLocale, i18n, isRtl, setLocale, subscribeLocale, tr, useLocale, useTranslation } from '../src/i18n';
import { langName } from '../src/services/index/queryLang';
import { filterLabel, type Person } from '../src/services/people';
import en from '../src/i18n/locales/en.json';

const LOCALES = path.join(__dirname, '../src/i18n/locales');

const flat = (o: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !isPlural(v as Record<string, unknown>) ? flat(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));
// { one, other } objects are one key
const isPlural = (o: Record<string, unknown>) => Object.keys(o).length > 0 && Object.keys(o).every((k) => ['zero', 'one', 'two', 'few', 'many', 'other'].includes(k));

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

afterEach(() => { i18n.locale = 'en'; });

test('59 languages, one catalog file and one registry entry each, English first', () => {
  expect(LANGUAGES).toHaveLength(59);
  expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(59);
  const files = fs.readdirSync(LOCALES).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
  expect(files).toEqual(LANGUAGES.map((l) => l.code).sort());
  expect(Object.keys(translations).sort()).toEqual(files);
});

test('every other language only holds keys that exist in English', () => {
  const english = new Set(flat(en));
  for (const { code } of LANGUAGES) {
    if (code === 'en') continue;
    const stray = flat(translations[code] as Record<string, unknown>).filter((k) => !english.has(k));
    expect({ code, stray }).toEqual({ code, stray: [] });
  }
});

test('an empty language falls back to English', () => {
  i18n.translations.xx = {};
  i18n.locale = 'xx';
  expect(tr('tabs.discover')).toBe('Discover');
  expect(tr('onboarding.page', { n: 2, total: 4 })).toBe('Page 2 of 4');
  delete i18n.translations.xx;
});

test('plural keys follow the count', () => {
  expect(tr('paywall.found.heading', { count: 1 })).toBe('We found 1 dump in your roll.');
  expect(tr('paywall.found.heading', { count: 3 })).toBe('We found 3 dumps in your roll.');
});

test('Arabic, Persian, Hebrew and Urdu are right-to-left', () => {
  expect(['ar', 'fa', 'he', 'ur'].every((c) => isRtl(c))).toBe(true);
  expect(isRtl('en')).toBe(false);
});

test('every translation key used in the source exists in en.json', () => {
  const english = new Set(flat(en));
  const used = new Set<string>();
  for (const f of walk(path.join(__dirname, '../src')).filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('/i18n/'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\btr\(\s*'([A-Za-z0-9_.]+)'/g)) used.add(m[1]);
    // keys held in data (tab labels, slides, paywall copy) and passed to tr() later
    for (const m of src.matchAll(/'((?:common|tabs|onboarding|paywall|profile|discover|create|tidy|library|edit|preview|today|dialogs|models)\.[A-Za-z0-9_.]+)'/g)) used.add(m[1]);
  }
  expect(used.size).toBeGreaterThan(50);
  const missing = [...used].filter((k) => !english.has(k));
  expect(missing).toEqual([]);
});

test('setLocale updates locale, notifies subscribers, and getLocale returns active locale', () => {
  const listener = jest.fn();
  const unsubscribe = subscribeLocale(listener);

  expect(getLocale()).toBe('en');
  setLocale('es');
  expect(getLocale()).toBe('es');
  expect(i18n.locale).toBe('es');
  expect(listener).toHaveBeenCalledTimes(1);

  unsubscribe();
  setLocale('en');
  expect(listener).toHaveBeenCalledTimes(1);
});

test('useLocale hook reactively updates when locale changes', async () => {
  const { result } = await renderHook(() => useLocale());
  expect(result.current).toBe('en');

  await act(async () => {
    setLocale('tr');
  });

  expect(result.current).toBe('tr');
});

test('useTranslation hook provides reactive tr, t, locale, and isRtl', async () => {
  const { result } = await renderHook(() => useTranslation());

  expect(result.current.locale).toBe('en');
  expect(result.current.isRtl).toBe(false);
  expect(result.current('tabs.discover')).toBe('Discover');
  expect(result.current.tr('tabs.discover')).toBe('Discover');
  expect(result.current.t('tabs.discover')).toBe('Discover');

  await act(async () => {
    setLocale('ar');
  });

  expect(result.current.locale).toBe('ar');
  expect(result.current.isRtl).toBe(true);
});

test('isRtl supports defaults and language aliases', () => {
  setLocale('en');
  expect(isRtl()).toBe(false);

  setLocale('ar');
  expect(isRtl()).toBe(true);

  expect(isRtl('iw')).toBe(true); // Hebrew alias
  expect(isRtl('ar-EG')).toBe(true);
  expect(isRtl('en-US')).toBe(false);
});

test('langName resolves language names from LANGUAGES fallback across platforms', () => {
  expect(langName('es')).toBe('Spanish');
  expect(langName('ja')).toBe('Japanese');
  expect(langName('tr')).toBe('Turkish');
  expect(langName('unknown_code')).toBe('unknown_code');
});

test('AppState becoming active synchronizes deviceLanguage when different', () => {
  const handler = (AppState.addEventListener as jest.Mock).mock.calls.find((c) => c[0] === 'change')?.[1];
  expect(typeof handler).toBe('function');

  setLocale('fr');
  expect(getLocale()).toBe('fr');

  handler('active');
  expect(getLocale()).toBe('en');
});

test('every label rules.ts shows (Shot checks, locks, notes) has a key: tr() finds them by their English text', () => {
  const rules = fs.readFileSync(path.join(__dirname, '../src/services/tidy/rules.ts'), 'utf8');
  const all = (re: RegExp, s = rules) => [...s.matchAll(re)].map((m) => m[1]);
  const lockOf = rules.slice(rules.indexOf('function lockOf'), rules.indexOf('const asIndexed'));
  const better = rules.slice(rules.indexOf('const BETTER'), rules.indexOf('export function diffChecks'));
  const shown = [...all(/text: '([^']+)'/g), ...all(/note: '([^']+)'/g), ...all(/COPY_STAYS = '([^']+)'/g), ...all(/return '([^']+)'/g, lockOf), ...all(/: '([^']+)'/g, better)];
  expect(shown.length).toBeGreaterThan(25);
  expect(shown.filter((x) => !(x in en.tidy.checks))).toEqual([]);
});

test('the people filter in words reads the same through tr()', () => {
  const list = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Ben' }, { id: 3, name: '' }, { id: 4, name: '' }] as Person[];
  expect(filterLabel({ with: [1, 2], without: [3], either: false }, list)).toBe('with Ada & Ben without 1 person');
  expect(filterLabel({ with: [1, 2], without: [], either: true }, list)).toBe('with Ada or Ben');
  expect(filterLabel({ with: [], without: [1, 2], either: false }, list)).toBe('without Ada, Ben');
  expect(filterLabel({ with: [3, 4], without: [], either: false }, list)).toBe('with 2 people');
  expect(filterLabel({ with: [], without: [], either: false }, list)).toBe('');
});
