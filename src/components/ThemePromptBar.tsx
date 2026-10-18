import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Sparkles, ArrowRight, Image as ImageIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface ThemePromptBarProps {
  isLoading: boolean;
  onCurateTheme: (themeQuery: string) => void;
  onPickFromGallery?: () => void;
}

const PRESET_CHIPS = [
  { id: 'today', title: "Today's Recap", query: '' },
  { id: 'dec', title: '6 Pics from Dec', query: '6 pics from december' },
  { id: 'summer', title: 'Summer Vacation', query: 'your summer vacation' },
  { id: 'coffee', title: 'Coffee Run', query: 'candid coffee bakery' },
  { id: 'golden', title: 'Golden Hour', query: 'golden hour sunset' },
];

export const ThemePromptBar: React.FC<ThemePromptBarProps> = ({
  isLoading,
  onCurateTheme,
  onPickFromGallery,
}) => {
  const [inputText, setInputText] = useState('');

  const handleSubmitCustom = () => {
    if (!inputText.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCurateTheme(inputText.trim());
  };

  const handleSelectChip = (chip: (typeof PRESET_CHIPS)[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputText(chip.query);
    onCurateTheme(chip.query);
  };

  return (
    <View style={styles.container}>
      {/* Search / Prompt Input */}
      <View style={styles.inputContainer}>
        <Sparkles size={16} color="#FF9500" style={styles.searchIcon} />
        <TextInput
          style={styles.textInput}
          placeholder='Write a theme (e.g. "6 pics from december")...'
          placeholderTextColor="#636366"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSubmitCustom}
          returnKeyType="go"
          editable={!isLoading}
        />
        {isLoading ? (
          <ActivityIndicator size="small" color="#FF9500" style={styles.actionBtn} />
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, !inputText.trim() && styles.actionBtnDisabled]}
            onPress={handleSubmitCustom}
            disabled={!inputText.trim()}
          >
            <ArrowRight size={16} color={inputText.trim() ? '#000' : '#8E8E93'} />
          </TouchableOpacity>
        )}
      </View>

      {/* Preset Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {onPickFromGallery && (
          <TouchableOpacity
            style={[styles.chip, styles.chipPick]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPickFromGallery();
            }}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <ImageIcon size={12} color="#0A84FF" style={styles.chipIcon} />
            <Text style={[styles.chipText, { color: '#0A84FF', fontWeight: '700' }]}>
              Pick Photos
            </Text>
          </TouchableOpacity>
        )}

        {PRESET_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={styles.chip}
            onPress={() => handleSelectChip(chip)}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <Text style={styles.chipText}>{chip.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  searchIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF9500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: {
    backgroundColor: '#2C2C2E',
  },
  chipsScroll: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  chipPick: {
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(10, 132, 255, 0.3)',
  },
  chipIcon: {
    marginRight: 4,
  },
  chipText: {
    color: '#E5E5EA',
    fontSize: 12,
    fontWeight: '600',
  },
});
