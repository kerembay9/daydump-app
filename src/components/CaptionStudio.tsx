import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Copy, Check, Lock, Music2, Hash } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { CaptionTone, CuratedCarousel } from '../types';
import { ShareService } from '../services/shareService';

interface CaptionStudioProps {
  carousel: CuratedCarousel;
  isPro: boolean;
  tone: CaptionTone;
  onTone: (tone: CaptionTone) => void;
  onRequirePro: () => void;
}

export const CaptionStudio: React.FC<CaptionStudioProps> = ({
  carousel,
  isPro,
  tone: selectedTone,
  onTone: setSelectedTone,
  onRequirePro,
}) => {
  const [copied, setCopied] = useState(false);

  const handleSelectTone = (tone: CaptionTone, isProOnly: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isProOnly && !isPro) {
      onRequirePro();
      return;
    }
    setSelectedTone(tone);
    setCopied(false);
  };

  const currentCaption = carousel.captions[selectedTone];

  const handleCopy = async () => {
    const success = await ShareService.copyCaptionToClipboard(
      currentCaption,
      carousel.suggestedTags
    );
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <View style={styles.container}>
      {/* Tone Switcher Tabs */}
      <View style={styles.tabsHeader}>
        <TouchableOpacity
          style={[styles.tab, selectedTone === 'minimal' && styles.tabActive]}
          onPress={() => handleSelectTone('minimal', false)}
        >
          <Text style={[styles.tabText, selectedTone === 'minimal' && styles.tabTextActive]}>
            Aesthetic
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedTone === 'witty' && styles.tabActive]}
          onPress={() => handleSelectTone('witty', true)}
        >
          <Text style={[styles.tabText, selectedTone === 'witty' && styles.tabTextActive]}>
            Witty
          </Text>
          {!isPro && <Lock size={10} color="#FF9500" style={{ marginLeft: 4 }} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedTone === 'story' && styles.tabActive]}
          onPress={() => handleSelectTone('story', true)}
        >
          <Text style={[styles.tabText, selectedTone === 'story' && styles.tabTextActive]}>
            Story
          </Text>
          {!isPro && <Lock size={10} color="#FF9500" style={{ marginLeft: 4 }} />}
        </TouchableOpacity>
      </View>

      {/* Caption Content Box */}
      <View style={styles.captionBox}>
        <Text style={styles.captionText}>{currentCaption}</Text>

        <TouchableOpacity
          style={[styles.copyBtn, copied && styles.copyBtnSuccess]}
          onPress={handleCopy}
          activeOpacity={0.8}
        >
          {copied ? (
            <>
              <Check size={14} color="#30D158" />
              <Text style={styles.copiedText}>Copied for Instagram</Text>
            </>
          ) : (
            <>
              <Copy size={14} color="#8E8E93" />
              <Text style={styles.copyBtnText}>Copy Caption</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Suggested Audio Vibe */}
      <View style={styles.audioRow}>
        <Music2 size={13} color="#FF9500" />
        <Text style={styles.audioLabel}>Trending Sound Match:</Text>
        <Text style={styles.audioText}>{carousel.suggestedAudioVibe}</Text>
      </View>

      {/* Suggested Hashtags */}
      <View style={styles.tagsContainer}>
        {carousel.suggestedTags.map((tag, idx) => (
          <View key={idx} style={styles.tagPill}>
            <Hash size={10} color="#8E8E93" style={{ marginRight: 2 }} />
            <Text style={styles.tagText}>{tag.replace('#', '')}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  tabsHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#2C2C2E',
  },
  tabActive: {
    backgroundColor: '#3A3A3C',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  captionBox: {
    backgroundColor: '#121212',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  captionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
    fontWeight: '500',
    marginBottom: 10,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
  },
  copyBtnSuccess: {
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  copiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#30D158',
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  audioLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },
  audioText: {
    fontSize: 11,
    color: '#FF9500',
    fontWeight: '700',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
});
