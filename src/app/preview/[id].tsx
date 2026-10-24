import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, ToastAndroid, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../state/AppState';
import { markSeen, Story, storyById } from '../../services/stories';
import { draftForStory, Dump, get, isDumpId, list, storyAsDump, storyDraft } from '../../services/dumps';
import { captionIdeas, captionInput, hashtags } from '../../services/captions';
import { filterOf } from '../../services/filters';
import { chunk, fitOf, layoutOf, ratioOf } from '../../services/layouts';
import { getProfile, profileNow, setProfile } from '../../services/profile';
import { postDump, saveOnly } from '../../services/post';
import { postDeps } from '../../services/shareService';
import { exportSlides } from '../../services/slides';
import type { Library } from '../../services/index/photoIndex';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { Screen } from '../../components/ui/Screen';
import { Stub } from '../../components/ui/Stub';
import { FrameCard } from '../../components/ui/FrameCard';
import { IconButton } from '../../components/ui/TopHeader';
import { Icons } from '../../components/ui/Icons';
import { Tap } from '../../components/ui/Tap';
import { usePreviewImages } from '../../components/edit/SlidePager';
import { IgGrid, IgPost, PostView, TikTok } from '../../components/preview/PostMocks';
import { Done, DoneSheet } from '../../components/preview/DoneSheet';
import { APPS, PostSheet } from '../../components/preview/PostSheet';
import { shareTargets, ShareTarget } from '../../../modules/clip-embedder';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const toast = (m: string) => (Platform.OS === 'android' ? ToastAndroid.show(m, ToastAndroid.LONG) : console.log('[preview]', m));

/**
 * Posted Preview (ph6.png): a dump (Library, Edit's Preview pill) or a Discover story (its draft if it has one, else
 * its picks with the new-draft defaults; nothing is saved until Post).
 */
export default function Preview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stories, library, loaded } = useApp();
  const story = isDumpId(id) ? undefined : storyById(stories, id);
  // undefined = still loading; null = gone (deleted dump, unknown story id)
  const [found, setDump] = useState<Dump | null | undefined>(undefined);
  useEffect(() => {
    if (isDumpId(id)) get(id).then(setDump, () => setDump(null));
    // warm the profile first: storyAsDump reads its size / frame defaults synchronously (cold start from the 8 PM recap)
    else if (story) getProfile().then(() => storyDraft(story.id)).then((d) => setDump(d ?? storyAsDump(story)), () => setDump(storyAsDump(story)));
  }, [id, story]);
  // a dump already up stays: a rebuild while indexing can drop or re-id its story (topic ids carry their start date)
  const dump = found ?? (!isDumpId(id) && !story && loaded ? null : found);

  if (dump === undefined) return null;
  // the 8 PM recap opens /preview/today even on a day with too few camera photos for a Today dump
  if (dump === null && id === 'today') return <Stub back title="Today" note="Nothing taken today yet. Take a few photos and your Today dump shows up here." />;
  if (dump === null) return <Stub back title="Preview" note="This dump is no longer available." />;
  if (!dump.photos.length) return <Stub back title="Preview" note="The photos in this dump are no longer on your phone." />;
  return <PostedPreview key={dump.id} dump={dump} story={stories.find((s) => s.id === dump.storyId)} stories={stories} library={library} />;
}

/**
 * Slides for Post / Save only, rendered ahead: one export at a time (each replaces the last's files), cached by what
 * the slides show; a superseded one is skipped, a failed one runs again on the next call.
 */
function exporter() {
  let cur: { key: string; p: Promise<string[]> } | null = null;
  return (d: Dump, highRes?: boolean) => {
    const key = JSON.stringify([d.photos.map((p) => [p.id, p.uri]), d.layout, d.ratio, d.fit, d.filter, !!highRes]);
    if (cur?.key === key) return cur.p;
    const prev = cur?.p.catch(() => {});
    const p: Promise<string[]> = Promise.resolve(prev).then(() => {
      if (cur?.p !== p) throw new Error('superseded');
      return exportSlides(d, { highRes });
    });
    p.catch(() => { if (cur?.p === p) cur = null; });
    cur = { key, p };
    return p;
  };
}

type Platform3 = 'ig' | 'grid' | 'tiktok';
const TABS: [Platform3, string][] = [['ig', 'IG Post'], ['grid', 'IG Profile Grid'], ['tiktok', 'TikTok 9:16']];

function PostedPreview({ dump: initial, story, stories, library }: { dump: Dump; story?: Story; stories: Story[]; library: Library | null }) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [dump, setDump] = useState(initial);
  const ratio = ratioOf(dump.ratio);
  const layout = layoutOf(dump.layout);
  const slides = useMemo(() => chunk(dump.photos, layout.key), [dump.photos, layout.key]);
  const images = usePreviewImages(dump.photos.map((p) => p.uri));
  const filter = useMemo(() => filterOf(dump.filter), [dump.filter]);

  const [platform, setPlatform] = useState<Platform3>(ratio.key === '9:16' ? 'tiktok' : 'ig');
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profile, setProf] = useState({ name: '', handle: '', bio: '', avatar: '' });
  // export quality for this dump only: starts at the Profile default (HD unless changed)
  const [hd, setHd] = useState(profileNow().exportHD);
  useEffect(() => { getProfile().then((p) => { setProf(p); setHd(p.exportHD); }); }, []);

  // caption: the one copied in Edit, else the first template idea
  const input = useMemo(() => captionInput(dump, story), [dump, story]);
  const tags = useMemo(() => hashtags(input), [input]);
  const caption = useMemo(() => dump.caption || captionIdeas(input)[0], [input, dump.caption]);

  // grid: your Posted dumps' covers, then your top Discover dumps' covers; never raw recent photos (often
  // screenshots and documents) nor this dump's own photos. Fewer than 8 → the rest stay empty tiles.
  const [postedCovers, setPostedCovers] = useState<string[]>([]);
  useEffect(() => { list('posted').then((ds) => setPostedCovers(ds.filter((d) => d.id !== dump.id).map((d) => d.photos[0]?.uri).filter(Boolean))); }, [dump.id]);
  const others = useMemo(() => {
    const mine = new Set(dump.photos.map((p) => p.uri));
    const out = new Set<string>();
    for (const u of [...postedCovers, ...stories.map((s) => s.picks[0]?.uri)]) {
      if (out.size >= 8) break;
      if (u && !mine.has(u)) out.add(u);
    }
    return [...out];
  }, [postedCovers, stories, dump.photos]);

  const onHandle = (raw: string) => {
    const handle = raw.replace(/[^A-Za-z0-9._]/g, '').toLowerCase().slice(0, 30);
    setProf((p) => ({ ...p, handle }));
    setProfile({ handle }).catch((e) => console.warn('[preview] handle save failed:', e));
  };

  const v: PostView = {
    slides, ratio: ratio.key, fit: fitOf(dump.fit), filter, images, index: Math.min(index, slides.length - 1), onIndex: setIndex,
    handle: profile.handle, name: profile.name, bio: profile.bio, avatar: profile.avatar, caption, tags, place: story?.place,
    liked, onLike: () => setLiked((x) => !x), saved, onSave: () => setSaved((x) => !x), onAvatar: () => router.push('/profile'),
  };

  // Post / Save only: one run at a time (a ref, so a fast double tap can't start two)
  const running = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [picking, setPicking] = useState(false);
  // installed once per Preview: back from installing an app re-opens Preview anyway
  const [targets] = useState(shareTargets);
  // The slides render in the background from the moment Preview opens (and again on a Quality change), so Post /
  // Save only just wait for what's left.
  const [exportFor] = useState(exporter);
  useEffect(() => { exportFor(dump, hd).catch((e) => e.message === 'superseded' || console.warn('[preview] export failed:', e)); }, [dump, hd, exportFor]);
  const deps = useMemo(() => ({ ...postDeps(stories), exportSlides: exportFor }), [stories, exportFor]);
  const n = slides.length;
  const slidesWord = `${n} slide${n === 1 ? '' : 's'}`;
  // no Instagram / TikTok on the phone: the system share sheet (target ignored)
  const post = () => (targets.length ? setPicking(true) : run('post', platform === 'tiktok' ? 'tiktok' : 'instagram'));
  const run = async (what: 'post' | 'save', target: ShareTarget = 'instagram') => {
    setPicking(false);
    if (running.current) return;
    running.current = true;
    const app = APPS[target].name;
    setBusy(what === 'post' ? `Opening ${app} (${slidesWord})…` : `Saving ${slidesWord}…`);
    try {
      if (what === 'post') {
        const r = await postDump(deps, dump, caption, tags, target, hd);
        if (r.marked) setDump((d) => ({ ...d, id: r.id, status: 'posted', caption }));
        // ponytail: set right away, not on AppState 'active': the share opened another app, so the sheet is what you see on return
        setDone({
          title: r.to === 'chooser' ? 'Shared' : `Posted to ${app}`,
          tab: r.marked ? 'posted' : 'draft',
          note: `Caption copied${r.saved ? ` · ${r.slides} slide${r.slides === 1 ? '' : 's'} saved to the DayDump album` : ''}.${r.marked ? '' : " Couldn't mark it posted in your Library."}`,
        });
      } else {
        const { slides: k, id } = await saveOnly(deps, dump, hd);
        setDump((d) => ({ ...d, id }));
        setDone({ title: 'Saved to your phone', tab: 'draft', note: `${k} slide${k === 1 ? '' : 's'} saved to the DayDump album.` });
      }
    } catch (e) {
      console.warn(`[preview] ${what} failed:`, e);
      toast(what === 'post' ? `Couldn't open ${app}. Try again.` : "Couldn't save the slides. Try again.");
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  // Edit: back to it when this Preview came from its Preview pill, else Edit replaces this Preview (no Edit/Preview pile-up)
  const nav = useNavigation();
  const toEdit = () => {
    const st = nav.getState();
    if (st && st.routes[st.index - 1]?.name === 'edit/[id]') return router.back();
    router.replace({ pathname: '/edit/[id]', params: { id: dump.storyId ?? dump.id } });
  };
  // Save as draft: a Discover story not yet in Library becomes its draft (the same one Edit opens)
  const toDraft = async () => {
    if (!story || running.current) return;
    running.current = true;
    try {
      const d = await draftForStory(story);
      markSeen([story.id]);
      setDump(d);
      toast('Saved to Drafts');
    } catch (e) {
      console.warn('[preview] save as draft failed:', e);
      toast("Couldn't save the draft. Try again.");
    } finally {
      running.current = false;
    }
  };

  const cardW = win.width - 32;
  // TikTok frame: 9:16, short enough that header + frame + Post button fit on one screen
  const tkH = Math.min(((cardW - 2) * 16) / 9, win.height - insets.top - insets.bottom - 210);

  return (
    <View style={{ flex: 1 }}>
      <Screen contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={{ paddingTop: 2, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton label="Back" onPress={back}><Icons.back size={16} /></IconButton>
          <View style={{ alignItems: 'center' }}>
            <Text style={[display(19, 1.15), { color: t.ink }]}>{dump.status === 'posted' ? 'Posted Preview' : 'Preview'}</Text>
            <Text style={[ui(10), { color: t.inkMuted }]}>{ratio.key} · {layout.label} layout</Text>
          </View>
          {dump.status === 'posted' ? <View style={{ width: 36 }} /> : <IconButton label="Edit" onPress={toEdit}><Icons.edit size={16} /></IconButton>}
        </View>

        <FrameCard radius={20} padding={4} style={{ flexDirection: 'row', marginBottom: 10 }}>
          {TABS.map(([k, label]) => {
            const on = platform === k;
            return (
              <Tap key={k} onPress={() => setPlatform(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flex: 1, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.ink : undefined }}>
                <Text style={[ui(11.5, 600), { color: on ? t.bgScreen : t.ink }]}>{label}</Text>
              </Tap>
            );
          })}
        </FrameCard>

        {platform === 'ig' ? <IgPost v={v} w={cardW - 2} onHandle={onHandle} />
          : platform === 'grid' ? <IgGrid v={v} w={cardW} others={others} />
          : <TikTok v={v} w={Math.min(cardW, (tkH * 9) / 16)} h={tkH} />}
      </Screen>

      <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 6, alignItems: 'center' }}>
        <Tap onPress={post} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Post on Instagram or TikTok"
          style={{ alignSelf: 'stretch', height: 40, borderRadius: 20, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', opacity: busy ? 0.85 : 1 }}>
          {busy ? <Icons.check size={16} color={t.bgScreen} /> : <Icons.send size={16} color={t.bgScreen} />}
          <Text style={[ui(12.5, 600), { color: t.bgScreen }]}>{busy ?? 'Post on IG / TikTok'}</Text>
        </Tap>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingTop: 8, paddingBottom: 2 }}>
          <Tap onPress={() => run('save')} disabled={!!busy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Save only, to the DayDump album">
            <Text style={[ui(11.5, 500), { color: t.inkMuted, textDecorationLine: 'underline' }]}>Save only</Text>
          </Tap>
          {isDumpId(dump.id) ? null : (
            <Tap onPress={toDraft} disabled={!!busy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Save as draft">
              <Text style={[ui(11.5, 500), { color: t.inkMuted, textDecorationLine: 'underline' }]}>Save as draft</Text>
            </Tap>
          )}
          <Tap onPress={() => setHd((x) => !x)} disabled={!!busy} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: hd }} accessibilityLabel="HD export for this dump">
            <Text style={[ui(11.5, 500), { color: t.inkMuted }]}>Quality: <Text style={{ color: t.ink, fontWeight: '600' }}>{hd ? 'HD' : 'Standard'}</Text></Text>
          </Tap>
        </View>
      </View>
      <PostSheet visible={picking} targets={targets} slides={n} onPick={(k) => run('post', k)} onClose={() => setPicking(false)} />
      <DoneSheet done={done} onClose={() => setDone(null)} />
    </View>
  );
}
