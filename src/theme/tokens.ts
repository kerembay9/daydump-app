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
  bgScreen: '#F6EFE6',
  bgGrad: 'linear-gradient(180deg, #F9F4E8 0%, #F5F2E7 48%, #F7EDE6 100%)',
  bgCard: '#EFE6DA',
  borderSubtle: 'rgba(74,52,40,0.08)',
  borderStrong: 'rgba(74,52,40,0.15)',
  ink: '#261F1B',
  inkMuted: '#766860',
  accentFab: '#DFD1C4',
  accentFabText: '#261F1B',
  tapeBg: 'rgba(212,196,182,0.58)',
  tapeBorder: 'rgba(140,115,95,0.22)',
  sprocket: 'rgba(74,52,40,0.16)',
  shadowCard: '0 10px 24px -12px rgba(74,52,40,0.18), 0 2px 5px rgba(74,52,40,0.05)',
  shadowDeck: '0 -8px 24px -6px rgba(74,52,40,0.18), 0 10px 20px -8px rgba(74,52,40,0.14)',
  shadowPrint: '0 7px 16px -4px rgba(55,38,28,0.28), 0 2px 4px rgba(55,38,28,0.14)',
  draftPill: 'rgba(0,0,0,0.05)',
};

/** Cashmere's cards, borders and tab bar over Discover's parchment (developer tools → Paper grain): warm creams a step lighter than the tan. */
export const parchment: Partial<Theme> = { bgCard: '#F5E9D2', borderSubtle: 'rgba(120,82,36,0.12)', borderStrong: 'rgba(120,82,36,0.16)' };

export const espresso: Theme = {
  dark: true,
  bgScreen: '#241D14',
  bgGrad: null,
  bgCard: '#2E2418',
  borderSubtle: 'rgba(255,232,200,0.09)',
  borderStrong: 'rgba(255,232,200,0.17)',
  ink: '#F3ECE3',
  inkMuted: '#9E9080',
  accentFab: '#A84A2F',
  accentFabText: '#FAF4EE',
  tapeBg: 'rgba(212,169,106,0.36)',
  tapeBorder: 'rgba(235,195,130,0.25)',
  sprocket: 'rgba(255,235,205,0.18)',
  shadowCard: '0 12px 26px -10px rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.35)',
  shadowDeck: '0 -10px 28px -6px rgba(0,0,0,0.72), 0 12px 24px -8px rgba(0,0,0,0.6)',
  shadowPrint: '0 8px 18px -4px rgba(0,0,0,0.72), 0 2px 5px rgba(0,0,0,0.48)',
  draftPill: '#A84A2F',
};

/** Theme-independent colours the mock hard-codes. */
export const fixed = {
  printBorder: '#FAF6F0', // print edges, cream badges
  chipText: '#F3ECE3', // edit chip text on chipBg
  chipBg: 'rgba(0,0,0,0.6)',
  chipBorder: 'rgba(255,255,255,0.15)',
  like: '#E0393E',
  igBlue: '#3897F0',
  igRing: ['#F5B26B', '#D9468C'],
  tiktokBg: '#181411',
  tapeShadow: '0 2px 5px rgba(0,0,0,0.12)',
};
