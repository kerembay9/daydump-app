import React, { createContext, useContext, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Appearance, AppState as RNAppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { setNavigationBarStyle } from '../../modules/clip-embedder';
import { cashmere, espresso, Theme } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'daydump.themeMode';

type Ctx = { t: Theme; mode: ThemeMode; setMode: (m: ThemeMode) => void };
const ThemeCtx = createContext<Ctx>({ t: cashmere, mode: 'system', setMode: () => {} });
/** The new theme right away; ThemeCtx gets it one deferred render later (see ThemeNow). */
const NowCtx = createContext<Ctx>({ t: cashmere, mode: 'system', setMode: () => {} });

/** Light (Cashmere) by default; Profile can switch to Dark or System (persisted). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // null until the saved override is read: rendering nothing for that tick avoids a Cashmere frame before Dark.
  const [mode, setModeState] = useState<ThemeMode | null>(null);
  const [system, setSystem] = useState(Appearance.getColorScheme());

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((m) => setModeState(m === 'system' || m === 'dark' ? m : 'light'))
      .catch(() => setModeState('light'));
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  };

  // Native UI (alerts, pickers) follows the override too; 'unspecified' hands control back to the system
  // (a no-op natively when nothing was overridden).
  useEffect(() => { if (mode) Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode); }, [mode]);

  useEffect(() => {
    const a = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    // Reopening after Back makes a new activity that starts in the new uiMode with no change event, so
    // RN's cached scheme would stay stale. Re-read on resume ('unspecified' refreshes RN's cached scheme).
    const b = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active' || mode !== 'system') return;
      Appearance.setColorScheme('unspecified');
      setSystem(Appearance.getColorScheme());
    });
    return () => { a.remove(); b.remove(); };
  }, [mode]);

  const themeOf = (m: ThemeMode | null) => ((m ?? 'light') === 'system' ? system === 'dark' : m === 'dark') ? espresso : cashmere;
  const t = themeOf(mode);
  // Every mounted screen re-renders on a theme change (~0.5 s in dev with Discover + Create under Profile). The
  // screen picking the theme (ThemeNow) and the root background repaint first; the rest catch up deferred, unseen.
  const later = useDeferredValue(mode);
  const tLater = themeOf(later);
  useEffect(() => {
    if (!mode) return;
    SystemUI.setBackgroundColorAsync(t.bgScreen).catch(() => {});
    setNavigationBarStyle(!t.dark);
  }, [t, mode]);

  const now = useMemo(() => ({ t, mode: mode ?? 'system', setMode }), [t, mode]);
  const value = useMemo(() => ({ t: tLater, mode: later ?? 'system', setMode }), [tLater, later]);
  // `later` too: the first frame waits for the saved mode, so no Cashmere frame before Dark
  return mode && later && <NowCtx.Provider value={now}><ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider></NowCtx.Provider>;
}

/** The theme without the deferral: for the root background. */
export const useThemeNow = () => useContext(NowCtx);
/** Gives its subtree the theme without the deferral (Profile, where the theme is picked). */
export const ThemeNow = ({ children }: { children: React.ReactNode }) => <ThemeCtx.Provider value={useContext(NowCtx)}>{children}</ThemeCtx.Provider>;

export const useTheme = () => useContext(ThemeCtx);

/** Gives its subtree the theme with some tokens swapped (Discover's parchment); patch should be a constant. */
export function ThemePatch({ patch, children }: { patch?: Partial<Theme>; children: React.ReactNode }) {
  const c = useContext(ThemeCtx);
  const value = useMemo(() => (patch ? { ...c, t: { ...c.t, ...patch } } : c), [c, patch]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
