/** Design tokens from the mock (spec.json): Cashmere = light (mock theme-3), Espresso = dark (mock :root). */
export type Theme = {
  dark: boolean;
  bgScreen: string;
  /** vertical screen gradient (CSS string for experimental_backgroundImage); null = flat bgScreen */
  bgGrad: string | null;
  bgCard: string;
  borderSubtle: string;
  borderStrong: string;
  ink: string;
  inkMuted: string;
  accentFab: string;
  accentFabText: string;
  tapeBg: string;
  tapeBorder: string;
  sprocket: string;
  /** CSS box-shadow strings (RN boxShadow) */
  shadowCard: string;
  shadowDeck: string;
  shadowPrint: string;
  /** Library "Draft" pill: neutral fill in light, rust in dark */
  draftPill: string;
};

export const cashmere: Theme = {
  dark: false,
  bgScreen: '#F3E7D3', // brand.parchment
  bgGrad: 'linear-gradient(180deg, #F6ECDB 0%, #F3E7D3 50%, #F1E2CB 100%)',
  bgCard: '#FFF8EC', // brand.paper
  borderSubtle: 'rgba(43,24,16,0.08)',
  borderStrong: 'rgba(43,24,16,0.16)',
  ink: '#2B1810', // brand.espresso
  inkMuted: '#6B5848', // 5.5:1 on parchment, 6.4 on paper, 4.5 on knockout
  accentFab: '#E8A94F', // brand.caramel
  accentFabText: '#2B1810', // espresso on caramel, 8.2:1
  tapeBg: 'rgba(223,210,192,0.72)', // knockout
  tapeBorder: 'rgba(140,115,95,0.25)',
  sprocket: 'rgba(43,24,16,0.16)',
  shadowCard: '0 10px 24px -12px rgba(43,24,16,0.2), 0 2px 5px rgba(43,24,16,0.06)',
  shadowDeck: '0 -8px 24px -6px rgba(43,24,16,0.2), 0 10px 20px -8px rgba(43,24,16,0.15)',
  shadowPrint: '0 7px 16px -4px rgba(43,24,16,0.3), 0 2px 4px rgba(43,24,16,0.15)',
  draftPill: 'rgba(43,24,16,0.06)',
};

/** Cashmere's cards, borders and tab bar over Discover's grainy parchment (developer tools → Paper grain): a slightly warmer paper. */
export const parchment: Partial<Theme> = { bgCard: '#FFF4E0', borderSubtle: 'rgba(120,82,36,0.12)', borderStrong: 'rgba(120,82,36,0.16)' };

export const espresso: Theme = {
  dark: true,
  bgScreen: '#2A170F', // brand.ristretto.tile
  bgGrad: null,
  bgCard: '#3A2316', // between the ristretto tile and its paper (#4A2D1E)
  borderSubtle: 'rgba(242,223,192,0.09)',
  borderStrong: 'rgba(242,223,192,0.17)',
  ink: '#F2DFC0', // brand.ristretto.ink
  inkMuted: '#B9A184', // 6.9:1 on the screen, 5.9 on cards
  accentFab: '#E8A94F', // brand.caramel
  accentFabText: '#2B1810',
  tapeBg: 'rgba(232,169,79,0.34)',
  tapeBorder: 'rgba(240,190,110,0.25)',
  sprocket: 'rgba(242,223,192,0.18)',
  shadowCard: '0 12px 26px -10px rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.35)',
  shadowDeck: '0 -10px 28px -6px rgba(0,0,0,0.72), 0 12px 24px -8px rgba(0,0,0,0.6)',
  shadowPrint: '0 8px 18px -4px rgba(0,0,0,0.72), 0 2px 5px rgba(0,0,0,0.48)',
  draftPill: '#A84A2F', // brand.rust
};

/** Theme-independent colours the mock hard-codes. */
export const fixed = {
  printBorder: '#FFF8EC', // print edges, cream badges (brand.paper)
  chipText: '#F2DFC0', // edit chip text on chipBg
  chipBg: 'rgba(0,0,0,0.6)',
  chipBorder: 'rgba(255,255,255,0.15)',
  like: '#E0393E',
  igBlue: '#3897F0',
  igRing: ['#F5B26B', '#D9468C'],
  tiktokBg: '#181411',
  tapeShadow: '0 2px 5px rgba(0,0,0,0.12)',
};

/**
 * The logo's palette (design/brand/picdump-logo.svg, colorway 01 espresso, and 09 ristretto for dark surfaces). Not a theme: screens read
 * useTheme(); these are for the launcher icon, the splash and anywhere the logo itself is drawn. app.json repeats parchment and
 * ristretto.tile (adaptive icon and splash backgrounds); __tests__/brand-assets.test.ts fails if they drift apart.
 */
export const brand = {
  parchment: '#F3E7D3', // logo tile
  espresso: '#2B1810', // logo ink: the animal and the print interiors
  paper: '#FFF8EC', // logo print borders
  knockout: '#DFD2C0', // outline where the animal overlaps the prints
  ristretto: { tile: '#2A170F', ink: '#F2DFC0', paper: '#4A2D1E' }, // dark-surface colourway
  // Not in the logo: the accent, taken from the 24 colourways. caramel (colourway 11) fills buttons and highlights, with espresso text;
  // rust (the app's existing dark accent) is the deep version, readable as text or fill-with-paper-text on light and dark.
  caramel: '#E8A94F',
  rust: '#A84A2F',
} as const;
