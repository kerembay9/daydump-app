import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { FaceCircle } from './FaceCircle';
import { FrameCard } from './ui/FrameCard';
import { Pill } from './ui/Pill';
import { Bar, Developing, packCopy } from './ModelLoading';
import { useTheme } from '../theme/ThemeProvider';
import { display, label, ui } from '../theme/type';
import { useApp } from '../state/AppState';
import { loadLibrary } from '../services/index/photoIndex';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { useModels } from '../state/models';
import { findSelfies, SELFIE_QUERY, SelfieCandidate } from '../services/selfie';
import { getProfile, setProfile } from '../services/profile';
import { faceVec, isAnyOf } from '../services/faces';

/** Photos read (newest first) before looking: enough for the recent selfies, ~15 s of indexing on an A54. */
const SELFIE_MIN = 200;
/** The first pick waits for a second one behind it (so "Not me" shows another at once) until this many photos are read. */
const BACKUP_BY = 600;

/**
 * The best selfie found on-device (see findSelfies), a verdict, and the user's name. Logs everything to the console.
 * Waits for the vision model (release builds download it after the install) and the first SELFIE_MIN photos, showing
 * what it waits for. The next candidates are found in the background while one is up, so "Not me" / "Try another" shows another at once. The face model only sharpens the pick (who's in most selfies): used if it's there.
 */
export function SelfieFinder() {
  const { t } = useTheme();
  const { library, progress } = useApp();
  const models = useModels();
  /** best: on screen once shown (null = none left); queue: found, not shown yet. null = the first look is running */
  const [pick, setPick] = useState<{ best: SelfieCandidate | null; queue: SelfieCandidate[]; shown: boolean } | null>(null);
  const [verdict, setVerdict] = useState<'up' | 'down' | null>(null);
  const [name, setName] = useState('');
  const busy = useRef(false);
  const lookedAt = useRef(-Infinity); // photos read at the last look
  const looked = useRef(new Set<string>()); // photos looked at: the next look moves past them
  const notMe = useRef<Float32Array[]>([]); // faces turned down

  const need = models && models.vision.state !== 'ready' ? 'vision' : undefined;
  const read = library?.photos.length ?? 0;
  // progress.done counts this run's photos as they land; library only catches up at each rebuild (every 15 s)
  const done = Math.max(read, progress?.done ?? 0);
  const enough = done >= SELFIE_MIN || (read > 0 && !progress);
  const go = !!models && !need && enough;
  // before the first one shows: held until there's a backup, or reading is done / far enough along
  const held = !!pick && !pick.shown && pick.queue.length < 2 && !!progress && done < BACKUP_BY;
  const best = !pick || held ? undefined : pick.shown ? pick.best : pick.queue[0] ?? null;

  // CLIP's next 30 selfie-like photos not looked at yet, in the library read so far, onto the queue.
  const look = useCallback((waiting: boolean) => {
    busy.current = true; lookedAt.current = done;
    const t0 = Date.now();
    if (waiting) ClipEmbedder?.holdIndexing?.(15000); // someone's watching: the CPU to the face scan
    loadLibrary().then(async (lib) => {
      const c = await findSelfies(lib, models?.faces.state === 'ready', { ids: looked.current, faces: notMe.current });
      console.log(`[selfie] "${SELFIE_QUERY}" ${c.length} candidates in ${Date.now() - t0} ms (${lib.photos.length} photos read)`);
      c.forEach((x, k) => console.log(`[selfie] #${k + 1} person ${x.person} (in ${x.seen}) face ${x.face.toFixed(3)} score ${x.score.toFixed(3)} clip ${x.clip.toFixed(3)} sharp ${x.sharp.toFixed(3)} [${x.p.concepts.slice(0, 5).map((id) => lib.conceptNames[id]).join(', ')}] ${x.p.uri}`));
      setPick((p) => {
        const q = [...(p?.queue ?? []), ...c].filter((x) => !isAnyOf(x.box, notMe.current));
        return !p?.shown ? { best: null, queue: q, shown: false } : p.best ? { ...p, queue: q } : { best: q[0] ?? null, queue: q.slice(1), shown: true };
      });
    }, (e) => { console.warn('[selfie] failed:', e); setPick((p) => p ?? { best: null, queue: [], shown: false }); })
      .finally(() => { busy.current = false; if (waiting) ClipEmbedder?.holdIndexing?.(0); });
  }, [models, done]);

  useEffect(() => { getProfile().then((p) => setName(p.name)); }, []);
  // The first look, then topping up so the next photo is ready before "Not me". A look that comes back short waits for
  // 150 more photos read (indexing goes on further back) before trying again.
  useEffect(() => {
    if (go && !busy.current && (pick?.queue.length ?? 0) < 2 && done >= lookedAt.current + 150) look(!best);
  }, [go, pick, done, look, best]);

  // the next one in the queue that isn't a turned-down face; none: "Looking further back" until a look finds one
  const next = () => {
    setVerdict(null);
    setPick((p) => {
      const q = (p?.shown ? p.queue : p?.queue.slice(1) ?? []).filter((x) => !isAnyOf(x.box, notMe.current));
      return { best: q[0] ?? null, queue: q.slice(1), shown: true };
    });
  };
  const vote = (v: 'up' | 'down') => {
    setVerdict(v);
    console.log(`[selfie] verdict ${v === 'up' ? "that's me" : 'not me'} person ${best?.person} ${best?.p.uri}`);
    if (v === 'down' && best) {
      const vec = best.box && faceVec(best.box);
      if (vec) notMe.current.push(vec);
      next();
    }
  };
  const editName = (n: string) => {
    setName(n);
    setProfile({ name: n.trim() }).catch((e) => console.warn('[selfie] name save failed:', e));
  };

  // what it waits for: [title, body, progress or null]
  const wait: [string, string, number | null] | null = best ? null
    : !models ? ['Getting ready', 'One moment.', null]
    : need ? packCopy(need, models[need])
    : !enough ? ['Reading your recent photos', 'Your best selfie shows up in a few seconds. Nothing leaves your phone.',
      progress?.total ? Math.min(1, done / Math.min(SELFIE_MIN, progress.total)) : null]
    : best === undefined ? ['Picking your best selfie', 'Almost there.', held ? Math.min(1, done / BACKUP_BY) : null]
    : progress ? ['Looking further back', 'Checking older photos as DayDump reads them.', null]
    : null;

  return (
    <>
      <FrameCard radius={20} padding={12}>
        {wait ? (
          <View style={{ minHeight: 300, justifyContent: 'center', gap: 8, paddingHorizontal: 8 }}>
            <Developing />
            <Text style={[display(19, 1.15), { color: t.ink, textAlign: 'center' }]}>{wait[0]}</Text>
            <Text style={[ui(12.5), { color: t.inkMuted, textAlign: 'center', lineHeight: 18 }]}>{wait[1]}</Text>
            <Bar progress={wait[2]} />
          </View>
        ) : !best ? (
          <Text style={[ui(12.5), { color: t.inkMuted, textAlign: 'center', paddingVertical: 24 }]}>No other selfie on your phone. Your dumps work without one.</Text>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <FaceCircle uri={best.p.uri} box={best.box} aspect={best.aspect} size={180} />
            <Text style={[display(19, 1.2), { color: t.ink, marginTop: 14, textAlign: 'center' }]}>We think this is you. Did we get it right?</Text>
            <Text style={[ui(12.5, 500), { color: t.inkMuted, marginTop: 4, textAlign: 'center' }]}>Found on your phone. It never left your device!</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pill label="That's me!" on={verdict === 'up'} onPress={() => vote('up')} height={36} size={13} style={{ paddingHorizontal: 18 }} />
              <Pill label="Not me :(" onPress={() => vote('down')} height={36} size={13} style={{ paddingHorizontal: 18 }} />
            </View>
            <Pill label="Try another" onPress={next} variant="plain" height={30} size={11.5} style={{ marginTop: 6 }} />
          </View>
        )}
      </FrameCard>
      <Text style={[label(10, 0.12), { color: t.inkMuted, marginTop: 14, marginBottom: 4, paddingHorizontal: 4 }]}>What&apos;s your name?</Text>
      <FrameCard radius={18} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
        <TextInput value={name} onChangeText={editName} placeholder="Your name" placeholderTextColor={t.inkMuted}
          returnKeyType="done" style={[display(18), { color: t.ink, paddingVertical: 8 }]} />
      </FrameCard>
    </>
  );
}
