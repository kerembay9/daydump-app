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
import {
  Share2,
  Lock,
  Sparkles,
  Film,
  Square,
  BookOpen,
  Download,
  Check,
  Save,
  Heart,
  MessageCircle,
  Bookmark,
  Send,
  MoreHorizontal,
  Music2,
  Search,
  Grid3x3,
  Smartphone,
  EyeOff,
  Layers,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import { CuratedCarousel, FrameStyle } from '../types';
import { ShareService } from '../services/shareService';

export type AspectRatioMode = '4:5' | '9:16';
export type PreviewOverlayMode = 'none' | 'instagram' | 'tiktok' | 'grid_1x1';

export type ViewerSection = 'frame' | 'share';

interface CarouselViewerProps {
  carousel: CuratedCarousel;
  isPro: boolean;
  /** which builder step's tools to show: frame = aspect + frame picker, share = overlays + save/share */
  section: ViewerSection;
  /** caption copied on share/save, in the tone picked in the caption step */
  caption: string;
  onSelectFrame: (style: FrameStyle) => void;
  onRequirePro: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_WIDTH = SCREEN_WIDTH - 40;
const CARD_GAP = 12;
const SNAP_INTERVAL = CAROUSEL_WIDTH + CARD_GAP;
const HORIZONTAL_PADDING = (SCREEN_WIDTH - CAROUSEL_WIDTH) / 2;

const formatFilmDate = (timestamp?: number): string => {
  const d = timestamp ? new Date(timestamp) : new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `'${yy} ${mm} ${dd}`;
};

export const CarouselViewer: React.FC<CarouselViewerProps> = ({
  carousel,
  isPro,
  section,
  caption,
  onSelectFrame,
  onRequirePro,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('4:5');
  const [overlayChoice, setPreviewOverlay] = useState<PreviewOverlayMode>('none');
  const previewOverlay = section === 'share' ? overlayChoice : 'none';
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isSharingCard, setIsSharingCard] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  // References to rendered slide views for high-res view-shot export
  const slideRefs = useRef<(View | null)[]>([]);

  const cardHeight =
    aspectRatio === '9:16'
      ? Math.round(CAROUSEL_WIDTH * (16 / 9))
      : Math.round(CAROUSEL_WIDTH * 1.25);

  const gridCutoffHeight = Math.max(0, Math.round((cardHeight - CAROUSEL_WIDTH) / 2));
  const isExporting = isExportingAll || isSavingCard || isSharingCard;

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
        caption,
        carousel.suggestedTags
      );
    } catch (err) {
      console.warn('Error sharing rendered card:', err);
      // Fallback to basic share
      await ShareService.shareImage(carousel.slides[activeIndex].photo.uri, caption, carousel.suggestedTags);
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
        // Bring card into active viewport and allow GPU 120ms to rasterize
        scrollToIndex(i);
        await new Promise((resolve) => setTimeout(resolve, 120));

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

      // Return carousel to first slide
      scrollToIndex(0);

      const savedCount = await ShareService.saveAllSlidesToAlbum(
        capturedUris,
        caption,
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

        {section === 'share' && <View style={styles.headerActions}>
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
        </View>}
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

      {/* Studio Toolbar: Aspect Ratio Switcher & Platform Ghost UI Overlays */}
      <View style={styles.studioToolbar}>
        {/* Aspect Ratio Toggle */}
        {section === 'frame' && <View style={styles.toolbarSection}>
          <Text style={styles.toolbarLabel}>ASPECT RATIO</Text>
          <View style={styles.pillGroup}>
            <TouchableOpacity
              style={[
                styles.ratioPill,
                aspectRatio === '4:5' && styles.ratioPillActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setAspectRatio('4:5');
              }}
              activeOpacity={0.7}
            >
              <Smartphone size={11} color={aspectRatio === '4:5' ? '#000' : '#8E8E93'} />
              <Text
                style={[
                  styles.ratioPillText,
                  aspectRatio === '4:5' && styles.ratioPillTextActive,
                ]}
              >
                4:5 IG Feed
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.ratioPill,
                aspectRatio === '9:16' && styles.ratioPillActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setAspectRatio('9:16');
              }}
              activeOpacity={0.7}
            >
              <Smartphone size={11} color={aspectRatio === '9:16' ? '#000' : '#8E8E93'} />
              <Text
                style={[
                  styles.ratioPillText,
                  aspectRatio === '9:16' && styles.ratioPillTextActive,
                ]}
              >
                9:16 TikTok / Story
              </Text>
            </TouchableOpacity>
          </View>
        </View>}

        {/* Platform Preview Overlay Toggle */}
        {section === 'share' && <View style={styles.toolbarSection}>
          <Text style={styles.toolbarLabel}>PREVIEW OVERLAY</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.overlayPillScroll}
          >
            <TouchableOpacity
              style={[
                styles.overlayPill,
                previewOverlay === 'none' && styles.overlayPillActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setPreviewOverlay('none');
              }}
              activeOpacity={0.7}
            >
              <EyeOff size={11} color={previewOverlay === 'none' ? '#000' : '#8E8E93'} />
              <Text
                style={[
                  styles.overlayPillText,
                  previewOverlay === 'none' && styles.overlayPillTextActive,
                ]}
              >
                Clean
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.overlayPill,
                previewOverlay === 'instagram' && styles.overlayPillActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setPreviewOverlay('instagram');
              }}
              activeOpacity={0.7}
            >
              <Layers size={11} color={previewOverlay === 'instagram' ? '#000' : '#8E8E93'} />
              <Text
                style={[
                  styles.overlayPillText,
                  previewOverlay === 'instagram' && styles.overlayPillTextActive,
                ]}
              >
                Instagram UI
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.overlayPill,
                previewOverlay === 'tiktok' && styles.overlayPillActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setPreviewOverlay('tiktok');
              }}
              activeOpacity={0.7}
            >
              <Music2 size={11} color={previewOverlay === 'tiktok' ? '#000' : '#8E8E93'} />
              <Text
                style={[
                  styles.overlayPillText,
                  previewOverlay === 'tiktok' && styles.overlayPillTextActive,
                ]}
              >
                TikTok UI
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.overlayPill,
                previewOverlay === 'grid_1x1' && styles.overlayPillActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setPreviewOverlay('grid_1x1');
              }}
              activeOpacity={0.7}
            >
              <Grid3x3 size={11} color={previewOverlay === 'grid_1x1' ? '#000' : '#8E8E93'} />
              <Text
                style={[
                  styles.overlayPillText,
                  previewOverlay === 'grid_1x1' && styles.overlayPillTextActive,
                ]}
              >
                1:1 Grid Check
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>}
      </View>

      {/* Swipeable Carousel */}
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
              { height: cardHeight },
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
                  <Text style={styles.filmDateText}>
                    {formatFilmDate(slide.photo.creationTime)}
                  </Text>
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
                <Text style={styles.editorialSubtitle}>PLATE {idx + 1} — FIG. {idx + 1}</Text>
              </View>
            )}

            {carousel.frameStyle === 'polaroid' && (
              <View style={styles.polaroidBottom}>
                <Text style={styles.polaroidCaption}>{carousel.themeTitle}</Text>
              </View>
            )}

            {/* ======================================================== */}
            {/* PREVIEW ONLY: Social Platform Ghost Overlays & Safe Zones */}
            {/* Hidden during export to keep saved photos pristine!      */}
            {/* ======================================================== */}
            {!isExporting && activeIndex === idx && previewOverlay === 'instagram' && (
              <View style={styles.overlayContainer} pointerEvents="none">
                {/* Instagram Header */}
                <View style={styles.igHeader}>
                  <View style={styles.igUserRow}>
                    <View style={styles.igAvatar} />
                    <Text style={styles.igUsername}>your_account</Text>
                    <Text style={styles.igFollow}>• Follow</Text>
                  </View>
                  <MoreHorizontal size={18} color="#FFFFFF" />
                </View>

                {/* Instagram Slide Counter Tag */}
                <View style={styles.igCounterBadge}>
                  <Text style={styles.igCounterText}>
                    {idx + 1}/{carousel.slides.length}
                  </Text>
                </View>

                {/* Instagram Bottom Actions Bar */}
                <View style={styles.igBottomContainer}>
                  <View style={styles.igActionRow}>
                    <View style={styles.igActionLeft}>
                      <Heart size={22} color="#FFFFFF" />
                      <MessageCircle size={22} color="#FFFFFF" style={{ marginLeft: 14 }} />
                      <Send size={20} color="#FFFFFF" style={{ marginLeft: 14 }} />
                    </View>
                    <Bookmark size={22} color="#FFFFFF" />
                  </View>
                  <Text style={styles.igLikesText}>1,482 likes</Text>
                  <Text style={styles.igCaptionText} numberOfLines={2}>
                    <Text style={styles.igCaptionUser}>your_account </Text>
                    {caption || 'Weekend camera roll moments ✨'}
                  </Text>
                </View>
              </View>
            )}

            {!isExporting && activeIndex === idx && previewOverlay === 'tiktok' && (
              <View style={styles.overlayContainer} pointerEvents="none">
                {/* TikTok Header */}
                <View style={styles.ttHeader}>
                  <Text style={styles.ttTabInactive}>Following</Text>
                  <View style={styles.ttTabActiveWrapper}>
                    <Text style={styles.ttTabActive}>For You</Text>
                    <View style={styles.ttTabIndicator} />
                  </View>
                  <Search size={18} color="#FFFFFF" style={styles.ttSearchIcon} />
                </View>

                {/* TikTok Right Action Rail */}
                <View style={styles.ttRightRail}>
                  <View style={styles.ttAvatarContainer}>
                    <View style={styles.ttAvatar} />
                    <View style={styles.ttAvatarPlus}>
                      <Text style={styles.ttAvatarPlusText}>+</Text>
                    </View>
                  </View>

                  <View style={styles.ttActionButton}>
                    <Heart size={24} color="#FFFFFF" />
                    <Text style={styles.ttActionCount}>52.4K</Text>
                  </View>

                  <View style={styles.ttActionButton}>
                    <MessageCircle size={24} color="#FFFFFF" />
                    <Text style={styles.ttActionCount}>642</Text>
                  </View>

                  <View style={styles.ttActionButton}>
                    <Bookmark size={24} color="#FFFFFF" />
                    <Text style={styles.ttActionCount}>2.8K</Text>
                  </View>

                  <View style={styles.ttActionButton}>
                    <Share2 size={24} color="#FFFFFF" />
                    <Text style={styles.ttActionCount}>1.1K</Text>
                  </View>

                  <View style={styles.ttVinylContainer}>
                    <View style={styles.ttVinylDisc}>
                      <Music2 size={12} color="#FFFFFF" />
                    </View>
                  </View>
                </View>

                {/* TikTok Bottom Metadata */}
                <View style={styles.ttBottomMeta}>
                  <Text style={styles.ttUsername}>@your_account</Text>
                  <Text style={styles.ttCaption} numberOfLines={2}>
                    {caption || 'Sunday photo dump 📸'} #daydump #aesthetic #carousel
                  </Text>
                  <View style={styles.ttAudioRow}>
                    <Music2 size={11} color="#FFFFFF" />
                    <Text style={styles.ttAudioText} numberOfLines={1}>
                      original sound - ambient weekend vibes
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {!isExporting && activeIndex === idx && previewOverlay === 'grid_1x1' && (
              <View style={styles.overlayContainer} pointerEvents="none">
                {/* Top Mask */}
                {gridCutoffHeight > 0 && (
                  <View style={[styles.gridCutoffMask, { top: 0, height: gridCutoffHeight }]}>
                    <Text style={styles.gridCutoffLabel}>HIDDEN ON PROFILE GRID</Text>
                  </View>
                )}

                {/* Center 1:1 Instagram Profile Square */}
                <View
                  style={[
                    styles.gridCenterSquare,
                    {
                      top: gridCutoffHeight,
                      height: CAROUSEL_WIDTH,
                    },
                  ]}
                >
                  {/* Rule of thirds grid lines */}
                  <View style={[styles.gridThirdsLine, { top: '33.3%' }]} />
                  <View style={[styles.gridThirdsLine, { top: '66.6%' }]} />
                  <View style={[styles.gridThirdsLineVertical, { left: '33.3%' }]} />
                  <View style={[styles.gridThirdsLineVertical, { left: '66.6%' }]} />

                  <View style={styles.gridCenterBadge}>
                    <Grid3x3 size={11} color="#FFF" style={{ marginRight: 4 }} />
                    <Text style={styles.gridCenterBadgeText}>1:1 Instagram Profile Crop</Text>
                  </View>
                </View>

                {/* Bottom Mask */}
                {gridCutoffHeight > 0 && (
                  <View style={[styles.gridCutoffMask, { bottom: 0, height: gridCutoffHeight }]}>
                    <Text style={styles.gridCutoffLabel}>HIDDEN ON PROFILE GRID</Text>
                  </View>
                )}
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
      {section === 'frame' && <View style={styles.framePicker}>
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
      </View>}

      {/* Primary Multi-Slide Export: Save All Slides to Album */}
      {section === 'share' && <View style={styles.exportAllSection}>
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
      </View>}
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
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    position: 'relative',
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

  // Studio Toolbar
  studioToolbar: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#161618',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#262628',
    gap: 8,
  },
  toolbarSection: {
    gap: 6,
  },
  toolbarLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#8E8E93',
    letterSpacing: 1.2,
  },
  pillGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  ratioPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#242426',
    borderWidth: 1,
    borderColor: '#333336',
  },
  ratioPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  ratioPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
  },
  ratioPillTextActive: {
    color: '#000000',
  },
  overlayPillScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  overlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#242426',
    borderWidth: 1,
    borderColor: '#333336',
  },
  overlayPillActive: {
    backgroundColor: '#FF9500',
    borderColor: '#FF9500',
  },
  overlayPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
  },
  overlayPillTextActive: {
    color: '#000000',
  },

  // Overlay Container
  overlayContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    justifyContent: 'space-between',
  },

  // Instagram UI
  igHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  igUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  igAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1.5,
    borderColor: '#E1306C',
    marginRight: 8,
  },
  igUsername: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  igFollow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3897F0',
    marginLeft: 6,
  },
  igCounterBadge: {
    position: 'absolute',
    top: 14,
    right: 38,
    backgroundColor: 'rgba(18,18,18,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  igCounterText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  igBottomContainer: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  igActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  igActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  igLikesText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  igCaptionText: {
    fontSize: 11,
    color: '#E5E5EA',
    lineHeight: 15,
  },
  igCaptionUser: {
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // TikTok UI
  ttHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 8,
    position: 'relative',
  },
  ttTabInactive: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginRight: 16,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ttTabActiveWrapper: {
    alignItems: 'center',
  },
  ttTabActive: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ttTabIndicator: {
    width: 24,
    height: 2,
    backgroundColor: '#FFFFFF',
    marginTop: 4,
    borderRadius: 1,
  },
  ttSearchIcon: {
    position: 'absolute',
    right: 14,
    top: 14,
  },
  ttRightRail: {
    position: 'absolute',
    right: 8,
    bottom: 40,
    alignItems: 'center',
    gap: 14,
  },
  ttAvatarContainer: {
    alignItems: 'center',
    marginBottom: 2,
  },
  ttAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333336',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  ttAvatarPlus: {
    position: 'absolute',
    bottom: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FE2C55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ttAvatarPlusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  ttActionButton: {
    alignItems: 'center',
    gap: 2,
  },
  ttActionCount: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ttVinylContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E22',
    borderWidth: 6,
    borderColor: '#111113',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  ttVinylDisc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ttBottomMeta: {
    position: 'absolute',
    left: 12,
    right: 70,
    bottom: 14,
  },
  ttUsername: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ttCaption: {
    fontSize: 11,
    color: '#F2F2F7',
    lineHeight: 15,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ttAudioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ttAudioText: {
    fontSize: 10,
    color: '#E5E5EA',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // 1:1 Profile Grid Check
  gridCutoffMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  gridCutoffLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FF453A',
    letterSpacing: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  gridCenterSquare: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    borderStyle: 'dashed',
    zIndex: 11,
  },
  gridThirdsLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridThirdsLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridCenterBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  gridCenterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
