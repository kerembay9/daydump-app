import React from 'react';
import { Platform, Text, View } from 'react-native';
import type { IndexProgress } from '../state/AppState';
import { useTheme } from '../theme/ThemeProvider';
import { ui } from '../theme/type';
import { FrameCard } from './ui/FrameCard';
import { Tap } from './ui/Tap';

const span = (d: number) => {
  const [k, unit] = d < 14 ? [Math.round(d), 'day'] : d < 60 ? [Math.round(d / 7), 'week'] : d < 730 ? [Math.round(d / 30), 'month'] : [Math.round(d / 365), 'year'];
  return k <= 1 ? unit : `${k} ${unit}s`;
};
/** How far back the index reaches (AppState coverageSince): "Dumps from your last 3 weeks so far". */
export const coverageLine = (since: number) => `Dumps from your last ${span((Date.now() - since) / 864e5)} so far`;
/** batteryPct null = charging, no cost */
const battery = (pct: number | null) => (pct == null ? 'charging, no battery cost' : pct >= 1 ? `uses ~${pct}% battery` : 'uses a little battery');
export const eta = (s: number | null) => {
  if (s == null) return 'Working out time left…';
  const m = Math.round(s / 60);
  return s < 60 ? 'Less than a minute left' : m < 60 ? `About ${m} min left` : `About ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''} left`;
};
const n = (x: number) => x.toLocaleString();

/**
 * Slim indexing status under the Discover header: progress + ETA, the native fast mode's battery line with Pause
 * (same facts as its notification, BackgroundIndex.kt), or the paused state with Resume. Nothing when idle.
 */
export function IndexStrip({ progress, paused, hasStories, coverageSince = null, onPause, onResume }: {
  progress: IndexProgress | null;
  paused: { done: number; total: number } | null;
  hasStories: boolean;
  coverageSince?: number | null;
  onPause: () => void;
  onResume: () => void;
}) {
  const { t } = useTheme();
  if (!progress && !paused) return null;
  const fast = progress?.batteryPct !== undefined;
  const done = progress?.done ?? paused!.done, total = progress?.total ?? paused!.total;

  // total 0 = the placeholder before the first listing (first run): no count yet
  const line1 = progress ? `Reading your library…${total ? ` ${n(done)}/${n(total)}` : ''} · ${eta(progress.etaSec)}` : `Paused at ${n(done)} of ${n(total)}`;
  const line2 = !progress ? 'Continues by itself next time you charge.'
    : fast ? `Keeps going if you leave · ${battery(progress.batteryPct ?? null)}`
    // board 11: with dumps up, the line says how far back they reach
    : hasStories ? (coverageSince != null ? coverageLine(coverageSince) : 'Starting with your newest photos')
    // BackgroundIndex.kt's charging-only job picks up where this left off; only worth saying when there's a wait
    : Platform.OS === 'android' && (progress.etaSec ?? 0) > 60 ? 'You can leave the app: it keeps going while your phone charges.'
    : 'Newest photos first. Your first dumps appear in a few seconds.';
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
