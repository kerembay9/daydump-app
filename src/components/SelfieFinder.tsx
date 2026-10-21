import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { FaceCircle } from './FaceCircle';
import { FrameCard } from './ui/FrameCard';
import { Pill } from './ui/Pill';
import { Bar, Developing, packCopy } from './ModelLoading';
import { useTheme } from '../theme/ThemeProvider';
import { display, label, ui } from '../theme/type';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { modelsNow, useModels } from '../state/models';
import { rankSelfies, scanSelfies, Selfie } from '../services/selfie';
import { PhotoAsset } from '../types';
import { getProfile, setProfile } from '../services/profile';
import { faceVec, isAnyOf } from '../services/faces';
import { GalleryService, isCameraPhoto } from '../services/galleryService';

/** Photos scanned per call: ~1 s on an A54. */
const CHUNK = 60;
/** The first pick waits for the odd-sized photos (the front camera's, see below), at most this many. */
const FIRST_BY = 240;
/** Scanning stops once this many solo selfies are found: plenty to tell the owner apart and to say "Not me" to. */
const ENOUGH = 40;

/** The best one not passed and not a turned-down face. */
const pickFrom = (pool: Selfie[], skipped: Set<string>, notMe: Float32Array[]) =>
  rankSelfies(pool).find((x) => !skipped.has(x.p.id) && !isAnyOf(x.box, notMe)) ?? null;

/**
 * The best selfie on the phone (scanSelfies + rankSelfies), a verdict, and the user's name. Logs everything to the console.
 * Waits for the vision model (release builds download it after the install), then scans the camera photos (front-camera
 * sized first, each newest first) on their own, not waiting for the photo index; it keeps going in the background, so "Not me" / "Try another" shows the
 * next one at once. The face model only sharpens the pick (who's in most selfies): used once it's there.
 */
export function SelfieFinder() {
  const { t } = useTheme();
  const models = useModels();
  /** cur: on screen (null = none right now); passed: one was passed already; scanned: photos scanned; firstBy: scanned before the first pick; done: all scanned, or ENOUGH found */
  const [st, setSt] = useState<{ pool: Selfie[]; cur: Selfie | null; passed: boolean; scanned: number; firstBy: number; done: boolean }>({ pool: [], cur: null, passed: false, scanned: 0, firstBy: FIRST_BY, done: false });
  const [verdict, setVerdict] = useState<'up' | 'down' | null>(null);
  const [name, setName] = useState('');
  const skipped = useRef(new Set<string>()); // photos shown and passed
  const notMe = useRef<Float32Array[]>([]); // faces turned down

  const need = models && models.vision.state !== 'ready' ? 'vision' : undefined;
  const go = !!models && !need;
  const best = st.cur;

  useEffect(() => {
    if (!go) return;
    let stop = false;
    (async () => {
      const all = await GalleryService.listLibraryPhotos();
      const cam = all.filter((p) => isCameraPhoto(p.uri));
      const lib = cam.length ? cam : all;
      // Selfies come from the front camera, whose size differs from the main camera's (most photos): scan the odd sizes first.
      // ponytail: size heuristic; a phone whose cameras match falls back to newest first. EXIF lens info if that matters.
      const size = (p: PhotoAsset) => `${Math.max(p.width, p.height)}x${Math.min(p.width, p.height)}`;
      const n: Record<string, number> = {};
      lib.forEach((p) => { n[size(p)] = (n[size(p)] ?? 0) + 1; });
      const main = Object.keys(n).reduce((a, b) => (n[a] >= n[b] ? a : b), '');
      const photos = [...lib.filter((p) => size(p) !== main), ...lib.filter((p) => size(p) === main)];
      const odd = photos.length - (n[main] ?? 0), firstBy = Math.min(FIRST_BY, odd || FIRST_BY);
      setSt((s) => ({ ...s, firstBy }));
      console.log(`[selfie] ${odd} odd-sized first (main ${main})`);
      ClipEmbedder?.warmSelfie?.().catch(() => {}); // already warm from onboarding; the /selfie screen comes here cold
      const seen: Float32Array[] = [];
      let found = 0, shown = false;
      for (let i = 0; i < photos.length && found < ENOUGH && !stop; i += CHUNK) {
        const t0 = Date.now();
        if (!shown) ClipEmbedder?.holdIndexing?.(10000); // someone's waiting: the CPU to the scan
        const c = await scanSelfies(photos.slice(i, i + CHUNK), modelsNow()?.faces.state === 'ready', seen);
        found += c.length;
        console.log(`[selfie] scanned ${Math.min(i + CHUNK, photos.length)}/${photos.length}: ${c.length} solo in ${Date.now() - t0} ms`);
        c.forEach((x) => console.log(`[selfie] face ${x.face.toFixed(3)} ${x.p.width}x${x.p.height} ${x.box.vec ? 'vec' : 'novec'} [${x.tags.join(', ')}] ${x.p.uri}`));
        if (stop) break;
        const scanned = i + CHUNK, done = scanned >= photos.length || found >= ENOUGH;
        setSt((s) => {
          const pool = [...s.pool, ...c];
          const ready = s.cur || s.passed || scanned >= firstBy || done;
          return { ...s, pool, cur: s.cur ?? (ready ? pickFrom(pool, skipped.current, notMe.current) : null), scanned, done };
        });
        if (!shown && scanned >= firstBy) { shown = true; ClipEmbedder?.holdIndexing?.(0); }
      }
    })().catch((e) => console.warn('[selfie] failed:', e))
      .finally(() => { if (!stop) setSt((s) => ({ ...s, done: true, cur: s.cur ?? pickFrom(s.pool, skipped.current, notMe.current) })); });
    return () => { stop = true; };
  }, [go]);

  useEffect(() => { getProfile().then((p) => setName(p.name)); }, []);
  // the next best one; none: "Looking further back" until the scan finds one
  const next = () => {
    setVerdict(null);
    setSt((s) => { if (s.cur) skipped.current.add(s.cur.p.id); return { ...s, cur: pickFrom(s.pool, skipped.current, notMe.current), passed: true }; });
  };
  const vote = (v: 'up' | 'down') => {
    setVerdict(v);
    console.log(`[selfie] verdict ${v === 'up' ? "that's me" : 'not me'} face ${best?.face.toFixed(3)} ${best?.p.uri}`);
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
    : st.done ? null
    : !st.passed ? ['Picking your best selfie', 'Looking through your recent photos. Nothing leaves your phone.', Math.min(1, st.scanned / st.firstBy)]
    : ['Looking further back', 'Checking older photos.', null];


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
