import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { CaptionTone, CarouselSlide, CuratedCarousel, FrameStyle, PhotoAsset } from '../types';
import { Library } from '../services/index/photoIndex';
import { suggestSwaps } from '../services/stories/swaps';
import { CarouselViewer } from './CarouselViewer';
import { CaptionStudio } from './CaptionStudio';

const STEPS = ['Photos', 'Frame', 'Caption', 'Share'] as const;

interface StoryBuilderProps {
  carousel: CuratedCarousel;
  library: Library | null;
  isPro: boolean;
  onChange: (c: CuratedCarousel) => void;
  onSelectFrame: (style: FrameStyle) => void;
  onRequirePro: () => void;
  onClose: () => void;
}

/** Step-by-step builder for one story: photos (swap/reorder) -> frame -> caption tone -> share. Mount to open; state resets per open. */
export const StoryBuilder: React.FC<StoryBuilderProps> = ({
  carousel, library, isPro, onChange, onSelectFrame, onRequirePro, onClose,
}) => {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [tone, setTone] = useState<CaptionTone>('minimal');

  const slides = carousel.slides;
  const target = selected != null ? slides[selected]?.photo : undefined;
  const suggestions = useMemo(
    () => (library && target ? suggestSwaps(library, slides.map((s) => s.photo), target) : []),
    [library, slides, target]
  );

  // Roles belong to positions (cover first, outro last); photo and its description move together.
  const update = (next: CarouselSlide[]) =>
    onChange({ ...carousel, slides: next.map((s, i) => ({ ...s, role: slides[i].role, slideIndex: i + 1 })) });

  const move = (i: number, d: number) => {
    const next = [...slides];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    Haptics.selectionAsync();
    update(next);
    setSelected(i + d);
  };

  const swap = (i: number, photo: PhotoAsset) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update(slides.map((s, j) => (j === i ? { ...s, id: `slide-${photo.id}`, photo, subtitle: undefined } : s)));
  };

  const last = step === STEPS.length - 1;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.title} numberOfLines={1}>{carousel.themeTitle}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{carousel.themeDescription}</Text>
          </View>
        </View>

        <View style={styles.steps}>
          {STEPS.map((name, i) => (
            <TouchableOpacity key={name} style={styles.stepTab} onPress={() => setStep(i)} accessibilityLabel={`Step ${i + 1}: ${name}`}>
              <View style={[styles.stepBar, i <= step && styles.stepBarDone]} />
              <Text style={[styles.stepText, i === step && styles.stepTextActive]}>{i + 1} {name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {step === 0 && (
            <View style={styles.photos}>
              <Text style={styles.hint}>Tap a photo to see similar ones to swap in. Use the arrows to reorder.</Text>
              {slides.map((s, i) => (
                <View key={s.id} style={[styles.slideCard, selected === i && styles.slideCardActive]}>
                  <View style={styles.slideHeader}>
                    <Text style={styles.slideNum}>{i + 1}</Text>
                    <Text style={styles.slideRole} numberOfLines={1}>{s.role}</Text>
                    <TouchableOpacity disabled={i === 0} onPress={() => move(i, -1)} hitSlop={8} style={styles.arrow} accessibilityLabel="Move earlier">
                      <ArrowUp size={18} color={i === 0 ? '#3A3A3C' : '#FFFFFF'} />
                    </TouchableOpacity>
                    <TouchableOpacity disabled={i === slides.length - 1} onPress={() => move(i, 1)} hitSlop={8} style={styles.arrow} accessibilityLabel="Move later">
                      <ArrowDown size={18} color={i === slides.length - 1 ? '#3A3A3C' : '#FFFFFF'} />
                    </TouchableOpacity>
                  </View>
                  {/* Full width at the post's 4:5 crop, so what you see is what gets shared. */}
                  <TouchableOpacity
                    onPress={() => setSelected(selected === i ? null : i)}
                    activeOpacity={0.9}
                    accessibilityLabel={`Slide ${i + 1}, ${s.role}. Show similar photos`}
                  >
                    <Image source={{ uri: s.photo.uri }} style={styles.photo} contentFit="cover" recyclingKey={s.id} />
                  </TouchableOpacity>
                  {selected === i && (
                    suggestions.length ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swapRow}>
                        {suggestions.map((p) => (
                          <TouchableOpacity key={p.id} onPress={() => swap(i, p)} activeOpacity={0.8} accessibilityLabel="Use this photo instead">
                            <Image source={{ uri: p.uri }} style={styles.swapThumb} contentFit="cover" recyclingKey={p.id} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text style={styles.hint}>No similar photos indexed yet.</Text>
                    )
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Stays mounted so aspect ratio, overlay and slide position survive step changes. */}
          <View style={step === 1 || step === 3 ? undefined : { display: 'none' }}>
            <CarouselViewer
              carousel={carousel}
              isPro={isPro}
              section={step === 3 ? 'share' : 'frame'}
              caption={carousel.captions[tone]}
              onSelectFrame={onSelectFrame}
              onRequirePro={onRequirePro}
            />
          </View>

          {step === 2 && (
            <CaptionStudio carousel={carousel} isPro={isPro} tone={tone} onTone={setTone} onRequirePro={onRequirePro} />
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          {step > 0 && (
            <TouchableOpacity style={[styles.navBtn, styles.backBtn]} onPress={() => setStep(step - 1)} activeOpacity={0.8}>
              <ArrowLeft size={16} color="#FFFFFF" />
              <Text style={[styles.navText, { color: '#FFFFFF' }]}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.navBtn} onPress={() => (last ? onClose() : setStep(step + 1))} activeOpacity={0.85}>
            <Text style={styles.navText}>{last ? 'Done' : `Next: ${STEPS[step + 1]}`}</Text>
            {!last && <ArrowRight size={16} color="#000000" />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0C' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  subtitle: { color: '#8E8E93', fontSize: 11, marginTop: 2 },
  steps: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
  stepTab: { flex: 1 },
  stepBar: { height: 3, borderRadius: 1.5, backgroundColor: '#2C2C2E', marginBottom: 6 },
  stepBarDone: { backgroundColor: '#FF9500' },
  stepText: { fontSize: 11, fontWeight: '700', color: '#636366' },
  stepTextActive: { color: '#FFFFFF' },
  photos: { paddingHorizontal: 16, gap: 12 },
  hint: { color: '#8E8E93', fontSize: 12, marginVertical: 6 },
  slideCard: { padding: 8, borderRadius: 14, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'transparent' },
  slideCardActive: { borderColor: '#FF9500' },
  slideHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingBottom: 6 },
  slideNum: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  slideRole: { flex: 1, color: '#8E8E93', fontSize: 12 },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 10, backgroundColor: '#2C2C2E' },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C2C2E' },
  swapRow: { gap: 8, paddingTop: 8 },
  swapThumb: { width: 96, height: 120, borderRadius: 8, backgroundColor: '#2C2C2E' },
  bottomBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#1C1C1E' },
  navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FF9500', paddingVertical: 14, borderRadius: 14 },
  backBtn: { flex: 0, paddingHorizontal: 18, backgroundColor: '#2C2C2E' },
  navText: { color: '#000000', fontSize: 14, fontWeight: '800' },
});
