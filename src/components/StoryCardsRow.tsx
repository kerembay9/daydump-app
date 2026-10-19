import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw } from 'lucide-react-native';
import { Story } from '../services/stories';

/**
 * etaSec is null until enough photos are done for a stable rate. since/camera describe the photo just indexed.
 * batteryPct: set while the native fast mode runs (keeps going after the user leaves); null = charging, no cost.
 */
export type IndexProgress = { done: number; total: number; etaSec: number | null; since: number; camera: boolean; batteryPct?: number | null };

const ago = (t: number) => {
  const d = (Date.now() - t) / 864e5;
  return d < 14 ? `${Math.max(1, Math.round(d))} days` : d < 60 ? `${Math.round(d / 7)} weeks` : d < 730 ? `${Math.round(d / 30)} months` : `${Math.round(d / 365)} years`;
};
/** What the stories can draw on so far. Indexing goes camera newest-first, then the rest. Undated photos (1970) come last. */
const coverage = (p: IndexProgress) =>
  !p.camera ? 'All camera photos done. Now adding chats, downloads and other albums.'
  : p.since < 1e12 ? 'Almost done with camera photos.'
  : `Stories now cover your camera photos from the last ${ago(p.since)}.`;

const battery = (pct: number | null) => (pct == null ? 'charging, no battery cost' : pct >= 1 ? `uses ~${pct}% battery` : 'uses a little battery');

const eta = (s: number | null) => (s == null ? 'estimating…' : s < 60 ? 'under a minute left' : `~${Math.round(s / 60)} min left`);

interface StoryCardsRowProps {
  stories: Story[];
  progress: IndexProgress | null;
  activeId?: string;
  onSelect: (story: Story) => void;
  onShuffle: () => void;
  /** A fast run the user paused: shown with Resume until it continues (Resume, or the next charge). */
  paused: { done: number; total: number } | null;
  onPause: () => void;
  onResume: () => void;
}

export const StoryCardsRow: React.FC<StoryCardsRowProps> = ({ stories, progress, activeId, onSelect, onShuffle, paused, onPause, onResume }) => {
  if (!stories.length && !progress && !paused) return null;
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
            {stories.length ? `${coverage(progress)} More stories appear as it goes.` : 'Newest photos first. Your first stories appear in a few seconds.'}
          </Text>
          {progress.batteryPct !== undefined ? (
            // Same facts as its notification (BackgroundIndex.kt), and the same Pause
            <View style={styles.line}>
              <Text style={styles.hint}>Keeps going if you leave · {battery(progress.batteryPct)}</Text>
              <TouchableOpacity onPress={onPause} hitSlop={10} accessibilityRole="button">
                <Text style={styles.action}>Pause</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // BackgroundIndex.kt's charging-only job picks up where this left off; only worth saying when there's a wait
            Platform.OS === 'android' && (progress.etaSec ?? 0) > 60 && (
              <Text style={styles.hint}>You can leave the app: it keeps going while your phone charges.</Text>
            )
          )}
        </View>
      )}
      {!progress && paused && (
        <View style={styles.status}>
          <View style={styles.bar}>
            <View style={[styles.fill, styles.fillPaused, { width: `${(100 * paused.done) / Math.max(1, paused.total)}%` }]} />
          </View>
          <View style={styles.line}>
            <Text style={styles.progress}>Paused at {paused.done.toLocaleString()} of {paused.total.toLocaleString()}</Text>
            <TouchableOpacity onPress={onResume} hitSlop={10} accessibilityRole="button">
              <Text style={styles.action}>Resume</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Continues by itself next time you charge.</Text>
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
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { fontSize: 11, fontWeight: '700', color: '#FF9500' },
  fillPaused: { backgroundColor: '#636366' },
  row: { paddingHorizontal: 16, gap: 10 },
  card: { width: 132, height: 176, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1C1C1E', borderWidth: 2, borderColor: 'transparent' },
  cardActive: { borderColor: '#FF9500' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  text: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  title: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 17 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 3 },
});
