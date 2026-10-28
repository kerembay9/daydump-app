import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { router } from 'expo-router';
import { useApp } from '../state/AppState';
import { checkDay, DayCheck, listSlots, SLOTS, slotLabel } from '../services/today';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { FrameCard } from './ui/FrameCard';
import { PhotoStack } from './ui/PhotoStack';
import { Sheet } from './ui/Sheet';
import { Tap } from './ui/Tap';
import { Tape } from './ui/Tape';

const R = 21, C = 2 * Math.PI * R;

function Ring({ pct }: { pct: number }) {
  const { t } = useTheme();
  return (
    <View style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={50} height={50} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={25} cy={25} r={R} stroke={t.borderStrong} strokeWidth={5} fill="none" />
        <Circle cx={25} cy={25} r={R} stroke={t.ink} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - pct / 100)} />
      </Svg>
      <Text style={[ui(11.5, 600), { color: t.ink, fontVariant: ['tabular-nums'] }]}>{pct === 100 ? '✓' : `${pct}%`}</Text>
    </View>
  );
}

/** "Missing you, sky and night"; past 3, "Missing you, friends and 3 more". */
const missingLine = (c: DayCheck) =>
  c.missing.length > 3 ? `Missing ${c.missing.slice(0, 2).map((k) => slotLabel(k).toLowerCase()).join(', ')} and ${c.missing.length - 2} more` : `Missing ${listSlots(c.missing)}`;

/**
 * Discover's Today card (Dump Meter): how much of a dump today's camera photos already make, slot by slot, and what's
 * missing while there's still time to shoot it. Only on days with photos; tap opens the checklist.
 */
export function TodayCard({ more }: { more: boolean }) {
  const { t } = useTheme();
  const { library, stories } = useApp();
  const [c, setC] = useState<DayCheck | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!library) return;
    let live = true;
    checkDay(library).then((x) => live && setC(x), (e) => console.warn('[today] check failed:', e));
    return () => { live = false; };
  }, [library]);
  if (!c?.photos.length) return null;

  const done = c.pct === 100;
  const story = stories.find((s) => s.kind === 'today');
  const kept = c.photos.filter((d) => !d.dupe);
  const sub = done ? `Every slot filled · ${kept.length} photos` : missingLine(c);

  return (
    <View style={{ paddingTop: 8, paddingBottom: more ? 10 : 4 }}>
      <FrameCard radius={16} padding={10} rotate={more ? -1.2 : -0.6} onPress={() => setOpen(true)} label={`Today, ${c.pct}%. ${sub}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <Ring pct={c.pct} />
        <View style={{ flex: 1 }}>
          <Text style={[display(17.5), { color: t.ink }]}>{done ? 'Today’s dump' : 'Today'}</Text>
          <Text style={[ui(11, 500), { color: t.inkMuted, marginTop: 2 }]} numberOfLines={2}>{sub}</Text>
        </View>
        <PhotoStack kind="row" uris={kept.slice(-3).reverse().map((d) => d.p.uri)} />
      </FrameCard>
      {!more && <Tape />}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={[display(20), { color: t.ink }]}>{done ? 'Today’s dump is ready' : `Today · ${c.pct}%`}</Text>
          <Text style={[ui(11, 500), { color: t.inkMuted }]}>{c.photos.length} photos{c.dupes ? ` · ${c.dupes} same shot` : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {SLOTS.map(({ key, label }) => {
            const n = c.filled[key];
            return (
              <View key={key} accessibilityLabel={`${label}: ${n ? n : 'missing'}`}
                style={{ paddingHorizontal: 10, height: 30, borderRadius: 8, justifyContent: 'center', borderWidth: 1, borderStyle: n ? 'solid' : 'dashed',
                  borderColor: n ? t.ink : t.borderStrong, backgroundColor: n ? t.ink : 'transparent' }}>
                <Text style={[ui(12, 500), { color: n ? t.bgScreen : t.inkMuted }]}>{n ? '✓' : '○'} {label}{n > 1 ? ` ×${n}` : ''}</Text>
              </View>
            );
          })}
        </View>
        {!done && <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17 }]}>Still time: a photo of {listSlots(c.missing)} fills the rest.</Text>}
        {story ? (
          <Tap onPress={() => { setOpen(false); router.push({ pathname: '/preview/[id]', params: { id: 'today' } }); }} accessibilityRole="button"
            style={{ height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
            <Text style={[ui(13, 600), { color: t.bgScreen }]}>{done ? 'Open today’s dump' : 'Make a dump from what I have'}</Text>
          </Tap>
        ) : (
          <Text style={[ui(12), { color: t.inkMuted }]}>A few more photos and today becomes a dump.</Text>
        )}
      </Sheet>
    </View>
  );
}
