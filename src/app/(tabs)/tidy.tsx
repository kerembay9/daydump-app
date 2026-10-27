import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { Screen } from '../../components/ui/Screen';
import { IconButton, TopHeader } from '../../components/ui/TopHeader';
import { FrameCard } from '../../components/ui/FrameCard';
import { PhotoStack } from '../../components/ui/PhotoStack';
import { Tape } from '../../components/ui/Tape';
import { Tap } from '../../components/ui/Tap';
import { Icons } from '../../components/ui/Icons';
import { useProgress } from '../../state/AppState';
import { GalleryService } from '../../services/galleryService';
import { currentCreateDraft, receiveShared } from '../../services/dumps';
import { Pile, PILES } from '../../services/tidy/rules';
import { formatBytes as bytes } from '../../components/tidy/TidyGrid';
import { clearMoved, hasFullAccess, history, restore, scannedBefore, Session, startScan, tidySupported, useTidy } from '../../services/tidy/scan';

const SHOWN: Pile[] = ['same', 'copies', 'screens', 'blurry', 'paper', 'chats', 'private'];
const REVIEW_ONLY = new Set<Pile>(['paper', 'chats']);

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

const PHASE = { list: 'Listing your photos…', embed: 'Reading photos Discover skips', check: 'Checking', group: 'Finding same shots…' } as const;

/** Tidy (keepers): repeats and clutter in piles, each photo in one; everything removed goes to Trash, with undo and a history. */
export default function Tidy() {
  const { t } = useTheme();
  const s = useTidy();
  const indexing = !!useProgress().progress;
  const [access, setAccess] = useState<boolean | null>(null);
  const [last, setLast] = useState<Session | null>(null);
  const supported = tidySupported();

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
  const picked = r ? SHOWN.flatMap((k) => r.piles[k].filter((x) => x.pre)) : [];
  const header = <TopHeader title="Tidy" right={supported && access ? <IconButton label="Trash history" onPress={() => router.push('/tidy/history')}><Icons.clock size={17} /></IconButton> : null} />;

  if (!supported) return (
    <Screen>{header}
      <Note title="Needs Android 11 or newer" body="Older Android has no Trash, so anything Tidy removed would be gone for good." />
    </Screen>
  );
  if (access === false) return (
    <Screen>{header}
      <Note title="Tidy needs access to all your photos to count them." body="With only some photos shared, repeats and sizes would be half the story.">
        <View style={{ alignSelf: 'flex-start' }}><Button text="Allow all photos" onPress={allowAll} /></View>
      </Note>
    </Screen>
  );

  return (
    <Screen>
      {header}
      {s.moved ? (
        <Note title={`Moved ${n(s.moved.n)} to Trash`} body={`${bytes(s.moved.bytes)} back · Space comes back when Trash empties.`}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button primary={false} text="Undo" label="Undo the move to Trash" onPress={() => restore(s.moved!.session)} />
            <Button primary={false} text="Done" onPress={clearMoved} />
          </View>
          {s.moved.keepers.length ? (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text style={[ui(12.5, 500), { color: t.ink }]}>
                Kept {s.moved.keepers.length} of {s.moved.from}. Start a dump from these keepers?
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button text="Start a dump" onPress={() => toDump('new')} />
                {draft ? <Button primary={false} text="Add to my draft" onPress={() => toDump('add')} /> : null}
              </View>
            </View>
          ) : null}
        </Note>
      ) : null}

      {s.phase === 'idle' || s.phase === 'error' ? (
        <Note title={s.phase === 'error' ? 'The scan stopped' : 'Find repeats and clutter.'}
          body={s.phase === 'error' ? 'Something went wrong reading your photos. Nothing was moved.' : 'Nothing leaves your device. Anything you remove goes to Trash first, and you can undo it.'}>
          <View style={{ alignSelf: 'flex-start' }}>
            <Button text={s.phase === 'error' ? 'Try again' : 'Start'} label={s.phase === 'error' ? 'Try again' : 'Start Tidy'} onPress={() => { if (!indexing) startScan(); }} />
          </View>
          {indexing ? <Text style={[ui(11), { color: t.inkMuted }]}>Waiting for your photos to finish indexing.</Text> : null}
        </Note>
      ) : s.phase !== 'done' ? (
        <FrameCard radius={16} padding={16} style={{ gap: 6, marginTop: 8 }}>
          <Text style={[display(19, 1.12), { color: t.ink }]}>{r ? 'Still scanning…' : 'Scanning'}</Text>
          <Text style={[ui(12), { color: t.inkMuted }]}>
            {s.phase === 'list' || s.phase === 'group' ? PHASE[s.phase]
              : `${PHASE[s.phase]}${s.at && s.phase === 'check' ? ` ${new Date(s.at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : ''} · ${n(s.done)} of ${n(s.total)}`}
          </Text>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: t.borderStrong, overflow: 'hidden' }}>
            <View style={{ width: `${s.total ? (100 * s.done) / s.total : 0}%`, height: 4, backgroundColor: t.ink }} />
          </View>
        </FrameCard>
      ) : null}

      {r && s.phase === 'done' ? (
        <>
          <FrameCard radius={18} padding={16} style={{ marginTop: 12, gap: 2 }}>
            <Tape seed="tidy-hero" rotate={2} style={{ position: 'absolute', top: -9, right: 24 }} />
            <Text style={[display(34, 1), { color: t.ink }]}>{n(picked.length)}</Text>
            <Text style={[ui(13, 600), { color: t.ink }]}>{picked.length ? 'duplicates and photos you don’t use' : 'Nothing picked to clear right now'}</Text>
            {picked.length ? (
              <Text style={[ui(11), { color: t.inkMuted, marginTop: 4 }]}>
                About {bytes(picked.reduce((a, x) => a + x.p.size, 0))} back · Space comes back when Trash empties.
              </Text>
            ) : null}
          </FrameCard>
          <View style={{ gap: 8, marginTop: 12 }}>
            {SHOWN.map((k) => {
              const items = r.piles[k];
              if (!items.length) return null;
              const mb = bytes(items.filter((x) => k === 'same' ? x.pre : true).reduce((a, x) => a + x.p.size, 0));
              const line = k === 'same' ? `${n(r.sets.length)} set${r.sets.length === 1 ? '' : 's'} · ${n(items.length)} photos · ${mb}`
                : k === 'private' ? `${n(items.length)} · Check these yourself.`
                : `${n(items.length)} · ${mb}${REVIEW_ONLY.has(k) ? ' · review only' : ''}`;
              return (
                <Tap key={k} accessibilityRole="button" accessibilityLabel={`${PILES[k].title}, ${line}`}
                  onPress={() => (k === 'same' ? router.push('/tidy/sets') : router.push({ pathname: '/tidy/[pile]', params: { pile: k } }))}
                  style={{ backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, boxShadow: t.shadowCard, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <PhotoStack kind="row" uris={items.slice(0, 3).map((x) => x.p.uri)} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[display(16.5), { color: t.ink }]}>{PILES[k].title}</Text>
                    <Text style={[ui(10.5), { color: t.inkMuted, marginTop: 2 }]}>{line}</Text>
                  </View>
                  <Icons.chevron size={16} color={t.inkMuted} />
                </Tap>
              );
            })}
          </View>
          <Tap onPress={startScan} accessibilityRole="button" style={{ alignSelf: 'center', padding: 10 }}>
            <Text style={[ui(11, 600), { color: t.inkMuted }]}>Scan again</Text>
          </Tap>
        </>
      ) : null}
      {last ? (
        <Text style={[ui(11), { color: t.inkMuted, textAlign: 'center', marginTop: 8 }]}>
          Last tidy: {day(last.session)} · {n(last.n)} photos cleared
        </Text>
      ) : null}
    </Screen>
  );
}
