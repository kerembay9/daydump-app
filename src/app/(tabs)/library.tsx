import React, { useCallback, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Dump, DumpStatus, duplicate, list, remove } from '../../services/dumps';
import { kindLabel, matches, metaLines } from '../../services/dumpLabels';
import { useTheme } from '../../theme/ThemeProvider';
import { caps, display, em, sans, ui } from '../../theme/type';
import { Screen } from '../../components/ui/Screen';
import { AvatarButton } from '../../components/ui/TopHeader';
import { FrameCard } from '../../components/ui/FrameCard';
import { PhotoStack } from '../../components/ui/PhotoStack';
import { Tap } from '../../components/ui/Tap';
import { Icons } from '../../components/ui/Icons';
import { Confirm, ConfirmSpec } from '../../components/ui/Sheet';

const edit = (id: string) => router.push({ pathname: '/edit/[id]', params: { id } });
const preview = (id: string) => router.push({ pathname: '/preview/[id]', params: { id } });
const NOUN = { posted: 'posted dumps', draft: 'drafts' } as const;

/** Full-bleed Posted / Drafts switcher: active = bold ink with a 64x3.5 ink bar, counts at 75%. */
function Tabs({ tab, counts, onTab }: { tab: DumpStatus; counts: Record<DumpStatus, number>; onTab: (s: DumpStatus) => void }) {
  const { t } = useTheme();
  return (
    <View style={{ marginHorizontal: -16, paddingHorizontal: 8, flexDirection: 'row', borderBottomWidth: 1, borderColor: t.borderStrong, marginBottom: 12 }}>
      {(['posted', 'draft'] as const).map((s) => {
        const on = s === tab;
        return (
          <Tap key={s} onPress={() => onTab(s)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 4, paddingBottom: 6 }}>
            <Text style={{ fontFamily: sans[on ? 700 : 500], fontSize: 13.5, letterSpacing: em(13.5, -0.025), color: on ? t.ink : t.inkMuted }}>
              {s === 'posted' ? 'Posted' : 'Drafts'} <Text style={{ fontSize: 11, opacity: 0.75 }}>({counts[s]})</Text>
            </Text>
            {on ? <View style={{ position: 'absolute', bottom: 0, width: 64, height: 3.5, borderRadius: 2, backgroundColor: t.ink }} /> : null}
          </Tap>
        );
      })}
      {/* 4px down, like Discover's header, so the avatar doesn't move between tabs; the labels centre on it */}
      <View style={{ paddingTop: 4, paddingBottom: 6, paddingRight: 8 }}>
        <AvatarButton onPress={() => router.push('/profile')} />
      </View>
    </View>
  );
}

function Pill({ text, primary, onPress }: { text: string; primary?: boolean; onPress: () => void }) {
  const { t } = useTheme();
  const body = <Text style={[ui(10, 600), { color: primary ? t.bgScreen : t.ink }]}>{text}</Text>;
  const box = { height: 26, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' } as const;
  return primary ? (
    <Tap onPress={onPress} accessibilityRole="button" hitSlop={4} style={[box, { borderRadius: 13, backgroundColor: t.ink }]}>{body}</Tap>
  ) : (
    <FrameCard radius={13} onPress={onPress} style={box}>{body}</FrameCard>
  );
}

/** One saved dump: fanned 3-photo stack, status pill + kind, serif title, meta; Edit|Reuse over Preview (+ Delete on drafts). */
const Row = React.memo(function Row({ d, onReuse, onDelete }: { d: Dump; onReuse: (d: Dump) => void; onDelete: (d: Dump) => void }) {
  const { t } = useTheme();
  const draft = d.status === 'draft';
  return (
    <Tap
      onPress={() => (draft ? edit(d.id) : preview(d.id))}
      onLongPress={() => onDelete(d)}
      accessibilityRole="button"
      accessibilityLabel={`${d.title}, ${draft ? 'draft' : 'posted'}`}
      accessibilityHint={`${draft ? 'Opens it in Edit' : 'Opens the preview'}. Long-press to delete.`}
      style={{ backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, boxShadow: t.shadowCard, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <PhotoStack kind="row" uris={d.photos.map((p) => p.uri)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: sans[700], fontSize: 9, letterSpacing: em(9, 0.05), textTransform: 'uppercase', paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden', backgroundColor: draft ? t.accentFab : t.dark ? t.borderStrong : 'rgba(0,0,0,0.09)', color: draft ? t.accentFabText : t.inkMuted }}>
            {caps(draft ? 'Draft' : 'Posted')}
          </Text>
          <Text style={[ui(10, 500), { color: t.inkMuted, flexShrink: 1 }]} numberOfLines={1}>{kindLabel(d)}</Text>
        </View>
        {/* Two lines rather than "…" (the never-truncate rule from Discover). */}
        <Text style={[display(16.5), { color: t.ink, marginTop: 2 }]} numberOfLines={2}>{d.title}</Text>
        <Text style={[ui(10.5), { color: t.inkMuted, marginTop: 2 }]} numberOfLines={2}>{metaLines(d).join('\n')}</Text>
      </View>
      <View style={{ gap: 4 }}>
        {draft ? <Pill primary text="Edit" onPress={() => edit(d.id)} /> : <Pill primary text="Reuse" onPress={() => onReuse(d)} />}
        <Pill text="Preview" onPress={() => preview(d.id)} />
        {draft ? <Pill text="Delete" onPress={() => onDelete(d)} /> : null}
      </View>
    </Tap>
  );
});

function Empty({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  const { t } = useTheme();
  return (
    <FrameCard radius={16} padding={16} style={{ gap: 8, marginTop: 4 }}>
      <Text style={[display(19.5, 1.1), { color: t.ink }]}>{title}</Text>
      <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17 }]}>{body}</Text>
      <Tap onPress={onAction} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 4, height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink, justifyContent: 'center' }}>
        <Text style={[ui(12, 600), { color: t.bgScreen }]}>{action}</Text>
      </Tap>
    </FrameCard>
  );
}

/** Library (ph4.png): Posted / Drafts tabs, search under them (kept across tabs), saved dumps newest first. */
export default function Library() {
  const { t } = useTheme();
  const [tab, setTab] = useState<DumpStatus>('posted');
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<Dump[] | null>(null);

  const load = useCallback(() => { list().then(setAll, (e) => { console.warn('[library] load failed:', e); setAll([]); }); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // ?tab=draft from the Done sheet after Save only; cleared so a later visit keeps the user's own tab
  const { tab: want } = useLocalSearchParams<{ tab?: DumpStatus }>();
  useFocusEffect(useCallback(() => { if (want) { setTab(want); router.setParams({ tab: undefined }); } }, [want]));

  const items = (all ?? []).filter((d) => d.status === tab);
  const shown = items.filter((d) => matches(d, query));
  const counts = { posted: 0, draft: 0 };
  all?.forEach((d) => counts[d.status]++);

  // One copy per tap: a double tap must not make "X (2)" and "X (3)".
  const reusing = useRef(false);
  const reuse = useCallback(async (d: Dump) => {
    if (reusing.current) return;
    reusing.current = true;
    try {
      const copy = await duplicate(d.id);
      if (copy) edit(copy.id);
    } finally { reusing.current = false; }
  }, []);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const confirmDelete = useCallback((d: Dump) => setConfirm({
    title: d.status === 'draft' ? 'Delete draft?' : 'Remove from Library?',
    body: `“${d.title}” will be removed from Library. Your photos stay on your phone.`,
    action: d.status === 'draft' ? 'Delete' : 'Remove', danger: true,
    onConfirm: () => { remove(d.id).then(load); },
  }), [load, setConfirm]);

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <Tabs tab={tab} counts={counts} onTab={setTab} />
      <View style={{ paddingHorizontal: 4, marginBottom: 12 }}>
        <FrameCard radius={16} style={{ height: 38, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icons.search size={16} color={t.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search in ${NOUN[tab]}…`}
            placeholderTextColor={t.inkMuted}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={[ui(12, 500), { flex: 1, color: t.ink, padding: 0 }]}
          />
          {query ? (
            <Tap onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Icons.close size={12} color={t.inkMuted} />
            </Tap>
          ) : null}
        </FrameCard>
      </View>
      {all == null ? null : shown.length ? (
        <View style={{ gap: 10 }}>
          {shown.map((d) => <Row key={d.id} d={d} onReuse={reuse} onDelete={confirmDelete} />)}
        </View>
      ) : items.length ? (
        <Empty title="No matches" body={`Nothing in your ${NOUN[tab]} matches “${query.trim()}”.`} action="Clear search" onAction={() => setQuery('')} />
      ) : tab === 'posted' ? (
        <Empty title="Nothing posted yet" body="When you share a dump to Instagram or TikTok, it lands here so you can reuse it." action="Find a dump" onAction={() => router.navigate('/')} />
      ) : (
        <Empty title="No drafts yet" body="Dumps you open in Edit or start in Create are saved here as you go." action="Start one" onAction={() => router.navigate('/create')} />
      )}
      <Confirm c={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}
