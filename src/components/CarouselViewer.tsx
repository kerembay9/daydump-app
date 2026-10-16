import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Share2, Lock, Sparkles, Film, Square, BookOpen, Download, Check, Save } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import { CuratedCarousel, FrameStyle } from '../types';
import { ShareService } from '../services/shareService';

interface CarouselViewerProps {
  carousel: CuratedCarousel;
  isPro: boolean;
  onSelectFrame: (style: FrameStyle) => void;
  onShare: (slideIndex: number) => void;
  onRequirePro: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_WIDTH = SCREEN_WIDTH - 40;
// 4:5 Instagram Feed Aspect Ratio
const CAROUSEL_HEIGHT = Math.round(CAROUSEL_WIDTH * 1.25);
const CARD_GAP = 12;
const SNAP_INTERVAL = CAROUSEL_WIDTH + CARD_GAP;
const HORIZONTAL_PADDING = (SCREEN_WIDTH - CAROUSEL_WIDTH) / 2;

export const CarouselViewer: React.FC<CarouselViewerProps> = ({
  carousel,
  isPro,
  onSelectFrame,
  onShare,
  onRequirePro,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isSharingCard, setIsSharingCard] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  // References to rendered slide views for high-res view-shot export
  const slideRefs = useRef<(View | null)[]>([]);

  const snapOffsets = useMemo(
    () => carousel.slides.map((_, i) => i * SNAP_INTERVAL),
    [carousel.slides.length]
  );

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SNAP_INTERVAL);
    if (index !== activeIndex && index >= 0 && index < carousel.slides.length) {
      setActiveIndex(index);
      Haptics.selectionAsync();
    }
  };

  const scrollToIndex = (idx: number) => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: idx * SNAP_INTERVAL,
        animated: true,
      });
      setActiveIndex(idx);
      Haptics.selectionAsync();
    }
  };

  const handleFrameChange = (style: FrameStyle, isProOnly: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isProOnly && !isPro) {
      onRequirePro();
      return;
    }
    onSelectFrame(style);
  };

  /**
   * Capture and Share the currently active framed card
   */
  const handleShareRenderedCard = async () => {
    if (isSharingCard) return;
    setIsSharingCard(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const activeRef = slideRefs.current[activeIndex];
      let targetUri = carousel.slides[activeIndex]?.photo?.uri;

      if (activeRef) {
        targetUri = await captureRef(activeRef, {
          format: 'jpg',
          quality: 0.95,
          result: 'tmpfile',
        });
      }

      await ShareService.shareImage(
        targetUri,
        carousel.captions.minimal,
        carousel.suggestedTags
      );
    } catch (err) {
      console.warn('Error sharing rendered card:', err);
      // Fallback to basic share
      onShare(activeIndex);
    } finally {
      setIsSharingCard(false);
    }
  };

  /**
   * Save the current active rendered card to camera roll
   */
  const handleSaveActiveCard = async () => {
    if (isSavingCard) return;
    setIsSavingCard(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const activeRef = slideRefs.current[activeIndex];
      let targetUri = carousel.slides[activeIndex]?.photo?.uri;

      if (activeRef) {
        targetUri = await captureRef(activeRef, {
          format: 'jpg',
          quality: 0.95,
          result: 'tmpfile',
        });
      }

      const success = await ShareService.saveSlideToGallery(targetUri);
      if (success) {
        Alert.alert(
          'Slide Saved! 📸',
          `Slide ${activeIndex + 1} saved to your photos in "DayDump" album.`
        );
      }
    } catch (err) {
      console.warn('Error saving card:', err);
    } finally {
      setIsSavingCard(false);
    }
  };

  /**
   * Capture and Save all slides in order into the "DayDump" album
   */
  const handleSaveAllSlidesToAlbum = async () => {
    if (isExportingAll) return;
    setIsExportingAll(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const capturedUris: string[] = [];

      for (let i = 0; i < carousel.slides.length; i++) {
        const ref = slideRefs.current[i];
        if (ref) {
          try {
            const uri = await captureRef(ref, {
              format: 'jpg',
              quality: 0.95,
              result: 'tmpfile',
            });
            capturedUris.push(uri);
          } catch (e) {
            console.warn(`Failed to capture slide ${i}, falling back to raw uri:`, e);
            capturedUris.push(carousel.slides[i].photo.uri);
          }
        } else {
          capturedUris.push(carousel.slides[i].photo.uri);
        }
      }

      const savedCount = await ShareService.saveAllSlidesToAlbum(
        capturedUris,
        carousel.captions.minimal,
        carousel.suggestedTags
      );

      if (savedCount > 0) {
        Alert.alert(
          'Saved to DayDump Album! 📸',
          `All ${savedCount} curated slides have been saved in sequence to your camera roll. Caption and tags copied to clipboard — ready to post on Instagram!`
        );
      }
    } catch (err: any) {
      console.warn('Error saving all slides:', err);
      Alert.alert('Notice', 'Failed to save all slides. Please check gallery permissions.');
    } finally {
      setIsExportingAll(false);
    }
  };

  const currentSlide = carousel.slides[activeIndex] || carousel.slides[0];

  return (
    <View style={styles.container}>
      {/* Slide Header: Role Indicator & Action Buttons */}
      <View style={styles.slideHeader}>
        <View style={styles.roleContainer}>
          <Text style={styles.slideCounter}>
            {activeIndex + 1} / {carousel.slides.length}
          </Text>
          <Text style={styles.roleDot}>•</Text>
          <Text style={styles.roleText}>{currentSlide?.role}</Text>
        </View>

        <View style={styles.headerActions}>
          {/* Quick Save Current Slide */}
          <TouchableOpacity
            style={styles.quickSaveBtn}
            onPress={handleSaveActiveCard}
            disabled={isSavingCard}
            activeOpacity={0.8}
          >
            {isSavingCard ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Save size={14} color="#FFF" />
            )}
          </TouchableOpacity>

          {/* Share Rendered Card */}
          <TouchableOpacity
            style={styles.shareHeaderBtn}
            onPress={handleShareRenderedCard}
            disabled={isSharingCard}
            activeOpacity={0.8}
          >
            {isSharingCard ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Share2 size={14} color="#FFF" />
                <Text style={styles.shareBtnText}>Share Card</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* AI Visual Understanding Pill */}
      {currentSlide?.subtitle && (
        <View style={styles.visionDetailBadge}>
          <Sparkles size={11} color="#FF9500" style={{ marginRight: 4 }} />
          <Text style={styles.visionDetailText} numberOfLines={1}>
            {currentSlide.subtitle}
          </Text>
        </View>
      )}

      {/* 4:5 Aspect Ratio Swipeable Carousel */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        snapToOffsets={snapOffsets}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollWrapper}
        contentContainerStyle={styles.scrollContent}
      >
        {carousel.slides.map((slide, idx) => (
          <View
            key={slide.id}
            ref={(el) => {
              slideRefs.current[idx] = el;
            }}
            collapsable={false}
            style={[
              styles.slideCard,
              carousel.frameStyle === 'film35mm' && styles.frameFilm,
              carousel.frameStyle === 'editorial' && styles.frameEditorial,
              carousel.frameStyle === 'polaroid' && styles.framePolaroid,
            ]}
          >
            {/* Film 35mm Top Banner */}
            {carousel.frameStyle === 'film35mm' && (
              <View style={styles.filmTopBar}>
                <Text style={styles.filmSprocket}>■ ■ ■ ■ ■ ■ ■ ■</Text>
                <Text style={styles.filmText}>PORTRA 400 • 35mm</Text>
              </View>
            )}

            {/* Main Image */}
            <View style={styles.imageWrapper}>
              <Image
                source={{ uri: slide.photo.uri }}
                style={styles.slideImage}
                contentFit="cover"
                transition={200}
              />

              {/* Film Amber LED Date Stamp */}
              {carousel.frameStyle === 'film35mm' && (
                <View style={styles.filmDateStamp}>
                  <Text style={styles.filmDateText}>'26 10 15</Text>
                </View>
              )}

              {/* Watermark for Free Tier */}
              {!isPro && (
                <View style={styles.watermark}>
                  <Sparkles size={10} color="#FFF" style={{ marginRight: 3 }} />
                  <Text style={styles.watermarkText}>curated with DayDump</Text>
                </View>
              )}
            </View>

            {/* Editorial / Polaroid Bottom Label */}
            {carousel.frameStyle === 'editorial' && (
              <View style={styles.editorialBottom}>
                <Text style={styles.editorialTitle}>{carousel.themeTitle.toUpperCase()}</Text>
                <Text style={styles.editorialSubtitle}>PLATE {idx + 1} — FIG. 4</Text>
              </View>
            )}

            {carousel.frameStyle === 'polaroid' && (
              <View style={styles.polaroidBottom}>
                <Text style={styles.polaroidCaption}>{carousel.themeTitle}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Pagination Dots Indicator */}
      <View style={styles.paginationRow}>
        {carousel.slides.map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => scrollToIndex(i)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <View
              style={[
                styles.paginationDot,
                activeIndex === i ? styles.paginationDotActive : styles.paginationDotInactive,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Frame Style Switcher */}
      <View style={styles.framePicker}>
        <TouchableOpacity
          style={[styles.frameBtn, carousel.frameStyle === 'clean' && styles.frameBtnActive]}
          onPress={() => handleFrameChange('clean', false)}
        >
          <Square size={13} color={carousel.frameStyle === 'clean' ? '#FFF' : '#8E8E93'} />
          <Text style={[styles.frameBtnText, carousel.frameStyle === 'clean' && styles.frameBtnTextActive]}>
            Clean
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.frameBtn, carousel.frameStyle === 'film35mm' && styles.frameBtnActive]}
          onPress={() => handleFrameChange('film35mm', true)}
        >
          <Film size={13} color={carousel.frameStyle === 'film35mm' ? '#FF9500' : '#8E8E93'} />
          <Text style={[styles.frameBtnText, carousel.frameStyle === 'film35mm' && styles.frameBtnTextActive]}>
            35mm Film
          </Text>
          {!isPro && <Lock size={10} color="#FF9500" style={{ marginLeft: 4 }} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.frameBtn, carousel.frameStyle === 'editorial' && styles.frameBtnActive]}
          onPress={() => handleFrameChange('editorial', true)}
        >
          <BookOpen size={13} color={carousel.frameStyle === 'editorial' ? '#FF9500' : '#8E8E93'} />
          <Text style={[styles.frameBtnText, carousel.frameStyle === 'editorial' && styles.frameBtnTextActive]}>
            Editorial
          </Text>
          {!isPro && <Lock size={10} color="#FF9500" style={{ marginLeft: 4 }} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.frameBtn, carousel.frameStyle === 'polaroid' && styles.frameBtnActive]}
          onPress={() => handleFrameChange('polaroid', true)}
        >
          <Square size={13} color={carousel.frameStyle === 'polaroid' ? '#FF9500' : '#8E8E93'} />
          <Text style={[styles.frameBtnText, carousel.frameStyle === 'polaroid' && styles.frameBtnTextActive]}>
            Polaroid
          </Text>
          {!isPro && <Lock size={10} color="#FF9500" style={{ marginLeft: 4 }} />}
        </TouchableOpacity>
      </View>

      {/* Primary Multi-Slide Export: Save All Slides to Album */}
      <View style={styles.exportAllSection}>
        <TouchableOpacity
          style={[styles.saveAllBtn, isExportingAll && styles.saveAllBtnDisabled]}
          onPress={handleSaveAllSlidesToAlbum}
          disabled={isExportingAll}
          activeOpacity={0.85}
        >
          {isExportingAll ? (
            <>
              <ActivityIndicator size="small" color="#000" />
              <Text style={styles.saveAllBtnText}>Saving {carousel.slides.length} Slides to DayDump Album...</Text>
            </>
          ) : (
            <>
              <Download size={16} color="#000" />
              <Text style={styles.saveAllBtnText}>Save All {carousel.slides.length} Slides to Album</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  slideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slideCounter: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
  },
  roleDot: {
    color: '#3A3A3C',
    marginHorizontal: 6,
    fontSize: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E5EA',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickSaveBtn: {
    backgroundColor: '#2C2C2E',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  visionDetailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1E1C14',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.3)',
  },
  visionDetailText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFD60A',
    flex: 1,
  },
  scrollWrapper: {
    width: SCREEN_WIDTH,
  },
  scrollContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: CARD_GAP,
  },
  slideCard: {
    width: CAROUSEL_WIDTH,
    height: CAROUSEL_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
  imageWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  // Frames
  frameFilm: {
    backgroundColor: '#0C0C0C',
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#262626',
  },
  filmTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
  },
  filmSprocket: {
    color: '#333',
    fontSize: 10,
    letterSpacing: 2,
  },
  filmText: {
    color: '#FF9500',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  filmDateStamp: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  filmDateText: {
    color: '#FF9500',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: 'Courier',
  },
  frameEditorial: {
    backgroundColor: '#F5F4F0',
    padding: 16,
  },
  editorialBottom: {
    paddingTop: 12,
    alignItems: 'center',
  },
  editorialTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: 2,
  },
  editorialSubtitle: {
    fontSize: 9,
    color: '#8E8E93',
    letterSpacing: 1,
    marginTop: 2,
  },
  framePolaroid: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  polaroidBottom: {
    position: 'absolute',
    bottom: 12,
    left: 16,
  },
  polaroidCaption: {
    fontSize: 14,
    color: '#2C2C2E',
    fontStyle: 'italic',
    fontWeight: '600',
  },
  watermark: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  watermarkText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  paginationDot: {
    height: 5,
    borderRadius: 2.5,
  },
  paginationDotActive: {
    width: 18,
    backgroundColor: '#FF9500',
  },
  paginationDotInactive: {
    width: 5,
    backgroundColor: '#2C2C2E',
  },
  framePicker: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 16,
  },
  frameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  frameBtnActive: {
    backgroundColor: '#2C2C2E',
    borderColor: '#48484A',
  },
  frameBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    marginLeft: 5,
  },
  frameBtnTextActive: {
    color: '#FFFFFF',
  },
  exportAllSection: {
    marginTop: 14,
    paddingHorizontal: 16,
  },
  saveAllBtn: {
    backgroundColor: '#FF9500',
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  saveAllBtnDisabled: {
    opacity: 0.7,
  },
  saveAllBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.3,
  },
});
