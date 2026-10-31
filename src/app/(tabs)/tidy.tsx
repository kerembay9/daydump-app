import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { Screen } from '../../components/ui/Screen';
import { IconButton, TopHeader } from '../../components/ui/TopHeader';
import { FrameCard } from '../../components/ui/FrameCard';
import { Tape } from '../../components/ui/Tape';
import { Tap } from '../../components/ui/Tap';
import { Icons } from '../../components/ui/Icons';
import { useApp, useProgress } from '../../state/AppState';
import { usePro } from '../../state/Pro';
import { Pill } from '../../components/ui/Pill';
import { GalleryService } from '../../services/galleryService';
import { currentCreateDraft, receiveShared } from '../../services/dumps';
import { monthOf, Pile, PILES } from '../../services/tidy/rules';
import { formatBytes as bytes } from '../../components/tidy/TidyGrid';
import { clearMoved, hasFullAccess, history, restore, scannedBefore, Session, setStoryPhotos, startScan, tidySupported, useTidy } from '../../services/tidy/scan';
import { tr } from '../../i18n';

const SHOWN: Pile[] = ['same', 'copies', 'screens', 'blurry', 'paper', 'chats', 'private'];
const REVIEW_ONLY = new Set<Pile>(['paper', 'chats']);

const monthLabel = (k: string) => {
  const [y, m] = k.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', y === new Date().getFullYear() ? { month: 'short' } : { month: 'short', year: 'numeric' });
};

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const n = (x: number) => x.toLocaleString('en-US');

function Button({ text, onPress, primary = true, label }: { text: string; onPress: () => void; primary?: boolean; label?: string }) {
  const { t } = useTheme();
  return primary ? (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? text} style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[ui(13, 600), { color: t.bgScreen }]}>{text}</Text>
    </Tap>
  ) : (
    <FrameCard radius={20} onPress={onPress} label={label ?? text} style={{ height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[ui(13, 600), { color: t.ink }]}>{text}</Text>
    </FrameCard>
  );
}

function Note({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <FrameCard radius={16} padding={16} style={{ gap: 8, marginTop: 8 }}>
      <Tape seed={title} style={{ position: 'absolute', top: -9, alignSelf: 'center' }} />
      <Text style={[display(21, 1.12), { color: t.ink }]}>{title}</Text>
      {body ? <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17 }]}>{body}</Text> : null}
      {children}
    </FrameCard>
  );
}

/** A category's photos: the first big, the others beside it (in a row when wide, stacked when not). */
function Mosaic({ uris, wide }: { uris: string[]; wide: boolean }) {
  const pic = (uri: string) => <Image key={uri} source={{ uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={uri} />;
  return (
    <View style={{ height: wide ? 96 : 72, flexDirection: 'row', gap: 2, borderRadius: 9, overflow: 'hidden' }}>
      <View style={{ flex: 2 }}>{uris[0] ? pic(uris[0]) : null}</View>
      {uris.length > 1 ? (wide ? uris.slice(1).map((u) => <View key={u} style={{ flex: 1 }}>{pic(u)}</View>) : <View style={{ flex: 1, gap: 2 }}>{uris.slice(1).map(pic)}</View>) : null}
    </View>
  );
}

const phaseText = (phase: 'list' | 'embed' | 'check' | 'group') => ({ list: tr('tidy.phaseList'), embed: tr('tidy.phaseEmbed'), check: tr('tidy.phaseCheck'), group: tr('tidy.phaseGroup') }[phase]);

/** Tidy (keepers): repeats and clutter in piles, each photo in one; everything removed goes to Trash, with undo and a history. */
export default function Tidy() {
  const { t } = useTheme();
  const s = useTidy();
  const indexing = !!useProgress().progress;
  const [access, setAccess] = useState<boolean | null>(null);
  const [last, setLast] = useState<Session | null>(null);
  const supported = tidySupported();
  const { stories } = useApp();
  const { accessOf } = usePro();
  useEffect(() => {
    const ids = (open: boolean) => stories.filter((st) => (accessOf(st) === 'open') === open).flatMap((st) => st.picks.map((p) => p.id));
    setStoryPhotos(ids(true), ids(false));
  }, [stories, accessOf]);
  const [pickedMonth, setMonth] = useState<string | null>(null);

  const loadLast = useCallback(() => {
    if (supported) history().then((h) => setLast(h[0] ?? null), (e) => console.warn('[tidy] history failed:', e));
  }, [supported]);
  useFocusEffect(useCallback(() => {
    if (supported) hasFullAccess().then(setAccess, () => setAccess(false));
    loadLast();
  }, [supported, loadLast]));
  useEffect(loadLast, [s.moved, loadLast]);
  // started before: scan again on open (new photos), quick from the cached checks
  useEffect(() => {
    if (supported && access && s.phase === 'idle' && !indexing) scannedBefore().then((y) => { if (y) startScan(); });
  }, [supported, access, s.phase, indexing]);

  const allowAll = async () => {
    await GalleryService.requestPermissions();
    const ok = await hasFullAccess();
    setAccess(ok);
    if (!ok) Linking.openSettings();
  };
  const toDump = async (mode: 'add' | 'new') => {
    const keepers = s.moved!.keepers.map((p) => ({ id: p.id, uri: p.uri, created: p.created }));
    clearMoved();
    await receiveShared(keepers, mode);
    router.navigate({ pathname: '/create', params: { shared: String(Date.now()) } });
  };
  const [draft, setDraft] = useState(false);
  useEffect(() => { if (s.moved?.keepers.length) currentCreateDraft().then((d) => setDraft(!!d?.photos.length)); }, [s.moved]);

  const r = s.result;
  // months with something in a pile, newest first; done = nothing left picked in it
  const months = useMemo(() => {
    const m = new Map<string, number>();
    if (r) for (const k of SHOWN) for (const x of r.piles[k]) m.set(monthOf(x.p.created), (m.get(monthOf(x.p.created)) ?? 0) + (x.pre ? 1 : 0));
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [r]);
  // a month a rescan emptied reads as All months
  const month = pickedMonth && months.some(([k]) => k === pickedMonth) ? pickedMonth : null;
  const inMonth = useCallback((ms: number) => !month || monthOf(ms) === month, [month]);
  const picked = r ? SHOWN.flatMap((k) => r.piles[k].filter((x) => x.pre && inMonth(x.p.created))) : [];
  const header = <TopHeader title={tr('tidy.title')} right={supported && access ? <IconButton label={tr('tidy.trashHistory')} onPress={() => router.push('/tidy/history')}><Icons.clock size={17} /></IconButton> : null} />;

  if (!supported) return (
    <Screen>{header}
      <Note title={tr('tidy.unsupportedTitle')} body={tr('tidy.unsupportedBody')} />
    </Screen>
  );
  if (access === false) return (
    <Screen>{header}
      <Note title={tr('tidy.permissionTitle')} body={tr('tidy.permissionBody')}>
        <View style={{ alignSelf: 'flex-start' }}><Button text={tr('tidy.allowAll')} onPress={allowAll} /></View>
      </Note>
    </Screen>
  );

  return (
    <Screen>
      {header}
      {s.moved ? (
        <Note title={tr('tidy.movedToTrash', { count: n(s.moved.n) })} body={tr('tidy.movedBackInfo', { bytes: bytes(s.moved.bytes) })}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button primary={false} text={tr('tidy.undo')} label={tr('tidy.undoLabel')} onPress={() => restore(s.moved!.session)} />
            <Button primary={false} text={tr('tidy.done')} onPress={clearMoved} />
          </View>
          {s.moved.keepers.length ? (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text style={[ui(12.5, 500), { color: t.ink }]}>
                {tr('tidy.keptKeepersPrompt', { count: s.moved.keepers.length, total: s.moved.from })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button text={tr('tidy.startDump')} onPress={() => toDump('new')} />
                {draft ? <Button primary={false} text={tr('tidy.addToDraft')} onPress={() => toDump('add')} /> : null}
              </View>
            </View>
          ) : null}
        </Note>
      ) : null}

      {s.phase === 'idle' || s.phase === 'error' ? (
        <Note title={s.phase === 'error' ? tr('tidy.scanStoppedTitle') : tr('tidy.findRepeatsTitle')}
          body={s.phase === 'error' ? tr('tidy.scanStoppedBody') : tr('tidy.findRepeatsBody')}>
          <View style={{ alignSelf: 'flex-start' }}>
            <Button text={s.phase === 'error' ? tr('tidy.tryAgain') : tr('tidy.start')} label={s.phase === 'error' ? tr('tidy.tryAgain') : tr('tidy.startTidy')} onPress={() => { if (!indexing) startScan(); }} />
          </View>
          {indexing ? <Text style={[ui(11), { color: t.inkMuted }]}>{tr('tidy.waitingIndexing')}</Text> : null}
        </Note>
      ) : s.phase !== 'done' ? (
        <FrameCard radius={16} padding={16} style={{ gap: 6, marginTop: 8 }}>
          <Text style={[display(19, 1.12), { color: t.ink }]}>{r ? tr('tidy.stillScanning') : tr('tidy.scanning')}</Text>
          <Text style={[ui(12), { color: t.inkMuted }]}>
            {s.phase === 'list' || s.phase === 'group' ? phaseText(s.phase)
              : `${phaseText(s.phase)}${s.at && s.phase === 'check' ? ` ${new Date(s.at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : ''} · ${tr('tidy.doneOfTotal', { done: n(s.done), total: n(s.total) })}`}
          </Text>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: t.borderStrong, overflow: 'hidden' }}>
            <View style={{ width: `${s.total ? (100 * s.done) / s.total : 0}%`, height: 4, backgroundColor: t.ink }} />
          </View>
        </FrameCard>
      ) : null}

      {r && s.phase === 'done' ? (
        <>
          <Text style={[ui(12), { color: t.inkMuted, marginTop: 2 }]}>
            {picked.length ? tr('tidy.couldGo', { photos: n(picked.length), bytes: bytes(picked.reduce((a, x) => a + x.p.size, 0)) }) : tr('tidy.nothingPicked')}
          </Text>
          {months.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
              <Pill label={tr('tidy.allMonths')} on={!month} onPress={() => setMonth(null)} height={30} size={11.5} />
              {months.map(([k, left]) => (
                <Pill key={k} label={left ? `${monthLabel(k)} · ${n(left)}` : monthLabel(k)} on={month === k} onPress={() => setMonth(month === k ? null : k)} height={30} size={11.5}
                  left={left ? undefined : <Icons.check size={12} color={month === k ? t.bgScreen : t.ink} />} />
              ))}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {SHOWN.map((k) => {
              const items = r.piles[k].filter((x) => inMonth(x.p.created));
              if (!items.length) return null;
              const inSets = r.sets.filter((st) => inMonth(st.photos[st.keeper].created));
              const sets = inSets.length;
              const mb = bytes(items.filter((x) => k === 'same' ? x.pre : true).reduce((a, x) => a + x.p.size, 0));
              const line = k === 'same' ? tr('tidy.sameLine', { sets: tr('create.setsCount', { count: sets }), photos: n(items.length), size: mb })
                : k === 'private' ? tr('tidy.privateLine', { count: n(items.length) })
                : `${n(items.length)} · ${mb}${REVIEW_ONLY.has(k) ? ` · ${tr('tidy.reviewOnly')}` : ''}`;
              const wide = k === 'same';
              return (
                <Tap key={k} accessibilityRole="button" accessibilityLabel={`${PILES[k].title}, ${line}`}
                  onPress={() => router.push({ pathname: '/tidy/swipe', params: { pile: k, ...(month ? { month } : {}) } })}
                  style={{ flexBasis: wide ? '100%' : '47%', flexGrow: 1, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, boxShadow: t.shadowCard, borderRadius: 14, padding: 6 }}>
                  <Mosaic wide={wide} uris={(wide ? inSets.map((st) => st.photos[st.keeper]) : items.map((x) => x.p)).slice(0, 3).map((p) => p.uri)} />
                  <Text style={[display(15.5), { color: t.ink, marginTop: 6, paddingHorizontal: 3 }]} numberOfLines={1}>{PILES[k].title}</Text>
                  <Text style={[ui(10.5), { color: t.inkMuted, marginTop: 1, paddingHorizontal: 3, paddingBottom: 3 }]} numberOfLines={1}>{line}</Text>
                </Tap>
              );
            })}
          </View>
          <Tap onPress={startScan} accessibilityRole="button" style={{ alignSelf: 'center', padding: 10 }}>
            <Text style={[ui(11, 600), { color: t.inkMuted }]}>{tr('tidy.scanAgain')}</Text>
          </Tap>
        </>
      ) : null}
      {last ? (
        <Text style={[ui(11), { color: t.inkMuted, textAlign: 'center', marginTop: 8 }]}>
          {tr('tidy.lastTidyInfo', { date: day(last.session), count: n(last.n) })}
        </Text>
      ) : null}
    </Screen>
  );
}
