import React, { useEffect, useMemo, useState } from 'react';
import { Text, ToastAndroid, View } from 'react-native';
import { DefaultTheme, router, Stack, ThemeProvider as NavThemeProvider, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme, useThemeNow } from '../theme/ThemeProvider';
import { AppStateProvider, onTouch, useApp } from '../state/AppState';
import { OnboardingModal } from '../components/OnboardingModal';
import { NotificationService } from '../services/notificationService';
import { currentCreateDraft, discardShared, DumpPhoto, receiveShared, sharedPhotos } from '../services/dumps';
import { Sheet } from '../components/ui/Sheet';
import { syncLangs } from '../services/index/queryLang';
import { FrameCard } from '../components/ui/FrameCard';
import { Tap } from '../components/ui/Tap';
import { display, ui } from '../theme/type';

// Fonts (Source Serif 4, Inter) are embedded at build time by the expo-font plugin in app.json, so they are
// available on the first frame; there is nothing to load or wait for here.

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStateProvider>
            <Root />
          </AppStateProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  // the background repaints with the screen that switched the theme; the rest follows deferred (ThemeProvider)
  const now = useThemeNow().t;
  const { t } = useTheme();
  const app = useApp();
  // Screens are transparent so the one screen gradient behind the navigator shows through.
  const navTheme = useMemo(() => ({
    ...DefaultTheme,
    dark: t.dark,
    colors: { ...DefaultTheme.colors, background: 'transparent', card: t.bgCard, text: t.ink, border: t.borderStrong, primary: t.ink },
  }), [t]);

  // Photos shared to / "opened with" PicDump start a Create draft, or join the one in progress if the user says so.
  // On a cold start the intent is there on the first render, so wait for the navigator before navigating.
  const navReady = !!useRootNavigationState()?.key;
  const [ask, setAsk] = useState<DumpPhoto[] | null>(null);
  const toCreate = async (photos: DumpPhoto[], mode: 'add' | 'new') => {
    setAsk(null);
    try {
      const d = await receiveShared(photos, mode);
      console.log(`[share] ${mode === 'add' ? 'added to' : 'started'} draft ${d.id} (${d.photos.length} photos)`);
    } catch (e) { console.warn('[share] failed:', e); }
    router.navigate({ pathname: '/create', params: { shared: String(Date.now()) } });
  };
  useEffect(() => {
    const inc = app.incoming;
    if (!navReady || !inc) return;
    app.clearIncoming();
    // straight to Create (the add-or-new sheet, if any, opens over it); toCreate navigates again so Create reloads
    router.navigate('/create');
    (async () => {
      const photos = await sharedPhotos(inc.uris);
      if (!photos.length) return;
      if ((await currentCreateDraft())?.photos.length) setAsk(photos);
      else toCreate(photos, 'new');
    })().catch((e) => console.warn('[share] failed:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navReady, app.incoming]);
  // The 8 PM recap opens today's story (/preview/today), from a cold start too.
  // search languages: fetch the ones not downloaded yet (index/queryLang.ts)
  useEffect(() => { syncLangs().catch((e) => console.warn('[queryLang] sync failed:', e)); }, []);
  useEffect(() => (navReady ? NotificationService.onOpen((url) => router.push(url as never)) : undefined), [navReady]);

  return (
    <View {...onTouch} style={{ flex: 1, backgroundColor: now.bgScreen, experimental_backgroundImage: now.bgGrad ?? undefined }}>
      <NavThemeProvider value={navTheme}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'fade' }}>
          {/* listed screens come first, so the tabs stay the initial route */}
          <Stack.Screen name="(tabs)" />
          {/* one screen per route + id: a fast double tap pushed two, so Back showed the same page again */}
          {['preview/[id]', 'edit/[id]', 'profile', 'selfie', 'people'].map((name) => <Stack.Screen key={name} name={name} dangerouslySingular />)}
        </Stack>
      </NavThemeProvider>
      <Sheet visible={!!ask} onClose={() => { if (ask) discardShared(ask); setAsk(null); ToastAndroid.show('Shared photos not added', ToastAndroid.SHORT); }}>
        <Text style={[display(20, 1.15), { color: t.ink }]}>Add to your draft or start a new one?</Text>
        <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17, marginBottom: 4 }]}>
          {ask?.length === 1 ? '1 photo' : `${ask?.length} photos`} shared to PicDump. Your current draft is safe in Library → Drafts.
        </Text>
        <Tap onPress={() => ask && toCreate(ask, 'add')} accessibilityRole="button" style={{ height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.bgScreen }]}>Add to my draft</Text>
        </Tap>
        <FrameCard radius={22} onPress={() => ask && toCreate(ask, 'new')} label="Start a new dump" style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.ink }]}>Start a new dump</Text>
        </FrameCard>
      </Sheet>
      {/* keyed so onboarding reopened from Dev tools starts again at slide 1 */}
      <OnboardingModal key={String(app.onboarding)} visible={app.onboarding} onStart={app.start} onFinish={app.finishOnboarding} />
      <StatusBar style={now.dark ? 'light' : 'dark'} />
    </View>
  );
}
