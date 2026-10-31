import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import type { IndexProgress } from '../state/AppState';
import { useTheme } from '../theme/ThemeProvider';
import { ui } from '../theme/type';
import { FrameCard } from './ui/FrameCard';
import { Tap } from './ui/Tap';
import { tr } from '../i18n';

const span = (d: number) => {
  const [k, unit] = d < 14 ? [Math.max(1, Math.round(d)), 'day'] : d < 60 ? [Math.round(d / 7), 'week'] : d < 730 ? [Math.round(d / 30), 'month'] : [Math.round(d / 365), 'year'];
  return tr(`discover.timeSpan.${unit}`, { count: k });
};
/** How far back the index reaches (AppState coverageSince): "Dumps from your last 3 weeks so far". */
export const coverageLine = (since: number) => tr('discover.coverageLine', { span: span((Date.now() - since) / 864e5) });
/** batteryPct null = charging, no cost */
const battery = (pct: number | null) => (pct == null ? tr('discover.batteryCharging') : pct >= 1 ? tr('discover.batteryPct', { pct }) : tr('discover.batteryLow'));
export const eta = (s: number | null) => {
  if (s == null) return tr('discover.etaCalculating');
  const m = Math.round(s / 60);
  return s < 60 ? tr('discover.etaUnderMinute') : m < 60 ? tr('discover.etaMinutes', { count: m }) : m % 60 ? tr('discover.etaHoursMinutes', { h: Math.floor(m / 60), m: m % 60 }) : tr('discover.etaHours', { h: Math.floor(m / 60) });
};
const n = (x: number) => x.toLocaleString();

/**
 * The count between progress reports (every 128-photo batch, or every 3 s from the fast worker): runs on at the
 * average rate the ETA implies, a bit under it so it rarely has to wait for the next report. Never goes back.
 */
function useTicking(progress: IndexProgress | null) {
  const done = progress?.done ?? 0, total = progress?.total ?? 0, etaSec = progress?.etaSec ?? null;
  const [shown, setShown] = useState(done);
  const from = useRef({ done, at: 0, perSec: 0 }); // set by the effect below on mount
  useEffect(() => {
    if (done < from.current.done) setShown(done); // a new run
    from.current = { done, at: Date.now(), perSec: etaSec ? (total - done) / etaSec : 0 };
  }, [done, total, etaSec]);
  const running = !!progress && total > 0;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const f = from.current;
      const v = Math.min(total, Math.floor(f.done + (0.9 * f.perSec * (Date.now() - f.at)) / 1000));
      setShown((x) => (v > x ? v : x));
    }, 100);
    return () => clearInterval(id);
  }, [running, total]);
  return Math.min(total, Math.max(shown, done));
}

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
  const ticking = useTicking(progress);
  if (!progress && !paused) return null;
  const fast = progress?.batteryPct !== undefined;
  const done = progress ? ticking : paused!.done, total = progress?.total ?? paused!.total;

  // total 0 = the placeholder before the first listing (first run): no count yet
  const head = progress ? (total ? tr('discover.readingProgress', { done: n(done), total: n(total) }) : tr('discover.reading')) : tr('discover.pausedAt', { done: n(done), total: n(total) });
  const time = progress ? ` · ${eta(progress.etaSec)}` : '';
  const line2 = !progress ? tr('discover.lineResumeCharging')
    : fast ? tr('discover.lineFastMode', { battery: battery(progress.batteryPct ?? null) })
    // board 11: with dumps up, the line says how far back they reach
    : hasStories ? (coverageSince != null ? coverageLine(coverageSince) : tr('discover.lineNewest'))
    // BackgroundIndex.kt's charging-only job picks up where this left off; only worth saying when there's a wait
    : Platform.OS === 'android' && (progress.etaSec ?? 0) > 60 ? tr('discover.lineAndroidBackground')
    : tr('discover.lineFirstDumps');
  const action = !progress ? { label: tr('discover.resume'), on: onResume } : fast ? { label: tr('discover.pause'), on: onPause } : null;

  return (
    <FrameCard
      radius={14}
      style={{ paddingVertical: 9, paddingHorizontal: 12, marginBottom: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${head}${time}. ${line2}`}>
          {/* the ticking count is fixed-width and the time left wraps as one piece, so it doesn't hop between lines */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Text style={[ui(11.5, 600), { color: t.ink, fontVariant: ['tabular-nums'] }]}>{head}</Text>
            {!!time && <Text style={[ui(11.5, 600), { color: t.ink }]}>{time}</Text>}
          </View>
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
