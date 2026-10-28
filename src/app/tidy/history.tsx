import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { FrameCard } from '../../components/ui/FrameCard';
import { IconButton } from '../../components/ui/TopHeader';
import { Icons } from '../../components/ui/Icons';
import { Tap } from '../../components/ui/Tap';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { history, restore, type Session } from '../../services/tidy/scan';
import { PILES, type Pile } from '../../services/tidy/rules';
import { formatBytes as bytes } from '../../components/tidy/TidyGrid';

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const when = (ms: number) => (new Date(ms).toDateString() === new Date().toDateString() ? 'Today' : day(ms));
/** A trashed photo by MediaStore id (its file:// path changes while it's in Trash). */
const thumb = (id: string) => `content://media/external/images/media/${id}`;
const photos = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;

/** Every move to Trash, newest first, each restorable (Android's Restore dialog) until it leaves Trash. */
export default function TrashHistory() {
  const { t } = useTheme();
  const [list, setList] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const load = useCallback(() => history().then(setList).catch((e) => { console.warn('[tidy] history failed:', e); setList([]); }), []);
  useEffect(() => { load(); }, [load]);

  const onRestore = async (s: Session, only?: string[]) => {
    if (busy != null) return;
    setBusy(s.session); setFailed(null);
    try {
      if (!(await restore(s.session, only))) setFailed(s.session);
    } catch (e) { console.warn('[tidy] restore failed:', e); setFailed(s.session); }
    setBusy(null);
    await load();
  };

  return (
    <Screen>
      <View style={{ paddingTop: 2, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/tidy'))}><Icons.back size={16} /></IconButton>
        <View style={{ flex: 1 }}>
          <Text style={[display(20), { color: t.ink }]}>Trash history</Text>
          <Text style={[ui(12, 500), { color: t.inkMuted, marginTop: 2 }]}>Restore anytime before it leaves Trash</Text>
        </View>
      </View>
      {list?.length === 0 && <Text style={[ui(13, 500), { color: t.inkMuted, marginTop: 16, textAlign: 'center' }]}>Nothing moved to Trash yet.</Text>}
      {list?.map((s) => (
        <FrameCard key={s.session} radius={18} padding={14} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[display(17), { color: t.ink }]}>{`${when(s.session)} · ${photos(s.n)}`}</Text>
              <Text style={[ui(12, 500), { color: t.inkMuted, marginTop: 2 }]}>{`${bytes(s.bytes)} · ${s.piles.map((p) => PILES[p as Pile]?.title ?? p).join(', ')}`}</Text>
            </View>
            {s.inTrash > 0 && (
              <Tap onPress={() => onRestore(s)} disabled={busy != null} accessibilityRole="button" accessibilityLabel={`Restore ${photos(s.inTrash)}`} hitSlop={4}
                style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', opacity: busy === s.session ? 0.5 : 1 }}>
                <Text style={[ui(12, 600), { color: t.bgScreen }]}>Restore all</Text>
              </Tap>
            )}
          </View>
          <Text style={[ui(11.5, 500), { color: t.inkMuted, marginTop: 8 }]}>{s.inTrash > 0 && s.until ? `In Trash until ${day(s.until)}` : 'Gone from Trash'}</Text>
          {s.trashed.length > 1 ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -14 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 6 }}>
                {s.trashed.map((id, i) => (
                  <Tap key={id} onPress={() => onRestore(s, [id])} disabled={busy != null} accessibilityRole="button" accessibilityLabel={`Restore photo ${i + 1}`}
                    style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: t.borderStrong }}>
                    <Image source={{ uri: thumb(id) }} style={{ flex: 1 }} contentFit="cover" recyclingKey={id} />
                  </Tap>
                ))}
              </ScrollView>
              <Text style={[ui(11), { color: t.inkMuted, marginTop: 6 }]}>Tap a photo to restore just that one.</Text>
            </>
          ) : null}
          {failed === s.session && <Text style={[ui(11.5, 600), { color: t.ink, marginTop: 4 }]}>Nothing was restored.</Text>}
        </FrameCard>
      ))}
      {list && list.length > 0 && <Text style={[ui(11.5, 500), { color: t.inkMuted, marginTop: 6, textAlign: 'center' }]}>{"Restoring shows Android's own dialog."}</Text>}
    </Screen>
  );
}
