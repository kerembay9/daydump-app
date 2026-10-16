import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, ShieldCheck, Image as ImageIcon, ArrowRight, Check, Film, Layers } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { OnboardingService } from '../services/onboardingService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OnboardingModalProps {
  visible: boolean;
  onFinish: (triggerPaywallHook?: boolean) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ visible, onFinish }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const slides = [
    {
      id: 'hook',
      badge: 'EFFORTLESS CREATOR DROPS',
      title: 'Turn Camera Roll Chaos Into Editorial Drops',
      description:
        'Say goodbye to scrolling through 200 shots. DayDump picks the 6 best photos of your day, paced with cinematic flow and instant captions.',
      icon: Sparkles,
      color: '#FF9500',
    },
    {
      id: 'privacy',
      badge: 'ON-DEVICE NEURAL ENGINE',
      title: '100% Private.\nZero Cloud Uploads.',
      description:
        'Powered by local on-device AI running directly on your phone’s GPU. Your photos never leave your device, and are never sent to external servers.',
      icon: ShieldCheck,
      color: '#30D158',
    },
    {
      id: 'permissions',
      badge: 'CAMERA ROLL ACCESS',
      title: 'Ready to Curate Your First Dump?',
      description:
        'Enable photo library access so DayDump can automatically surface your standout moments from today and format them for Instagram.',
      icon: ImageIcon,
      color: '#FF9500',
    },
  ];

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage && page >= 0 && page < slides.length) {
      setCurrentPage(page);
      Haptics.selectionAsync();
    }
  };

  const goToNextPage = () => {
    if (currentPage < slides.length - 1) {
      scrollRef.current?.scrollTo({ x: (currentPage + 1) * SCREEN_WIDTH, animated: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleGrantPermissionAndFinish = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Explicitly request photo access (avoiding audio prompt issues on Android 13+)
      await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    } catch (e) {
      console.warn('Permission request error during onboarding:', e);
    } finally {
      await OnboardingService.setOnboardingCompleted();
      // Onboarding complete: pass true to trigger high-converting 3-day trial paywall
      onFinish(true);
    }
  };

  const handleSkip = async () => {
    await OnboardingService.setOnboardingCompleted();
    onFinish(false);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <SafeAreaView style={styles.container}>
        {/* Top Header with Skip */}
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoPill}>
              <Text style={styles.logoText}>DAYDUMP</Text>
            </View>
          </View>
          {currentPage < slides.length - 1 && (
            <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Carousel Content */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={styles.scrollView}
        >
          {slides.map((slide, index) => {
            const Icon = slide.icon;
            return (
              <View key={slide.id} style={styles.slide}>
                <View style={[styles.iconContainer, { borderColor: `${slide.color}30` }]}>
                  <View style={[styles.iconInner, { backgroundColor: `${slide.color}15` }]}>
                    <Icon size={46} color={slide.color} strokeWidth={1.8} />
                  </View>
                </View>

                {/* Feature preview visual pill */}
                <View style={styles.badgePill}>
                  <Text style={[styles.badgeText, { color: slide.color }]}>{slide.badge}</Text>
                </View>

                <Text style={styles.slideTitle}>{slide.title}</Text>
                <Text style={styles.slideDesc}>{slide.description}</Text>

                {/* Visual bullet points for slide 1 */}
                {index === 0 && (
                  <View style={styles.featureBox}>
                    <View style={styles.featureRow}>
                      <Film size={14} color="#FF9500" />
                      <Text style={styles.featureRowText}>Aesthetic 35mm Film & Editorial 4:5 frames</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Layers size={14} color="#FF9500" />
                      <Text style={styles.featureRowText}>Visual pacing: Hook → Action → Detail</Text>
                    </View>
                  </View>
                )}

                {/* Privacy checkmarks for slide 2 */}
                {index === 1 && (
                  <View style={styles.featureBox}>
                    <View style={styles.featureRow}>
                      <Check size={14} color="#30D158" />
                      <Text style={styles.featureRowText}>Processed locally with Gemma E2B</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Check size={14} color="#30D158" />
                      <Text style={styles.featureRowText}>No accounts or photo tracking required</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Bottom Pagination & Primary CTA */}
        <View style={styles.bottomBar}>
          {/* Pagination Dots */}
          <View style={styles.paginationRow}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  currentPage === i ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          {/* Action Button */}
          {currentPage < slides.length - 1 ? (
            <TouchableOpacity style={styles.ctaButton} onPress={goToNextPage} activeOpacity={0.85}>
              <Text style={styles.ctaButtonText}>Continue</Text>
              <ArrowRight size={18} color="#000" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.ctaButton, styles.ctaButtonGlow]}
              onPress={handleGrantPermissionAndFinish}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaButtonText}>Allow Gallery & Start</Text>
              <Sparkles size={18} color="#000" />
            </TouchableOpacity>
          )}

          <Text style={styles.disclaimerText}>
            You can change photo permissions anytime in Device Settings.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoPill: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  logoText: {
    color: '#FF9500',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  skipText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePill: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  slideTitle: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  slideDesc: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  featureBox: {
    backgroundColor: '#141416',
    borderRadius: 14,
    padding: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: '#242426',
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureRowText: {
    color: '#D1D1D6',
    fontSize: 12,
    fontWeight: '500',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  paginationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#FF9500',
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#2C2C2E',
  },
  ctaButton: {
    backgroundColor: '#FF9500',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaButtonGlow: {
    backgroundColor: '#FF9500',
  },
  ctaButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  disclaimerText: {
    color: '#48484A',
    fontSize: 11,
    marginTop: 12,
    textAlign: 'center',
  },
});
