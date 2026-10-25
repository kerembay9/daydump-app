import type { TextStyle } from 'react-native';

/**
 * Font families embedded by the expo-font plugin (app.json), one family per weight: Android ignores fontWeight
 * for custom fonts, so pick the family instead and never set fontWeight alongside it.
 */
export const serif = { 400: 'SourceSerif4_400Regular', 500: 'SourceSerif4_500Medium', 600: 'SourceSerif4_600SemiBold', italic: 'SourceSerif4_500Medium_Italic' } as const;
export const sans = { 400: 'Inter_400Regular', 500: 'Inter_500Medium', 600: 'Inter_600SemiBold', 700: 'Inter_700Bold' } as const;

/** CSS letter-spacing in em -> RN px for a font size. */
export const em = (size: number, value: number) => size * value;

/** .font-display: Source Serif 4 500, tracking -0.02em. Page titles 28/1.05, hero 19.5, tiles 15.5-16.5. */
export const display = (size: number, lineHeight?: number): TextStyle => ({
  fontFamily: serif[500],
  fontSize: size,
  letterSpacing: em(size, -0.02),
  ...(lineHeight ? { lineHeight: size * lineHeight } : null),
});

/** Inter body/meta/buttons. */
export const ui = (size: number, weight: keyof typeof sans = 400): TextStyle => ({ fontFamily: sans[weight], fontSize: size });

/** Section labels: Inter 600 uppercase, tracking 0.14em (pass color = inkMuted). */
export const label = (size = 10, tracking = 0.14): TextStyle => ({
  fontFamily: sans[600],
  fontSize: size,
  letterSpacing: em(size, tracking),
  textTransform: 'uppercase',
});
