import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Screen } from '../components/ui/Screen';
import { IconButton } from '../components/ui/TopHeader';
import { Icons } from '../components/ui/Icons';
import { Tap } from '../components/ui/Tap';
import { useApp } from '../state/AppState';
import { checkDay, DayCheck, SLOTS, slotLabel } from '../services/today';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';

const DAY = 86_400_000;

/** Dev tools: the Today card's checklist on one day's camera photos, with every phrase score, to judge (and tune) the tags. */
export default function TodayTags() {
  const { t } = useTheme();
  const { library } = useApp();
  const [day, setDay] = useState(() => Date.now());
  const [res, setRes] = useState<{ day: number; c: DayCheck } | null>(null);
  useEffect(() => {
    if (!library) return;
    let live = true;
    checkDay(library, day).then((c) => live && setRes({ day, c }), (e) => console.warn('[today] check failed:', e));
    return () => { live = false; };
  }, [library, day]);
  const c = res?.day === day ? res.c : null;
  const label = new Date(day).toDateString() === new Date().toDateString() ? 'Today' : new Date(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Screen>
      <View style={{ paddingTop: 2, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}><Icons.back size={16} /></IconButton>
        <Text style={[display(20), { color: t.ink, flex: 1 }]}>Today tags</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Tap onPress={() => setDay(day - DAY)} accessibilityRole="button" accessibilityLabel="Day before" style={{ padding: 8 }}><Text style={[ui(14, 600), { color: t.ink }]}>‹</Text></Tap>
        <Text style={[ui(14, 600), { color: t.ink, flex: 1, textAlign: 'center' }]}>{label}</Text>
        <Tap onPress={() => setDay(Math.min(Date.now(), day + DAY))} accessibilityRole="button" accessibilityLabel="Day after" style={{ padding: 8 }}><Text style={[ui(14, 600), { color: t.ink }]}>›</Text></Tap>
      </View>
      {!c ? <ActivityIndicator color={t.ink} /> : (
        <View style={{ gap: 10 }}>
          <Text style={[ui(13, 500), { color: t.ink }]}>
            {SLOTS.filter((s) => c.filled[s.key]).length} of {SLOTS.length} prompts · {c.photos.length} photos, {c.dupes} same shot · side quest {c.quest.label}: {c.questFound ? 'found' : 'not yet'}
          </Text>
          <Text style={[ui(11), { color: t.inkMuted }]}>Faces: {c.faces === 'owner' ? 'matched to your profile photo' : c.faces === 'faces' ? 'no profile photo to match, phrases decide You / Friends' : 'faces pack missing'}</Text>
          {!c.photos.length && <Text style={[ui(12), { color: t.inkMuted }]}>No camera photos indexed on this day.</Text>}
          {c.photos.map((d) => (
            <View key={d.p.id} style={{ flexDirection: 'row', gap: 10, opacity: d.dupe ? 0.5 : 1 }}>
              <Image source={{ uri: d.p.uri }} style={{ width: 84, height: 84, borderRadius: 6 }} contentFit="cover" recyclingKey={d.p.id} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[ui(12, 600), { color: t.ink }]}>
                  {new Date(d.p.creationTime).toTimeString().slice(0, 5)} · {d.slots.length ? d.slots.map(slotLabel).join(', ') : 'no prompt'}{d.quest ? ' · quest' : ''}{d.dupe ? ' · same shot' : ''}
                </Text>
                <Text style={[ui(10.5), { color: t.inkMuted }]}>{d.faces} face{d.faces === 1 ? '' : 's'}{d.me ? ', you' : ''}</Text>
                <Text style={[ui(10.5), { color: t.inkMuted }]}>
                  {Object.entries(d.scores as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, s]) => `${k} ${s.toFixed(3)}`).join('  ')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
