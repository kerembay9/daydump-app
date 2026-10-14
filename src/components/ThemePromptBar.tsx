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
import { Sparkles, Lock, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface ThemePromptBarProps {
  isPro: boolean;
  isLoading: boolean;
  onCurateTheme: (themeQuery: string, isCustom: boolean) => void;
  onRequirePro: () => void;
}

const PRESET_CHIPS = [
  { id: 'today', title: "Today's Recap", query: '', isProOnly: false },
  { id: 'dec', title: '6 Pics from Dec', query: '6 pics from december', isProOnly: true },
  { id: 'summer', title: 'Summer Vacation', query: 'your summer vacation', isProOnly: true },
  { id: 'coffee', title: 'Coffee Run', query: 'candid coffee bakery', isProOnly: true },
  { id: 'golden', title: 'Golden Hour', query: 'golden hour sunset', isProOnly: true },
];

export const ThemePromptBar: React.FC<ThemePromptBarProps> = ({
  isPro,
  isLoading,
  onCurateTheme,
  onRequirePro,
}) => {
  const [inputText, setInputText] = useState('');

  const handleSubmitCustom = () => {
    if (!inputText.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Custom prompts are a core Pro feature in the Aggressive Creator Model
    if (!isPro) {
      onRequirePro();
      return;
    }

    onCurateTheme(inputText.trim(), true);
  };

  const handleSelectChip = (chip: (typeof PRESET_CHIPS)[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (chip.isProOnly && !isPro) {
      onRequirePro();
      return;
    }

    setInputText(chip.query);
    onCurateTheme(chip.query, chip.isProOnly);
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
        {PRESET_CHIPS.map((chip) => {
          const isLocked = chip.isProOnly && !isPro;
          return (
            <TouchableOpacity
              key={chip.id}
              style={[styles.chip, isLocked && styles.chipLocked]}
              onPress={() => handleSelectChip(chip)}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              {isLocked ? (
                <Lock size={11} color="#FF9500" style={styles.chipIcon} />
              ) : null}
              <Text style={[styles.chipText, isLocked && styles.chipTextLocked]}>
                {chip.title}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  chipLocked: {
    backgroundColor: 'rgba(255, 149, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.3)',
  },
  chipIcon: {
    marginRight: 4,
  },
  chipText: {
    color: '#E5E5EA',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextLocked: {
    color: '#FF9500',
  },
});
