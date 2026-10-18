import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw } from 'lucide-react-native';
import { Story } from '../services/stories';

/** etaSec is null until enough photos are done for a stable rate. */
export type IndexProgress = { done: number; total: number; etaSec: number | null };

const eta = (s: number | null) => (s == null ? 'estimating…' : s < 60 ? 'under a minute left' : `~${Math.round(s / 60)} min left`);

interface StoryCardsRowProps {
  stories: Story[];
  progress: IndexProgress | null;
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
        {!progress && (
          <TouchableOpacity onPress={onShuffle} hitSlop={10} accessibilityLabel="Show different stories">
            <RefreshCw size={14} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </View>
      {progress && (
        <View style={styles.status} accessibilityLabel={`Reading your library, ${progress.done} of ${progress.total} photos, ${eta(progress.etaSec)}`}>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }]} />
          </View>
          <Text style={styles.progress}>
            Reading your library · {progress.done.toLocaleString()} of {progress.total.toLocaleString()} · {eta(progress.etaSec)}
          </Text>
          <Text style={styles.hint}>
            {stories.length ? 'Newest photos first. More stories appear as it goes.' : 'Newest photos first. Your first stories appear in a few seconds.'}
          </Text>
        </View>
      )}
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
  status: { paddingHorizontal: 16, marginBottom: 10 },
  bar: { height: 3, borderRadius: 2, backgroundColor: '#2C2C2E', overflow: 'hidden', marginBottom: 6 },
  fill: { height: '100%', backgroundColor: '#FF9500' },
  progress: { fontSize: 11, color: '#C7C7CC' },
  hint: { fontSize: 10, color: '#8E8E93', marginTop: 2 },
  row: { paddingHorizontal: 16, gap: 10 },
  card: { width: 132, height: 176, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1C1C1E', borderWidth: 2, borderColor: 'transparent' },
  cardActive: { borderColor: '#FF9500' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  text: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  title: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 17 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 3 },
});
