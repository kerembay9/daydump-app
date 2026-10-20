import React from 'react';
import { Platform, Text, View } from 'react-native';
import type { IndexProgress } from '../state/AppState';
import { useTheme } from '../theme/ThemeProvider';
import { ui } from '../theme/type';
import { FrameCard } from './ui/FrameCard';
import { Tap } from './ui/Tap';

const ago = (t: number) => {
  const d = (Date.now() - t) / 864e5;
  return d < 14 ? `${Math.max(1, Math.round(d))} days` : d < 60 ? `${Math.round(d / 7)} weeks` : d < 730 ? `${Math.round(d / 30)} months` : `${Math.round(d / 365)} years`;
};
/** What the stories can draw on so far. Indexing goes camera newest-first, then the rest. Undated photos (1970) come last. */
const coverage = (p: IndexProgress) =>
  !p.camera ? 'All camera photos done. Now adding chats, downloads and other albums.'
  : p.since < 1e12 ? 'Almost done with camera photos.'
  : `Dumps now cover your camera photos from the last ${ago(p.since)}.`;
/** batteryPct null = charging, no cost */
const battery = (pct: number | null) => (pct == null ? 'charging, no battery cost' : pct >= 1 ? `uses ~${pct}% battery` : 'uses a little battery');
const eta = (s: number | null) => (s == null ? 'estimating…' : s < 60 ? 'under a minute' : `~${Math.round(s / 60)} min`);
const n = (x: number) => x.toLocaleString();

/**
 * Slim indexing status under the Discover header: progress + ETA, the native fast mode's battery line with Pause
 * (same facts as its notification, BackgroundIndex.kt), or the paused state with Resume. Nothing when idle.
 */
export function IndexStrip({ progress, paused, hasStories, onPause, onResume }: {
  progress: IndexProgress | null;
  paused: { done: number; total: number } | null;
  hasStories: boolean;
  onPause: () => void;
  onResume: () => void;
}) {
  const { t } = useTheme();
  if (!progress && !paused) return null;
  const fast = progress?.batteryPct !== undefined;
  const done = progress?.done ?? paused!.done, total = progress?.total ?? paused!.total;

  const line1 = progress ? `Reading your library · ${n(done)}/${n(total)} · ${eta(progress.etaSec)}` : `Paused at ${n(done)} of ${n(total)}`;
  const line2 = !progress ? 'Continues by itself next time you charge.'
    : fast ? `Keeps going if you leave · ${battery(progress.batteryPct ?? null)}`
    // BackgroundIndex.kt's charging-only job picks up where this left off; only worth saying when there's a wait
    : Platform.OS === 'android' && (progress.etaSec ?? 0) > 60 ? 'You can leave the app: it keeps going while your phone charges.'
    : hasStories ? coverage(progress) : 'Newest photos first. Your first dumps appear in a few seconds.';
  const action = !progress ? { label: 'Resume', on: onResume } : fast ? { label: 'Pause', on: onPause } : null;

  return (
    <FrameCard
      radius={14}
      style={{ paddingVertical: 9, paddingHorizontal: 12, marginBottom: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${line1}. ${line2}`}>
          <Text style={[ui(11.5, 600), { color: t.ink }]}>{line1}</Text>
          <Text style={[ui(10.5, 400), { color: t.inkMuted }]}>{line2}</Text>
        </View>
        {action && (
          <Tap onPress={action.on} hitSlop={8} accessibilityRole="button" style={{ height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: t.ink, justifyContent: 'center' }}>
            <Text style={[ui(11, 600), { color: t.bgScreen }]}>{action.label}</Text>
          </Tap>
        )}
      </View>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: t.borderStrong, overflow: 'hidden', marginTop: 8 }}>
        <View style={{ height: '100%', width: `${(100 * done) / Math.max(1, total)}%`, backgroundColor: progress ? t.ink : t.inkMuted }} />
      </View>
    </FrameCard>
  );
}
