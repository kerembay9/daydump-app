import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, ScrollView, Text, TextInput, ToastAndroid, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/ui/Screen';
import { FrameCard } from '../components/ui/FrameCard';
import { IconButton } from '../components/ui/TopHeader';
import { Icons } from '../components/ui/Icons';
import { Tap } from '../components/ui/Tap';
import { Confirm, ConfirmSpec } from '../components/ui/Sheet';
import { DebugStoriesModal } from '../components/DebugStoriesModal';
import { ModelBench } from '../components/ModelBench';
import { LegalDocType, LegalModal } from '../components/LegalModal';
import { PrivacyModal } from '../components/OnboardingModal';
import { AvatarSheet } from '../components/AvatarSheet';
import { useTheme, ThemeMode, ThemeNow } from '../theme/ThemeProvider';
import { useApp } from '../state/AppState';
import { display, label, ui } from '../theme/type';
import { getProfile, Profile as ProfileT, profileNow, setProfile } from '../services/profile';
import { list } from '../services/dumps';
import { ratioOf } from '../services/layouts';
import { resetIndex } from '../services/index/photoIndex';
import { NotificationService } from '../services/notificationService';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { cycleFakeSubscription, getSubscription, MANAGE_URL, Sub } from '../services/subscription';

/** Default Post Size tap order (the mock's cycleDefaultRatio). */
const RATIO_CYCLE = ['4:5', '9:16', '1:1', '3:4'];
const THEMES: { mode: ThemeMode; name: string; sub: string; swatch: string[] }[] = [
  { mode: 'system', name: 'System', sub: 'Auto', swatch: ['#EFE6DA', '#241D14'] },
  { mode: 'light', name: 'Cashmere', sub: 'Light', swatch: ['#EFE6DA'] },
  { mode: 'dark', name: 'Espresso', sub: 'Dark', swatch: ['#241D14'] },
];
const DEV_TAPS = 5;
const toast = (m: string) => (Platform.OS === 'android' ? ToastAndroid.show(m, ToastAndroid.SHORT) : console.log('[profile]', m));
const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Profile & Settings (ph7.png; plus accounts, daily recap, photo library, about and dev tools). */
export default function Profile() {
  // the theme is picked here: repaint this screen at once, the screens under it later
  return <ThemeNow><ProfileBody /></ThemeNow>;
}

function ProfileBody() {
  const { t, mode, setMode } = useTheme();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<ProfileT>(profileNow);
  const [dumps, setDumps] = useState(0);
  const [access, setAccess] = useState<'all' | 'limited' | 'none' | null>(null);
  const [recap, setRecap] = useState(true);
  const [legal, setLegal] = useState<LegalDocType | null>(null);
  const [debug, setDebug] = useState(false);
  const [bench, setBench] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [sub, setSub] = useState<Sub | null>(null);
  const taps = useRef<number[]>([]);

  // Leaving while a field is still focused: Android may not fire onEndEditing, so save typed text on the way out.
  const typed = useRef({ name: p.name, handle: p.handle });
  useEffect(() => { typed.current = { name: p.name.trim(), handle: p.handle }; }, [p.name, p.handle]);
  useFocusEffect(useCallback(() => {
    getProfile().then(setP);
    const flushTyped = () => {
      const v = typed.current, cur = profileNow();
      if (v.name !== cur.name || v.handle !== cur.handle) setProfile(v).catch(() => {});
    };
    list().then((d) => setDumps(d.length), () => {});
    MediaLibrary.getPermissionsAsync(false, ['photo']).then((r) => setAccess(r.accessPrivileges ?? (r.granted ? 'all' : 'none')), () => setAccess(null));
    NotificationService.isEnabled().then(setRecap);
    getSubscription().then(setSub);
    return flushTyped;
  }, []));

  /** Saves a change; the field edits (name, handle) save when editing ends, so one write per edit. */
  const save = (patch: Partial<ProfileT>) => {
    setP((x) => ({ ...x, ...patch }));
    setProfile(patch).catch((e) => console.warn('[profile] save failed:', e));
  };

  /** Our own small copy: the picker's file lives in the cache, and a library photo can be deleted. */
  const setAvatarFrom = async (src: string) => {
    try {
      const img = await ImageManipulator.manipulate(src).resize({ width: 512 }).renderAsync();
      const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      img.release();
      const dest = new File(Paths.document, `avatar-${Date.now()}.jpg`);
      new File(out.uri).copy(dest);
      dropAvatarFile(p.avatar);
      save({ avatar: dest.uri });
    } catch (e) {
      console.warn('[profile] avatar save failed:', e);
      toast('Couldn’t use that photo');
    }
  };
  const pickAvatar = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!r.canceled && r.assets[0]) await setAvatarFrom(r.assets[0].uri);
  };

  const toggleRecap = async () => {
    const want = !recap;
    setRecap(want);
    const ok = await NotificationService.setEnabled(want);
    if (!ok) { setRecap(false); toast('Notifications are off for DayDump in Android settings'); }
  };

  const toggleSensitive = () => {
    setP((x) => ({ ...x, hideSensitive: !x.hideSensitive }));
    setProfile({ hideSensitive: !p.hideSensitive }).then(app.rebuildStories, (e) => console.warn('[profile] save failed:', e));
  };

  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const reindex = () => setConfirm({
    title: 'Reindex your library?',
    body: 'DayDump will read every photo again. This takes a few minutes and some battery. Your dumps in Library are kept.',
    action: 'Reindex',
    onConfirm: () => { resetIndex().then(app.refreshStories, (e) => console.warn('[profile] reindex failed:', e)); },
  });

  // the countdown is the Version row's subtitle: a toast would queue and outlive the tools appearing
  const [devHint, setDevHint] = useState('');
  const versionTap = () => {
    if (p.dev) return toast('Developer tools are on');
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 3000), now];
    const left = DEV_TAPS - taps.current.length;
    if (left <= 0) { taps.current = []; save({ dev: true }); }
    setDevHint(left > 0 && left <= 2 ? `${left} more tap${left > 1 ? 's' : ''} for developer tools` : '');
  };

  const { progress, paused } = app;
  const indexLine = progress ? `Reading ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`
    : paused ? `Paused at ${paused.done.toLocaleString()} of ${paused.total.toLocaleString()}`
    : app.library ? `${app.library.photos.length.toLocaleString()} photos ready` : 'Not read yet';
  const accessLine = access === 'all' ? 'All photos' : access === 'limited' ? 'Selected photos only' : access === 'none' ? 'Not allowed' : '…';
  const ratio = ratioOf(p.ratio);

  return (
    <Screen keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
      <View style={{ paddingTop: 2, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton label="Back" onPress={back}><Icons.back size={16} /></IconButton>
        <Text style={[display(20), { color: t.ink }]}>Profile &amp; Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <FrameCard radius={20} padding={12} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Tap onPress={() => setAvatarSheet(true)} accessibilityRole="button" accessibilityLabel="Change profile photo">
            <FrameCard radius={27} style={{ width: 54, height: 54, padding: 2 }}>
              <View style={{ flex: 1, borderRadius: 25, overflow: 'hidden', backgroundColor: t.accentFab, alignItems: 'center', justifyContent: 'center' }}>
                {p.avatar ? <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  : p.name.trim() ? <Text style={[display(22), { color: t.accentFabText }]}>{p.name.trim()[0].toUpperCase()}</Text>
                  : <Icons.user size={22} color={t.accentFabText} />}
              </View>
            </FrameCard>
            <View style={{ position: 'absolute', right: -1, bottom: -1, width: 18, height: 18, borderRadius: 9, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Icons.edit size={10} color={t.bgScreen} />
            </View>
          </Tap>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TextInput value={p.name} onChangeText={(name) => setP((x) => ({ ...x, name }))} onEndEditing={() => save({ name: p.name.trim() })}
              placeholder="Your name" placeholderTextColor={t.inkMuted} returnKeyType="done" maxLength={40}
              style={[display(20), { color: t.ink, padding: 0 }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
              <Text style={[ui(11.5, 500), { color: t.inkMuted }]}>@</Text>
              <TextInput value={p.handle} onChangeText={(h) => setP((x) => ({ ...x, handle: h.replace(/[@\s]/g, '') }))} onEndEditing={() => save({ handle: p.handle })}
                placeholder="your_account" placeholderTextColor={t.inkMuted} autoCapitalize="none" autoCorrect={false} returnKeyType="done" maxLength={30}
                style={[ui(11.5, 500), { color: t.inkMuted, padding: 0, flex: 1 }]} />
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: t.borderSubtle, marginTop: 10, paddingTop: 10 }}>
          <Stat n={app.stories.length} label="Discover" onPress={() => router.navigate('/')} />
          <Stat n={app.library?.photos.length ?? 0} label="Total Photos" onPress={() => router.navigate('/create')} />
          <Stat n={dumps} label="Library" onPress={() => router.navigate('/library')} />
        </View>
      </FrameCard>

      <SubCard sub={sub} />

      <Section title="Connected accounts">
        <Row label="Connect Instagram" right={<Soon />} />
        <Row label="Connect TikTok" right={<Soon />} last />
      </Section>

      <Section title="Social post & size defaults" note="New dumps start with these.">
        <Row label="Default Post Size" onPress={() => save({ ratio: RATIO_CYCLE[(RATIO_CYCLE.indexOf(ratio.key) + 1) % RATIO_CYCLE.length] })}
          right={<View style={{ backgroundColor: t.ink, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={[ui(10.5, 600), { color: t.bgScreen }]}>{`${ratio.key} (${ratio.sub})`}</Text></View>} />
        <Row label="Default Frame Style" onPress={() => save({ fit: p.fit === 'border' ? 'bleed' : 'border' })}
          right={<Text style={[ui(11, 500), { color: t.inkMuted }]}>{p.fit === 'border' ? 'Cashmere Border' : 'Full Bleed Crop'}</Text>} />
        <Row label="Default Export Quality" onPress={() => save({ exportHD: !p.exportHD })}
          right={<Text style={[ui(11, 500), { color: t.inkMuted }]}>{p.exportHD ? 'HD (2160 px)' : 'Standard (1080 px)'}</Text>} last />
      </Section>

      <Section title="Appearance & theme" pad>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {THEMES.map((th) => {
            const on = mode === th.mode;
            return (
              <Tap key={th.mode} onPress={() => setMode(th.mode)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ flex: 1, paddingVertical: 7, borderRadius: 12, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: on ? t.ink : t.borderSubtle, backgroundColor: on ? t.ink : 'transparent' }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)' }}>
                  {th.swatch.map((c) => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}
                </View>
                <Text style={[ui(10.5, 600), { color: on ? t.bgScreen : t.ink }]}>{th.name}</Text>
                <Text style={[ui(9), { color: on ? t.bgScreen : t.inkMuted, opacity: on ? 0.75 : 1 }]}>{th.sub}</Text>
              </Tap>
            );
          })}
        </View>
      </Section>

      <Section title="Data privacy">
        <Row label="Everything happens on your phone" sub="How DayDump picks photos without uploading them" onPress={() => setPrivacy(true)} right={<Icons.chevron size={14} color={t.inkMuted} />} last />
      </Section>

      <Section title="Daily recap">
        <Row label="8 PM recap" sub="A nudge when today’s dump is ready" onPress={toggleRecap} toggle={recap} last />
      </Section>

      <Section title="Photo library">
        <Row label="Access" right={access && access !== 'all'
          ? <SmallBtn label="Open settings" onPress={() => Linking.openSettings()} />
          : <Text style={[ui(11, 500), { color: t.inkMuted }]}>{accessLine}</Text>}
          sub={access && access !== 'all' ? accessLine : undefined} />
        <Row label="Hide sensitive photos" sub="IDs, bank cards and medical papers never show up in dumps." onPress={toggleSensitive} toggle={p.hideSensitive} />
        <Row label="Index" sub={indexLine} last right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {progress && progress.batteryPct !== undefined && <SmallBtn label="Pause" onPress={app.pause} />}
            {paused && !progress && <SmallBtn label="Resume" onPress={app.resume} />}
            {!progress && <SmallBtn label="Reindex" onPress={reindex} />}
          </View>} />
      </Section>

      <Section title="About">
        <Row label="Terms of Service" onPress={() => setLegal('terms')} right={<Icons.chevron size={14} color={t.inkMuted} />} />
        <Row label="Privacy Policy" onPress={() => setLegal('privacy')} right={<Icons.chevron size={14} color={t.inkMuted} />} />
        <Row label="Contact" onPress={() => Linking.openURL('mailto:support@daydump.app?subject=DayDump').catch(() => toast('No mail app found. Write to support@daydump.app'))} right={<Text style={[ui(11, 500), { color: t.inkMuted }]}>support@daydump.app</Text>} />
        <Row label="Version" sub={devHint || undefined} onPress={versionTap} right={<Text style={[ui(11, 500), { color: t.inkMuted }]}>{Constants.expoConfig?.version ?? '–'}</Text>} last />
      </Section>

      {p.dev && (
        <Section title="Developer tools">
          <Row label="Stories debug" onPress={() => setDebug(true)} right={<Icons.chevron size={14} color={t.inkMuted} />} />
          {__DEV__ && <Row label="Model bench" onPress={() => setBench(true)} right={<Icons.chevron size={14} color={t.inkMuted} />} />}
          <Row label="Selfie experiment" onPress={() => router.push('/selfie')} right={<Icons.chevron size={14} color={t.inkMuted} />} />
          <Row label="People experiment" onPress={() => router.push('/people')} right={<Icons.chevron size={14} color={t.inkMuted} />} />
          {__DEV__ && <Row label="Fake Pro subscription" sub={sub ? `${sub.plan}, ${sub.renews ? 'renewing' : 'cancelled'}` : 'Off'} onPress={() => cycleFakeSubscription(sub).then(setSub)} />}
          <Row label="Send 8 PM recap now" sub="No dump today yet: uses the top story's cover" onPress={() => {
            const cover = (app.stories.find((s) => s.kind === 'today') ?? app.stories[0])?.picks[0]?.uri;
            if (cover) ClipEmbedder?.setRecapCover(cover);
            NotificationService.sendTestNotification().catch((e) => toast(e.message));
          }} />
          <Row label="Show onboarding" onPress={app.showOnboarding} right={<Icons.chevron size={14} color={t.inkMuted} />} />
          <Row label="Hide developer tools" onPress={() => save({ dev: false })} last />
        </Section>
      )}

      <PrivacyModal visible={privacy} onClose={() => setPrivacy(false)} />
      <AvatarSheet visible={avatarSheet} onClose={() => setAvatarSheet(false)} hasAvatar={!!p.avatar} onUse={setAvatarFrom} onGallery={pickAvatar}
        onRemove={() => { dropAvatarFile(p.avatar); save({ avatar: '' }); }} />
      <LegalModal visible={legal != null} type={legal ?? 'terms'} onClose={() => setLegal(null)} />
      <DebugStoriesModal visible={debug} onClose={() => setDebug(false)} onResetIndex={app.refreshStories} />
      <BenchModal visible={bench} onClose={() => setBench(false)} />
      <Confirm c={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}

function dropAvatarFile(uri: string) {
  if (!uri) return;
  try { new File(uri).delete(); } catch { /* already gone */ }
}

const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** DayDump Pro: a Go Pro call to action (store not wired yet: coming soon), or the plan and when it renews / ends. */
function SubCard({ sub }: { sub: Sub | null }) {
  const { t } = useTheme();
  return (
    <FrameCard radius={20} padding={12} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.accentFab, alignItems: 'center', justifyContent: 'center' }}>
        <Icons.sparkle size={16} color={t.accentFabText} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[display(17), { color: t.ink }]}>DayDump Pro</Text>
        <Text style={[ui(10.5), { color: t.inkMuted, marginTop: 1 }]}>
          {!sub ? 'Extra features for DayDump, coming soon.' : `${sub.plan} · ${sub.renews ? `renews ${date(sub.until)}` : `ends ${date(sub.until)}, won’t renew`}`}
        </Text>
      </View>
      {sub ? <SmallBtn label="Manage" onPress={() => Linking.openURL(MANAGE_URL).catch(() => toast('Couldn’t open the store'))} />
        : (
          <Tap onPress={() => toast('DayDump Pro is coming soon')} accessibilityRole="button" accessibilityLabel="Go Pro"
            style={{ height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: t.ink, justifyContent: 'center' }}>
            <Text style={[ui(11.5, 600), { color: t.bgScreen }]}>Go Pro</Text>
          </Tap>
        )}
    </FrameCard>
  );
}

function Stat({ n, label: l, onPress }: { n: number; label: string; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[display(17), { color: t.ink }]}>{n.toLocaleString()}</Text>
      <Text style={[ui(10), { color: t.inkMuted, marginTop: 2 }]}>{l}</Text>
    </Tap>
  );
}

/** Section label (10px uppercase, tracking .12em) over a frame-card of divided rows (or padded content). */
function Section({ title, note, pad, children }: { title: string; note?: string; pad?: boolean; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[label(10, 0.12), { color: t.inkMuted, marginBottom: 4, paddingHorizontal: 4 }]}>{title}</Text>
      <FrameCard radius={18} padding={pad ? 8 : 0} style={{ overflow: 'hidden' }}>{children}</FrameCard>
      {note ? <Text style={[ui(10), { color: t.inkMuted, marginTop: 4, paddingHorizontal: 4 }]}>{note}</Text> : null}
    </View>
  );
}

/** `toggle` set: the row is one switch to accessibility (the Toggle drawn on the right is visual only). */
function Row({ label: l, sub, right, onPress, last, toggle }: { label: string; sub?: string; right?: React.ReactNode; onPress?: () => void; last?: boolean; toggle?: boolean }) {
  const { t } = useTheme();
  const body = (
    <View style={{ paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: last ? 0 : 1, borderColor: t.borderSubtle }}>
      <View style={{ flexShrink: 1 }}>
        <Text style={[ui(12, 500), { color: t.ink }]}>{l}</Text>
        {sub ? <Text style={[ui(10.5), { color: t.inkMuted, marginTop: 1 }]}>{sub}</Text> : null}
      </View>
      {toggle === undefined ? right : <Toggle on={toggle} />}
    </View>
  );
  return onPress ? <Tap onPress={onPress} accessibilityRole={toggle === undefined ? 'button' : 'switch'} accessibilityState={toggle === undefined ? undefined : { checked: toggle }}>{body}</Tap> : body;
}

/** Mock toggle: 36x20 track (ink on, 18% black off), 16px screen-coloured knob. */
function Toggle({ on }: { on: boolean }) {
  const { t } = useTheme();
  return (
    <View style={{ width: 36, height: 20, borderRadius: 10, padding: 2, backgroundColor: on ? t.ink : t.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)' }}>
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: t.bgScreen, transform: [{ translateX: on ? 16 : 0 }] }} />
    </View>
  );
}

function Soon() {
  const { t } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: t.borderStrong, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={[label(9, 0.1), { color: t.inkMuted }]}>Soon</Text>
    </View>
  );
}

function SmallBtn({ label: l, onPress }: { label: string; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" hitSlop={6}
      style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: t.borderStrong, justifyContent: 'center' }}>
      <Text style={[ui(11, 600), { color: t.ink }]}>{l}</Text>
    </Tap>
  );
}

/** ModelBench in a sheet (it was nested in Stories debug). */
function BenchModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { library } = useApp();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* ModelBench is styled dark (a dev tool), like Stories debug */}
      <View style={{ flex: 1, backgroundColor: '#0A0A0C', paddingTop: insets.top + 8 }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[display(22), { color: '#fff' }]}>Model bench</Text>
          <IconButton label="Close" onPress={onClose}><Icons.close size={16} /></IconButton>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          {visible && <ModelBench lib={library} />}
        </ScrollView>
      </View>
    </Modal>
  );
}
