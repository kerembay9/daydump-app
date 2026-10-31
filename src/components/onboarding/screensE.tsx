import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { display, ui } from '../../theme/type';
import { useApp, useProgress } from '../../state/AppState';
import { usePro } from '../../state/Pro';
import { startScan, useTidy } from '../../services/tidy/scan';
import { getLocale, tr } from '../../i18n';
import { Print } from '../ui/Print';
import { Tape } from '../ui/Tape';
import { Tap } from '../ui/Tap';
import { Icons } from '../ui/Icons';
import { Card, Shell } from './Shell';
import { Pic, PrintSpec, PrintStack, usePic } from './Prints';
import { Nav, Note } from './parts';

/** Phase E · Your roll (screens 20-23): the index reading the library, what it found, the clutter, search. Full access only. */

const fmt = (n: number) => n.toLocaleString(getLocale());
const STATUS = ['finding', 'grouping', 'spotting'] as const;

/** 20 · Finding your dumps: the real index progress, a print dropping as the roll fills, a status line that changes every 1.5 s */
export function FindingScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const app = useApp();
  const { progress } = useProgress();
  const pic = usePic();
  const total = progress?.total ?? app.paused?.total ?? app.library?.photos.length ?? 0;
  const done = progress ? progress.done : app.paused ? app.paused.done : total;
  const paused = !!app.paused && !progress;
  const finished = !progress && !paused && total > 0;
  const tiny = total > 0 && total < 50;
  // the status line steps through what the index is doing, every 1.5 s
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), 1500); return () => clearInterval(id); }, []);
  // one success haptic when the index finishes while this screen is up
  const was = useRef(!!progress);
  useEffect(() => {
    if (was.current && finished) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    was.current = !!progress;
  }, [progress, finished]);

  const shown = finished ? 6 : Math.max(1, Math.round((total ? done / total : 0) * 6));
  const spots: [number, number, number][] = [[10, 20, -5], [122, 8, 3], [232, 24, -2], [22, 128, 4], [132, 118, -4], [236, 132, 6]];
  const prints: PrintSpec[] = spots.slice(0, shown).map(([x, y, r], i) => ({ x, y, w: 94, h: 110, r, bg: pic(i) }));
  const main = paused ? tr('onboarding.flow.finding.paused', { done: fmt(done), total: fmt(total) })
    : finished ? tr('onboarding.flow.finding.read', { total: fmt(total) })
    : tr('onboarding.flow.finding.reading', { done: fmt(done), total: fmt(total) });
  const sub = paused ? tr('onboarding.flow.finding.background') : finished ? tr('onboarding.flow.finding.finished') : tiny ? tr('onboarding.flow.finding.tiny') : tr(`onboarding.flow.finding.${STATUS[tick % 3]}`);
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr(finished ? 'onboarding.flow.finding.titleDone' : 'onboarding.flow.finding.title')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}
      above={<PrintStack prints={prints} height={250} />}>
      <View accessibilityLiveRegion="polite" style={{ gap: 6, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 22, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.ink, opacity: paused ? 0.35 : 1 }} />
          <Text style={[ui(11, 500), { color: t.ink }]}>{main}</Text>
        </View>
        <Note>{sub}</Note>
      </View>
    </Shell>
  );
}

/** 21 · What we found: the first dump to open, the rest wearing Pro */
export function FoundScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const app = useApp();
  const { accessOf } = usePro();
  const stories = app.stories.slice(0, 3);
  const n = app.stories.length + app.moreStories;
  const ready = stories.length > 0;
  return (
    <Shell onBack={nav.onBack} progress={nav.progress}
      headline={ready ? tr('onboarding.flow.found.title', { count: n }) : tr('onboarding.flow.found.waiting')} sub={tr(ready ? 'onboarding.flow.found.sub' : 'onboarding.flow.found.waitingSub')}
      primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <View style={{ gap: 12, marginTop: 8 }}>
        {stories.map((s, i) => {
          const open = i === 0 || accessOf(s) === 'open';
          return (
            <Animated.View key={s.id} entering={FadeInDown.delay(i * 120).duration(400)}>
              <Tap onPress={open ? nav.onNext : () => {}} accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.subtitle}${open ? '' : `, ${tr('discover.locked')}`}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, borderRadius: 16, boxShadow: t.shadowCard, transform: [{ rotate: `${[-1, 0, 0][i]}deg` }] }}>
                <View style={{ width: 84, height: 84 }}>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderWidth: 2, borderColor: fixed.printBorder, borderRadius: 6, overflow: 'hidden', backgroundColor: fixed.printBorder }}>
                    {[0, 1, 2, 3].map((k) => <View key={k} style={{ width: '49%', height: '49%', flexGrow: 1 }}><Print uri={s.picks[k % s.picks.length]?.uri} w="100%" h="100%" r={0} blur={open ? undefined : 8} /></View>)}
                  </View>
                  {open ? <Tape style={{ top: -6 }} /> : null}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[display(16.5), { color: t.ink }]}>{s.title}</Text>
                  <Text style={[ui(11, 500), { color: t.inkMuted }]}>{open ? s.subtitle : tr('onboarding.flow.found.opensWithPro')}</Text>
                </View>
                {open ? <Icons.arrow size={18} color={t.ink} /> : <ProTag />}
              </Tap>
            </Animated.View>
          );
        })}
      </View>
    </Shell>
  );
}

function ProTag() {
  const { t } = useTheme();
  return <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: t.borderStrong }}><Text style={[ui(10, 600), { color: t.inkMuted }]}>Pro</Text></View>;
}

/** 22 · Clutter found: repeats, blurry shots and screenshots, counted by Tidy's scan; Pro clears them in one go */
export function ClutterScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const tidy = useTidy();
  useEffect(() => { startScan(); }, []);
  const r = tidy.result;
  const rows = r ? [
    [tr('onboarding.flow.clutter.repeats'), r.piles.same.length + r.piles.copies.length],
    [tr('onboarding.flow.clutter.blurry'), r.piles.blurry.length],
    [tr('onboarding.flow.clutter.screens'), r.piles.screens.length],
  ] as [string, number][] : null;
  const total = rows ? rows.reduce((a, x) => a + x[1], 0) : 0;
  const thumbs = r ? [...r.piles.same, ...r.piles.blurry, ...r.piles.screens].slice(0, 4).map((x) => x.p.uri) : [];
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={rows ? tr('onboarding.flow.clutter.title', { count: fmt(total) }) : tr('onboarding.flow.clutter.counting')} sub={tr('onboarding.flow.clutter.sub')}
      primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <View style={{ gap: 12, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <Print key={i} uri={thumbs[i]} w={64} h={78} r={4} rotate={[-3, 2, -2, 3][i]} border={3} borderColor={fixed.printBorder} />
          ))}
        </View>
        {rows ? (
          <Card>
            {rows.map(([k, v], i) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: t.borderSubtle }}>
                <Text style={[ui(13, 600), { color: t.ink }]}>{k}</Text>
                <Text style={[ui(13, 600), { color: t.ink }]}>{fmt(v)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.borderSubtle }}>
              <Text style={[ui(12), { color: t.inkMuted, flex: 1 }]}>{tr('onboarding.flow.clutter.clear')}</Text>
              <ProTag />
            </View>
          </Card>
        ) : <Note>{tr('onboarding.flow.clutter.wait')}</Note>}
      </View>
    </Shell>
  );
}

/** 23 · Search teaser: a sample query and its results; search itself is Pro */
export function SearchScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const pic = usePic();
  const results: [string, string, number][] = [['Aug 3', pic(0), -2], ['Aug 3', pic(1), 2], ['Aug 14', pic(2), -1], ['Aug 21', pic(3), 3]];
  const query = tr('onboarding.flow.search.query');
  // the query types itself letter by letter (40 ms), then the results slide in
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x < query.length ? x + 1 : x)), 40);
    return () => clearInterval(id);
  }, [query]);
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} eyebrow={tr('onboarding.flow.search.eyebrow')} headline={tr('onboarding.flow.search.title')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <View style={{ gap: 12, marginTop: 8 }}>
        <View accessibilityLabel={query} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle }}>
          <Icons.search size={18} color={t.inkMuted} />
          <Text style={[ui(13, 500), { color: t.ink, flex: 1 }]}>{query.slice(0, n)}</Text>
          <ProTag />
        </View>
        {n >= query.length ? (
          <Animated.View entering={FadeInDown.duration(350)} style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
            {results.map(([d, bg, r], i) => (
              <View key={i} style={{ width: 74, height: 92, transform: [{ rotate: `${r}deg` }] }}>
                <Pic bg={bg} style={{ flex: 1, borderWidth: 3, borderColor: fixed.printBorder, borderRadius: 6, boxShadow: t.shadowPrint }} />
                <View style={{ position: 'absolute', right: 7, bottom: 7, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: fixed.chipBg }}><Text style={[ui(9, 600), { color: fixed.chipText }]}>{d}</Text></View>
              </View>
            ))}
          </Animated.View>
        ) : null}
        {n >= query.length ? <Note center>{tr('onboarding.flow.search.meta')}</Note> : null}
      </View>
    </Shell>
  );
}
