import { cashmere, espresso, parchment } from '../src/theme/tokens';

// WCAG 2.x contrast ratio between two #RRGGBB colours.
const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Text in this app is small (10 to 14 px), so everything is held to AA for normal text, 4.5:1.
const PAIRS: [string, 'ink' | 'inkMuted' | 'accentFabText' | 'bgScreen', 'bgScreen' | 'bgCard' | 'accentFab' | 'ink'][] = [
  ['ink on screen', 'ink', 'bgScreen'],
  ['ink on card', 'ink', 'bgCard'],
  ['muted on screen', 'inkMuted', 'bgScreen'],
  ['muted on card', 'inkMuted', 'bgCard'],
  ['accent text on accent', 'accentFabText', 'accentFab'],
  ['active pill: screen on ink', 'bgScreen', 'ink'],
];

describe.each([['Cashmere', cashmere, {}], ['Espresso', espresso, {}], ['Cashmere over parchment cards', cashmere, parchment]] as const)('%s', (_name, theme, over) => {
  const t = { ...theme, ...over };
  test.each(PAIRS)('%s is at least 4.5:1', (_label, fg, bg) => {
    expect(ratio(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });
});

// The themes are built from the brand palette: change one place, not two.
import { brand } from '../src/theme/tokens';

test('Cashmere is parchment, paper and espresso; Espresso is the ristretto colourway', () => {
  expect(cashmere.bgScreen).toBe(brand.parchment);
  expect(cashmere.bgCard).toBe(brand.paper);
  expect(cashmere.ink).toBe(brand.espresso);
  expect(espresso.bgScreen).toBe(brand.ristretto.tile);
  expect(espresso.ink).toBe(brand.ristretto.ink);
});

test('the accent is caramel with espresso text in both themes', () => {
  for (const t of [cashmere, espresso]) {
    expect(t.accentFab).toBe(brand.caramel);
    expect(t.accentFabText).toBe(brand.espresso);
  }
});

test('the deep accent (rust) reads as text on the light surfaces and carries paper text as a fill', () => {
  expect(ratio(brand.rust, cashmere.bgScreen)).toBeGreaterThanOrEqual(4.5);
  expect(ratio(brand.rust, cashmere.bgCard)).toBeGreaterThanOrEqual(4.5);
  expect(ratio(brand.paper, brand.rust)).toBeGreaterThanOrEqual(4.5);
});
