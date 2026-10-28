import React, { useCallback, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '../state/AppState';
import { Hub, useHub } from '../services/today';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { accent, accentTint, PopToast, useSlotPop } from './SlotPop';
import { FrameCard } from './ui/FrameCard';
import { Tape } from './ui/Tape';

const ACCENT_INK = '#FAF4EE';

/** The board in miniature: free middle washed, filled squares their photo (ink without one), a winning row ringed in accent. */
function Mini({ hub, flip }: { hub: Hub; flip: ReturnType<typeof useSlotPop>['flip'] }) {
  const { t } = useTheme();
  return (
    <View style={{ width: 14 * 3 + 2 * 2, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {hub.cells.map((c) => (
        <Animated.View key={c.i} style={[{ width: 14, height: 14, borderRadius: 3, overflow: 'hidden', ...(c.key === ''
          ? { backgroundColor: accentTint(t) }
          : c.on ? { backgroundColor: c.win ? accent(t) : t.ink } : { borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong }) }, c.on ? flip(c.key) : null]}>
          {c.on && c.uri ? <Image source={{ uri: c.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={c.uri} /> : null}
          {c.on && c.uri && c.win ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 3, borderWidth: 1.5, borderColor: accent(t) }} /> : null}
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * Discover's Today card: the day's bingo in miniature, how close it is, the last 7 days (dot = a bingo day) and the side quest's
 * badge. Tap opens Today (/today).
 */
export function TodayCard({ more, paper }: { more: boolean; paper?: boolean }) {
  const { t } = useTheme();
  const hub = useHub(useApp().library);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const pop = useSlotPop(hub, focused);
  if (!hub) return null;
  const ACCENT = accent(t), HL = accentTint(t);

  const sub = hub.bingo ? 'Bingo! Today’s print is in' : hub.near ? `1 away from bingo: ${hub.near.toLowerCase()}` : `${hub.got} of 8 squares`;
  const found = hub.quest.found;

  return (
    <View style={{ paddingTop: 8, paddingBottom: more ? 10 : 4 }}>
      <FrameCard radius={16} padding={10} rotate={more ? -1.2 : -0.6} paper={paper ? 'today' : undefined} onPress={() => router.push('/today')} label={`Today: ${sub}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <Mini hub={hub} flip={pop.flip} />
        <View style={{ flex: 1 }}>
          <Text style={[display(17.5), { color: t.ink }]}>Today</Text>
          <Text style={[ui(11, 500), { color: hub.bingo ? ACCENT : t.inkMuted, marginTop: 2 }]} numberOfLines={2}>{sub}</Text>
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
            {hub.week.map((d) => (
              <View key={d.day} style={{ width: 6, height: 6, borderRadius: 3, ...(d.state === 'got'
                ? { backgroundColor: t.ink }
                : d.state === 'wait' ? { borderWidth: 1.5, borderColor: t.ink } : { borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong }) }} />
            ))}
          </View>
        </View>
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: ACCENT, borderStyle: found ? 'solid' : 'dashed',
          backgroundColor: found ? ACCENT : HL, alignItems: 'center', justifyContent: 'center', padding: 3 }}>
          <Text style={[ui(7.5, 700), { color: found ? ACCENT_INK : ACCENT, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 8.5 }]}>
            {found ? `✓\n${hub.quest.label.split(' ').pop()}` : 'Side\nquest'}
          </Text>
        </View>
      </FrameCard>
      {!more && !paper && <Tape />}
      <PopToast text={pop.text} anim={pop.anim} t={t} top={-6} />
    </View>
  );
}
