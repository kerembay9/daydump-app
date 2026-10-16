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
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Image as ImageIcon, Sparkles, FolderOpen } from 'lucide-react-native';
import { Header } from './src/components/Header';
import { ThemePromptBar } from './src/components/ThemePromptBar';
import { CarouselViewer } from './src/components/CarouselViewer';
import { CaptionStudio } from './src/components/CaptionStudio';
import { PaywallModal } from './src/components/PaywallModal';
import { SettingsModal } from './src/components/SettingsModal';
import { OnboardingModal } from './src/components/OnboardingModal';
import { GalleryService } from './src/services/galleryService';
import { GeminiService } from './src/services/geminiService';
import { RevenueCatService } from './src/services/revenuecat';
import { ShareService } from './src/services/shareService';
import { OnboardingService } from './src/services/onboardingService';
import { NotificationService } from './src/services/notificationService';
import { PremiumStatusProvider } from './src/contexts/PremiumStatusContext';
import { CuratedCarousel, FrameStyle, UserSubscriptionState } from './src/types';

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

  useEffect(() => {
    initApp();
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

  const handleFinishOnboarding = async (triggerPaywallHook?: boolean) => {
    setShowOnboarding(false);
    // Aggressive Creator Model: 60-70% conversion hook right after onboarding
    if (triggerPaywallHook && !subscription.isPro) {
      setShowPaywall(true);
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

  const handleCurateTheme = async (themeQuery: string, isCustom: boolean) => {
    // Aggressive Creator Model Paywall Gate 1: Custom theme prompts require Pro
    if (isCustom && !subscription.isPro) {
      setShowPaywall(true);
      return;
    }

    // Aggressive Creator Model Paywall Gate 2: More than 1 daily dump requires Pro
    if (!subscription.isPro && subscription.dailyDumpsUsedToday >= subscription.maxFreeDailyDumps) {
      setShowPaywall(true);
      return;
    }

    setIsLoading(true);
    setLoadingText(`Searching photos for "${themeQuery || 'Today'}"...`);

    try {
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

      // Track usage for free limits
      if (!subscription.isPro) {
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
      }
    } catch (e) {
      console.warn('Pick photos error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFrame = (style: FrameStyle) => {
    if (style !== 'clean' && !subscription.isPro) {
      setShowPaywall(true);
      return;
    }

    if (carousel) {
      setCarousel({ ...carousel, frameStyle: style });
    }
  };

  const handleShareSlide = async (slideIndex: number) => {
    if (!carousel) return;
    const slide = carousel.slides[slideIndex] || carousel.slides[0];
    await ShareService.shareImage(
      slide.photo.uri,
      carousel.captions.minimal,
      carousel.suggestedTags
    );
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
        onOpenPaywall={() => setShowPaywall(true)}
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
          isPro={subscription.isPro}
          isLoading={isLoading}
          onCurateTheme={handleCurateTheme}
          onRequirePro={() => setShowPaywall(true)}
          onPickFromGallery={handlePickFromGallery}
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

            {/* 4:5 Instagram Feed Carousel Preview with ViewShot & Save All Album */}
            <CarouselViewer
              carousel={carousel}
              isPro={subscription.isPro}
              onSelectFrame={handleSelectFrame}
              onShare={handleShareSlide}
              onRequirePro={() => setShowPaywall(true)}
            />

            {/* Multi-Tone Caption Studio & Hashtags */}
            <CaptionStudio
              carousel={carousel}
              isPro={subscription.isPro}
              onRequirePro={() => setShowPaywall(true)}
            />
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No photos found. Take a few photos today to begin!</Text>
          </View>
        )}
      </ScrollView>

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
        onOpenPaywall={() => setShowPaywall(true)}
      />
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
});
