import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGES } from '../src/i18n/languages';
import { translations } from '../src/i18n/translations';
import { i18n, isRtl, tr } from '../src/i18n';
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
  i18n.locale = 'tr';
  expect(tr('tabs.discover')).toBe('Discover');
  expect(tr('onboarding.page', { n: 2, total: 4 })).toBe('Page 2 of 4');
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
    for (const m of src.matchAll(/'((?:common|tabs|onboarding|paywall|profile)\.[A-Za-z0-9_.]+)'/g)) used.add(m[1]);
  }
  expect(used.size).toBeGreaterThan(50);
  const missing = [...used].filter((k) => !english.has(k));
  expect(missing).toEqual([]);
});
