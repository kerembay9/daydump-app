import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { Share2, Lock, Sparkles, Film, Square, BookOpen } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { CuratedCarousel, FrameStyle } from '../types';

interface CarouselViewerProps {
  carousel: CuratedCarousel;
  isPro: boolean;
  onSelectFrame: (style: FrameStyle) => void;
  onShare: (slideIndex: number) => void;
  onRequirePro: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_WIDTH = SCREEN_WIDTH - 32;
// 4:5 Instagram Feed Aspect Ratio
const CAROUSEL_HEIGHT = Math.round(CAROUSEL_WIDTH * 1.25);

export const CarouselViewer: React.FC<CarouselViewerProps> = ({
  carousel,
  isPro,
  onSelectFrame,
  onShare,
  onRequirePro,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / CAROUSEL_WIDTH);
    if (index !== activeIndex && index >= 0 && index < carousel.slides.length) {
      setActiveIndex(index);
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

  const currentSlide = carousel.slides[activeIndex] || carousel.slides[0];

  return (
    <View style={styles.container}>
      {/* Slide Header: Role Indicator & Share Button */}
      <View style={styles.slideHeader}>
        <View style={styles.roleContainer}>
          <Text style={styles.slideCounter}>
            {activeIndex + 1} / {carousel.slides.length}
          </Text>
          <Text style={styles.roleDot}>•</Text>
          <Text style={styles.roleText}>{currentSlide?.role}</Text>
        </View>

        <TouchableOpacity
          style={styles.shareHeaderBtn}
          onPress={() => onShare(activeIndex)}
          activeOpacity={0.8}
        >
          <Share2 size={15} color="#FFF" />
          <Text style={styles.shareBtnText}>Share Post</Text>
        </TouchableOpacity>
      </View>

      {/* 4:5 Aspect Ratio Swipeable Carousel */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollWrapper}
        contentContainerStyle={styles.scrollContent}
      >
        {carousel.slides.map((slide, idx) => (
          <View
            key={slide.id}
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
  shareHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollWrapper: {
    width: SCREEN_WIDTH,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
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
});
