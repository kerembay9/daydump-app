// Create's "N sets" (mock S, create-sets-preview-a54.html): the tile that leads the Similar strip, and the sheet it
// opens with every set stacked. Tick photos in a set, then that set's Add N; hold a photo to see it big.
import React, { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import type { FillSet } from '../../services/stories/suggest';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';
import { Tap } from '../ui/Tap';
import type { IndexedPhoto } from '../../services/index/photoIndex';

/** Photo-sized tile: the first photo of each set fanned, "N sets" under them. */
export function SetsTile({ sets, onPress }: { sets: FillSet[]; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <FrameCard radius={11} onPress={onPress} label={`${sets.length} set${sets.length === 1 ? '' : 's'} of similar photos`}
      style={{ width: 62, height: 64, paddingHorizontal: 5, paddingBottom: 4, justifyContent: 'flex-end' }}>
      {sets.slice(0, 3).map((s, j) => (
        <Image key={s.photos[0].id} source={{ uri: s.photos[0].uri }} contentFit="cover" recyclingKey={s.photos[0].id}
          style={{ position: 'absolute', top: 5, left: 6 + j * 10, width: 22, height: 28, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff', transform: [{ rotate: `${(j - 1) * 8}deg` }] }} />
      ))}
      <Text style={[ui(9.5, 700), { color: t.ink }]} numberOfLines={1}>{sets.length} set{sets.length === 1 ? '' : 's'}</Text>
    </FrameCard>
  );
}

/** `sets`: as they were when the sheet opened, so an Add (which changes the picks) doesn't reshuffle them. */
export function SetsSheet({ sets, picks, inBasket, onAdd, onView, onClose }: {
  sets: FillSet[] | null; picks: number; inBasket: Set<string>;
  onAdd: (photos: IndexedPhoto[]) => void; onView: (photos: IndexedPhoto[], p: IndexedPhoto) => void; onClose: () => void;
}) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  // ticks per set; a fresh sheet starts with none
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(sets);
  if (sets !== shown) { setShown(sets); setTicked(new Set()); }
  // 5 across: sheet padding 16, card padding 10, gaps 4
  const w = Math.floor((win.width - 32 - 20 - 16) / 5);
  const tick = (id: string) => setTicked((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  return (
    <Sheet visible={!!sets} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icons.sparkle size={15} color={t.ink} />
        <Text style={[ui(15, 700), { color: t.ink, flex: 1 }]} numberOfLines={1}>Sets for your {picks} pick{picks === 1 ? '' : 's'}</Text>
        <Tap onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close sets"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
          <Icons.close size={18} color={t.ink} />
        </Tap>
      </View>
      <Text style={[ui(11), { color: t.inkMuted, marginTop: -4 }]}>Tick photos in a set, then Add. Hold one to see it big.</Text>
      {sets?.map((s) => {
        const add = s.photos.filter((p) => ticked.has(p.id) && !inBasket.has(p.id));
        return (
          <FrameCard key={s.photos[0].id} radius={14} style={{ padding: 10, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[ui(12, 700), { color: t.ink, flex: 1 }]} numberOfLines={1}>
                +{s.photos.length} <Text style={[ui(12, 500), { color: t.inkMuted }]}>· {s.name}</Text>
              </Text>
              <Tap onPress={add.length ? () => { onAdd(add); setTicked((x) => new Set([...x].filter((id) => !add.some((p) => p.id === id)))); } : undefined}
                accessibilityRole="button" accessibilityState={{ disabled: !add.length }} accessibilityLabel={`Add ${add.length} from ${s.name}`} hitSlop={6}
                style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: t.ink, justifyContent: 'center', opacity: add.length ? 1 : 0.4 }}>
                <Text style={[ui(10, 600), { color: t.bgScreen }]}>Add {add.length}</Text>
              </Tap>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {s.photos.map((p) => {
                const added = inBasket.has(p.id), on = added || ticked.has(p.id);
                return (
                  <Tap key={p.id} onPress={added ? undefined : () => tick(p.id)} onLongPress={() => onView(s.photos, p)} delayLongPress={350}
                    accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: added }} accessibilityLabel={added ? 'In your picks' : 'Tick this photo'} accessibilityHint="Hold to enlarge"
                    style={{ width: w, height: Math.round(w * 1.1), borderRadius: 8, overflow: 'hidden', backgroundColor: t.borderStrong, opacity: added ? 0.5 : 1 }}>
                    <Image source={{ uri: p.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={p.id} />
                    <View style={[{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
                      on ? { backgroundColor: t.ink } : { backgroundColor: 'rgba(255,253,249,0.85)', borderWidth: 1.5, borderColor: 'rgba(74,52,40,0.35)' }]}>
                      {on ? <Icons.check size={13} color={t.bgScreen} /> : null}
                    </View>
                  </Tap>
                );
              })}
            </View>
          </FrameCard>
        );
      })}
    </Sheet>
  );
}
