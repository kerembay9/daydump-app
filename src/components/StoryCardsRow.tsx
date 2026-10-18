import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw } from 'lucide-react-native';
import { Story } from '../services/stories';

interface StoryCardsRowProps {
  stories: Story[];
  progress: { done: number; total: number } | null;
  activeId?: string;
  onSelect: (story: Story) => void;
  onShuffle: () => void;
}

export const StoryCardsRow: React.FC<StoryCardsRowProps> = ({ stories, progress, activeId, onSelect, onShuffle }) => {
  if (!stories.length && !progress) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.heading}>STORIES FOR YOU</Text>
        {progress ? (
          <Text style={styles.progress}>Reading your library {progress.done}/{progress.total}</Text>
        ) : (
          <TouchableOpacity onPress={onShuffle} hitSlop={10} accessibilityLabel="Show different stories">
            <RefreshCw size={14} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {stories.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.card, s.id === activeId && styles.cardActive]}
            onPress={() => onSelect(s)}
            activeOpacity={0.85}
            accessibilityLabel={`${s.title}, ${s.subtitle}`}
          >
            <Image source={{ uri: s.picks[0]?.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={s.id} />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.shade} />
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={2}>{s.title}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{s.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  heading: { fontSize: 11, fontWeight: '800', color: '#8E8E93', letterSpacing: 1 },
  progress: { fontSize: 11, color: '#8E8E93' },
  row: { paddingHorizontal: 16, gap: 10 },
  card: { width: 132, height: 176, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1C1C1E', borderWidth: 2, borderColor: 'transparent' },
  cardActive: { borderColor: '#FF9500' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  text: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  title: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 17 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 3 },
});
