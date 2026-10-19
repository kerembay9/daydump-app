import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Sparkles, FolderOpen, ArrowRight } from 'lucide-react-native';
import { Header } from './src/components/Header';
import { ThemePromptBar } from './src/components/ThemePromptBar';
import { StoryBuilder } from './src/components/StoryBuilder';
import { PaywallModal } from './src/components/PaywallModal';
import { SettingsModal } from './src/components/SettingsModal';
import { OnboardingModal } from './src/components/OnboardingModal';
import { IndexProgress, StoryCardsRow } from './src/components/StoryCardsRow';
import { DebugStoriesModal } from './src/components/DebugStoriesModal';
import { indexLibrary, Library, loadLibrary, wasHandedOff } from './src/services/index/photoIndex';
import { buildStories, markSeen, searchStory, Story, toCarousel } from './src/services/stories';
import { GalleryService, isCameraPhoto } from './src/services/galleryService';
import { GeminiService } from './src/services/geminiService';
import { RevenueCatService } from './src/services/revenuecat';
import { OnboardingService } from './src/services/onboardingService';
import { NotificationService } from './src/services/notificationService';
import { PremiumStatusProvider } from './src/contexts/PremiumStatusContext';
import { CuratedCarousel, FrameStyle, UserSubscriptionState } from './src/types';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';

const STORIES_SHOWN = 6;

function MainApp() {
  const [subscription, setSubscription] = useState<UserSubscriptionState>({
    isPro: false,
    dailyDumpsUsedToday: 0,
    maxFreeDailyDumps: 1,
  });

  const [carousel, setCarousel] = useState<CuratedCarousel | null>(null);
  const [isSamplePhotos, setIsSamplePhotos] = useState<boolean>(false);
  const [hasPhotoPermission, setHasPhotoPermission] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingText, setLoadingText] = useState<string>('Scanning camera roll...');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showStoriesDebug, setShowStoriesDebug] = useState<boolean>(false);
  const [showBuilder, setShowBuilder] = useState<boolean>(false);

  const [library, setLibrary] = useState<Library | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);

  useEffect(() => {
    initApp();

    // Real-time listener for subscription updates (purchases, renewals, restores)
    const unsubscribe = RevenueCatService.addCustomerInfoListener((_, isPro) => {
      setSubscription((prev) => ({ ...prev, isPro }));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const initApp = async () => {
    await RevenueCatService.init();
    await NotificationService.init();
    await refreshSubscriptionState();

    // Check if first-time onboarding has been seen
    const hasCompleted = await OnboardingService.hasCompletedOnboarding();
    if (!hasCompleted) {
      setIsLoading(false);
      setShowOnboarding(true);
    } else {
      await loadInitialDailyDump();
    }
  };

  const handleOpenPaywall = async () => {
    // 1. Try modern RevenueCat native remote paywall first (from dashboard/AI paywall)
    const { result, isPro } = await RevenueCatService.presentNativePaywall();
    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED || isPro) {
      await refreshSubscriptionState();
      return;
    }

    // 2. Fallback to custom branded PaywallModal if remote paywall is not yet configured
    if (result === PAYWALL_RESULT.NOT_PRESENTED || result === PAYWALL_RESULT.ERROR) {
      setShowPaywall(true);
    }
  };

  const handleFinishOnboarding = async (triggerPaywallHook?: boolean) => {
    setShowOnboarding(false);
    // Aggressive Creator Model: 60-70% conversion hook right after onboarding
    if (triggerPaywallHook && !subscription.isPro) {
      handleOpenPaywall();
    }
    await loadInitialDailyDump();
  };

  const refreshSubscriptionState = async () => {
    const state = await RevenueCatService.getUserSubscriptionState();
    setSubscription(state);
    return state;
  };

  const loadInitialDailyDump = async () => {
    setIsLoading(true);
    setLoadingText('Scanning today’s camera roll...');

    try {
      const perm = await GalleryService.requestPermissions();
      setHasPhotoPermission(perm);
      if (perm) refreshStories();

      // 1. Fetch today's photos
      const photos = await GalleryService.fetchTodaysPhotos(30);

      // 2. Curate initial daily recap with Gemma E2B / Gemini Nano on-device engine
      setLoadingText('Analyzing scenes & visual pacing...');
      const curated = await GeminiService.curateCarousel(photos, undefined, 6);

      // Default frame: if free, use 'clean'; if pro, use 'film35mm'
      const state = await RevenueCatService.getUserSubscriptionState();
      if (!state.isPro) {
        curated.frameStyle = 'clean';
      }

      const isSample = photos[0]?.id?.startsWith('sample-') || false;
      setIsSamplePhotos(isSample);

      setCarousel(curated);
    } catch (err) {
      console.warn('Initial dump error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /** Show stories from the current index right away, then index new photos and rebuild if anything changed. */
  const refreshStories = async () => {
    try {
      let showCost = 0;
      const show = async () => {
        const t = Date.now();
        const lib = await loadLibrary();
        const tl = Date.now() - t;
        setLibrary(lib);
        setStories((await buildStories(lib)).slice(0, STORIES_SHOWN));
        showCost = Date.now() - t;
        console.log(`[stories] rebuilt from ${lib.photos.length} photos in ${showCost} ms (load ${tl} ms)`);
      };
      await show();
      // Newest photos index first, so rebuilding every 15 s surfaces today's stories long before a big first index ends.
      // A rebuild takes ~2 s at 4k photos on an A54 and grows with the library, so back off to keep the JS thread mostly free.
      const t0 = Date.now();
      let lastShow = t0;
      let showing = false;
      const added = await indexLibrary((done, total, last) => {
        const elapsed = Date.now() - t0;
        setIndexProgress({ done, total, etaSec: done >= 32 ? ((total - done) * elapsed) / done / 1000 : null, since: last.creationTime, camera: isCameraPhoto(last.uri) });
        if (!showing && Date.now() - lastShow > Math.max(15000, 5 * showCost)) {
          showing = true;
          show().catch((e) => console.warn('[stories] rebuild failed:', e)).finally(() => { showing = false; lastShow = Date.now(); });
        }
      });
      setIndexProgress(null);
      if (added) await show();
    } catch (e) {
      setIndexProgress(null);
      console.warn('[stories] refresh failed:', e);
    }
  };

  // Indexing handed to the background worker when the app left: back in front, merge its results and finish here.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && wasHandedOff()) refreshStories(); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshStories only touches state setters
  }, []);

  const handleSelectStory = (story: Story) => {
    const curated = toCarousel(story);
    if (!subscription.isPro) curated.frameStyle = 'clean';
    setIsSamplePhotos(false);
    setCarousel(curated);
    setShowBuilder(true);
    markSeen([story.id]);
  };

  const handleShuffleStories = async () => {
    if (!library) return;
    await markSeen(stories.map((s) => s.id));
    setStories((await buildStories(library)).slice(0, STORIES_SHOWN));
  };

  const handleCurateTheme = async (themeQuery: string) => {
    // Search (typed or preset query) is free and unlimited; only the plain daily recap counts toward the free limit.
    const isSearch = !!themeQuery;
    if (!isSearch && !subscription.isPro && subscription.dailyDumpsUsedToday >= subscription.maxFreeDailyDumps) {
      handleOpenPaywall();
      return;
    }

    setIsLoading(true);
    setLoadingText(`Searching photos for "${themeQuery || 'Today'}"...`);

    try {
      // On-device CLIP search when the index is available; keyword/date fallback otherwise.
      const found = themeQuery && library?.hasClip ? await searchStory(library, themeQuery) : null;
      if (found) {
        const curated = toCarousel(found);
        if (!subscription.isPro) curated.frameStyle = 'clean';
        setIsSamplePhotos(false);
        setCarousel(curated);
        setShowBuilder(true);
        return;
      }

      const photos = themeQuery
        ? await GalleryService.fetchPhotosForTheme(themeQuery, 35)
        : await GalleryService.fetchTodaysPhotos(30);

      const isSample = photos[0]?.id?.startsWith('sample-') || false;
      setIsSamplePhotos(isSample);

      setLoadingText('Structuring visual story & pacing...');
      const curated = await GeminiService.curateCarousel(photos, themeQuery, 6);

      // Enforce frame style based on subscription
      if (!subscription.isPro) {
        curated.frameStyle = 'clean';
      }

      setCarousel(curated);
      setShowBuilder(true);

      // Track usage for free limits
      if (!isSearch && !subscription.isPro) {
        await RevenueCatService.recordDumpGenerated();
        await refreshSubscriptionState();
      }
    } catch (err) {
      console.warn('Curate theme error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const photos = await GalleryService.pickPhotosFromGallery();
      if (photos.length > 0) {
        setIsLoading(true);
        setLoadingText('Curating selected photos...');
        setIsSamplePhotos(false);
        const curated = await GeminiService.curateCarousel(photos, 'My Selection', 6);
        if (!subscription.isPro) {
          curated.frameStyle = 'clean';
        }
        setCarousel(curated);
        setShowBuilder(true);
      }
    } catch (e) {
      console.warn('Pick photos error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFrame = (style: FrameStyle) => {
    if (style !== 'clean' && !subscription.isPro) {
      handleOpenPaywall();
      return;
    }

    if (carousel) {
      setCarousel({ ...carousel, frameStyle: style });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshSubscriptionState();
    await loadInitialDailyDump();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

      {/* Header */}
      <Header
        subscription={subscription}
        onOpenPaywall={handleOpenPaywall}
        onOpenSettings={() => setShowSettings(true)}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF9500"
          />
        }
      >
        {/* Theme Prompt Bar with Custom Query & Preset Chips */}
        <ThemePromptBar
          isLoading={isLoading}
          onCurateTheme={handleCurateTheme}
          onPickFromGallery={handlePickFromGallery}
        />

        <StoryCardsRow
          stories={stories}
          progress={indexProgress}
          activeId={carousel?.id}
          onSelect={handleSelectStory}
          onShuffle={handleShuffleStories}
        />

        {/* Loading Overlay or Carousel Studio */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF9500" />
            <Text style={styles.loadingText}>{loadingText}</Text>
          </View>
        ) : carousel ? (
          <>
            {/* Notice banner if showing sample photos */}
            {isSamplePhotos && (
              <View style={styles.demoBanner}>
                <View style={styles.demoBannerHeader}>
                  <Sparkles size={14} color="#FF9500" />
                  <Text style={styles.demoBannerTitle}>
                    {!hasPhotoPermission ? 'Photo Access Needed' : 'Demo Carousel Preview'}
                  </Text>
                </View>
                <Text style={styles.demoBannerText}>
                  {!hasPhotoPermission
                    ? 'DayDump needs photo access to automatically discover and curate today’s moments.'
                    : 'Showing sample photos because no shots were taken today yet. Pick photos from your library to craft your 4:5 drop:'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {!hasPhotoPermission && (
                    <TouchableOpacity
                      style={[styles.demoBannerBtn, { flex: 1, backgroundColor: '#3A3A3C' }]}
                      onPress={() => Linking.openSettings()}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.demoBannerBtnText, { color: '#FFFFFF' }]}>Open Settings</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.demoBannerBtn, { flex: 1 }]}
                    onPress={handlePickFromGallery}
                    activeOpacity={0.8}
                  >
                    <FolderOpen size={14} color="#000" />
                    <Text style={styles.demoBannerBtnText}>Pick My Photos</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Current draft: opens the step-by-step builder (photos -> frame -> caption -> share) */}
            <TouchableOpacity style={styles.draftCard} onPress={() => setShowBuilder(true)} activeOpacity={0.85}>
              <View style={styles.draftStrip}>
                {carousel.slides.map((s) => (
                  <Image key={s.id} source={{ uri: s.photo.uri }} style={styles.draftThumb} contentFit="cover" recyclingKey={s.id} />
                ))}
              </View>
              <View style={styles.draftFooter}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.draftTitle} numberOfLines={1}>{carousel.themeTitle}</Text>
                  <Text style={styles.draftSubtitle} numberOfLines={1}>{carousel.themeDescription}</Text>
                </View>
                <View style={styles.draftBtn}>
                  <Text style={styles.draftBtnText}>Edit & share</Text>
                  <ArrowRight size={14} color="#000" />
                </View>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No photos found. Take a few photos today to begin!</Text>
          </View>
        )}
      </ScrollView>

      {carousel && showBuilder && (
        <StoryBuilder
          carousel={carousel}
          library={library}
          isPro={subscription.isPro}
          onChange={setCarousel}
          onSelectFrame={handleSelectFrame}
          onRequirePro={handleOpenPaywall}
          onClose={() => setShowBuilder(false)}
        />
      )}

      {/* 3-Slide Visual Onboarding & Pre-Permission Primer */}
      <OnboardingModal
        visible={showOnboarding}
        onFinish={handleFinishOnboarding}
      />

      {/* Aggressive Creator Paywall Modal */}
      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={async () => {
          await refreshSubscriptionState();
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onReloadSubscription={refreshSubscriptionState}
        onTriggerOnboarding={() => setShowOnboarding(true)}
        onOpenPaywall={handleOpenPaywall}
        onOpenStoriesDebug={() => {
          setShowSettings(false);
          setShowStoriesDebug(true);
        }}
      />

      <DebugStoriesModal visible={showStoriesDebug} onClose={() => setShowStoriesDebug(false)} onResetIndex={refreshStories} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PremiumStatusProvider>
        <MainApp />
      </PremiumStatusProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    height: 400,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.3,
  },
  emptyContainer: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  demoBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.3)',
  },
  demoBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  demoBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FF9500',
    letterSpacing: 0.5,
  },
  demoBannerText: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
    marginBottom: 10,
  },
  demoBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF9500',
    paddingVertical: 9,
    borderRadius: 10,
  },
  demoBannerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
  },
  draftCard: { marginHorizontal: 16, marginTop: 4, borderRadius: 16, backgroundColor: '#1C1C1E', overflow: 'hidden' },
  draftStrip: { flexDirection: 'row', height: 120, gap: 2 },
  draftThumb: { flex: 1, backgroundColor: '#2C2C2E' },
  draftFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  draftTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  draftSubtitle: { color: '#8E8E93', fontSize: 11, marginTop: 2 },
  draftBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF9500', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  draftBtnText: { color: '#000000', fontSize: 12, fontWeight: '800' },
});
