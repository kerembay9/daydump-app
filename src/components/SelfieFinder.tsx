import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { FaceCircle } from './FaceCircle';
import { FrameCard } from './ui/FrameCard';
import { Pill } from './ui/Pill';
import { Bar, Developing } from './ModelLoading';
import { useTheme } from '../theme/ThemeProvider';
import { caps, display, label, ui } from '../theme/type';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { modelsNow, useModels } from '../state/models';
import { checkSelfies, rankSelfies, Selfie, soloPhotos } from '../services/selfie';
import { PhotoAsset } from '../types';
import { getProfile, setProfile } from '../services/profile';
import { faceVec, isAnyOf } from '../services/faces';
import { GalleryService, isCameraPhoto } from '../services/galleryService';

/** Photos scanned per call: ~0.4 s on an A54. Small, so the check before the first pick is short. */
const CHUNK = 30;
/** The first pick waits for the odd-sized photos (the front camera's, see below), at most this many. */
const FIRST_BY = 240;
/** Scanning stops once this many solo selfies are found: plenty to tell the owner apart and to say "Not me" to. */
const ENOUGH = 40;

/** The best one not passed and not a turned-down face. */
const pickFrom = (pool: Selfie[], skipped: Set<string>, notMe: Float32Array[]) =>
  rankSelfies(pool).find((x) => !skipped.has(x.p.id) && !isAnyOf(x.box, notMe)) ?? null;

/**
 * The best selfie on the phone (soloPhotos, checkSelfies, rankSelfies) and a verdict on it. Logs everything to the console.
 * Needs no download (before visionpack lands, checkSelfies' bundled gate stands in for CLIP). Scans the camera photos (front-camera
 * sized first, each newest first, while a big library is still listed) on their own, not waiting for the photo index; it keeps going in the background, so "Not me" / "Try another" shows the
 * next one at once. The face model only sharpens the pick (who's in most selfies): used once it's there.
 * on: scan (onboarding turns it on at the photo grant). best: on screen; wait: [title, body, progress] while there's none yet.
 */
export function useSelfiePick(on = true) {
  useModels('faces'); // fetched next: sharpens the pick once it's there
  /** cur: on screen (null = none right now); passed: one was passed already; scanned: photos scanned; firstBy: scanned before the first pick; done: all scanned, or ENOUGH found */
  const [st, setSt] = useState<{ pool: Selfie[]; cur: Selfie | null; passed: boolean; scanned: number; firstBy: number; done: boolean }>({ pool: [], cur: null, passed: false, scanned: 0, firstBy: FIRST_BY, done: false });
  const [verdict, setVerdict] = useState<'up' | 'down' | null>(null);
  const skipped = useRef(new Set<string>()); // photos shown and passed
  const notMe = useRef<Float32Array[]>([]); // faces turned down

  const go = on; // not waiting on the models' state: if it never arrives, the scan still runs (faces read when it has)
  const best = st.cur;

  useEffect(() => {
    if (!go) return;
    let stop = false;
    (async () => {
      ClipEmbedder?.warmSelfie?.().catch(() => {}); // already warm from onboarding; the /selfie screen comes here cold
      // Selfies come from the front camera, whose size differs from the main camera's (most camera photos): those odd sizes
      // first, each newest first, while a big library is still being listed (a page of 1000 at a time), then the rest.
      // ponytail: size heuristic; a phone whose cameras match falls back to newest first. EXIF lens info if that matters.
      const size = (p: PhotoAsset) => `${Math.max(p.width, p.height)}x${Math.min(p.width, p.height)}`;
      const left = new Map<string, PhotoAsset[]>(); // camera photos not taken yet, by size, newest first
      const n = new Map<string, number>(); // camera photos by size
      const rest: PhotoAsset[] = []; // the others: scanned only when there's no camera photo at all
      let listed = false, more = () => {};
      (async () => {
        for await (const page of GalleryService.photoPages()) {
          if (stop) break;
          for (const p of page) {
            if (!isCameraPhoto(p.uri)) { rest.push(p); continue; }
            const k = size(p);
            n.set(k, (n.get(k) ?? 0) + 1);
            (left.get(k) ?? left.set(k, []).get(k)!).push(p);
          }
          more();
        }
      })().catch((e) => console.warn('[selfie] listing failed:', e)).finally(() => { listed = true; more(); });
      const main = () => [...n.keys()].reduce((a, b) => (n.get(a)! >= n.get(b)! ? a : b), '');
      const oddLeft = () => [...left].filter(([k]) => k !== main()).reduce((a, [, ps]) => a + ps.length, 0);
      // the next photos to scan (odd: odd-sized): those while there are any (waiting for the listing), then the main camera's
      const take = async (): Promise<{ ps: PhotoAsset[]; odd: boolean }> => {
        for (;;) {
          const m = main();
          const ps = [...left].filter(([k]) => k !== m).flatMap(([, q]) => q).sort((a, b) => b.creationTime - a.creationTime).slice(0, CHUNK);
          if (ps.length) { const ids = new Set(ps.map((p) => p.id)); left.forEach((q, k) => left.set(k, q.filter((p) => !ids.has(p.id)))); return { ps, odd: true }; }
          if (!listed) { await new Promise<void>((r) => { more = r; }); continue; }
          return { ps: n.size ? left.get(m)?.splice(0, CHUNK) ?? [] : rest.splice(0, CHUNK), odd: false };
        }
      };
      const seen: Float32Array[] = [];
      let found = 0, scanned = 0, shown = false;
      ClipEmbedder?.holdIndexing?.(10000); // someone's waiting: the CPU to the scan
      let cur = await take();
      let solo = soloPhotos(cur.ps);
      while (cur.ps.length && found < ENOUGH && !stop) {
        const t0 = Date.now();
        if (!shown) ClipEmbedder?.holdIndexing?.(10000);
        const s = await solo;
        const check = checkSelfies(s, modelsNow()?.faces.state === 'ready', seen);
        // the next batch's thumbnails go while this one's solo photos are checked, unless the first pick would wait for that
        const next = await take();
        const early = shown || next.odd ? soloPhotos(next.ps) : null;
        const c = await check;
        found += c.length;
        scanned += cur.ps.length;
        console.log(`[selfie] scanned ${scanned} (${cur.ps.length}${cur.odd ? ' odd' : ''}, ${s.length} solo): ${c.length} kept in ${Date.now() - t0} ms`);
        c.forEach((x) => console.log(`[selfie] face ${x.face.toFixed(3)} fit ${x.fit.toFixed(3)} sharp ${x.sharp.toFixed(3)} ${x.p.width}x${x.p.height} ${x.box.vec ? 'vec' : 'novec'} [${x.tags.join(', ')}] ${x.p.uri}`));
        if (stop) break;
        const done = !next.ps.length || found >= ENOUGH;
        const ready = done || !next.odd || scanned >= FIRST_BY;
        const firstBy = Math.min(FIRST_BY, scanned + (next.odd ? next.ps.length : 0) + oddLeft()); // the bar's end, exact once listed
        setSt((st) => {
          const pool = [...st.pool, ...c];
          return { ...st, pool, cur: st.cur ?? (st.passed || ready ? pickFrom(pool, skipped.current, notMe.current) : null), scanned, firstBy, done };
        });
        if (!shown && ready) { shown = true; ClipEmbedder?.holdIndexing?.(0); console.log(`[selfie] first pick after ${scanned} (main ${main()})`); }
        cur = next; solo = early ?? soloPhotos(next.ps);
      }
    })().catch((e) => console.warn('[selfie] failed:', e))
      .finally(() => { if (!stop) setSt((s) => ({ ...s, done: true, cur: s.cur ?? pickFrom(s.pool, skipped.current, notMe.current) })); });
    return () => { stop = true; };
  }, [go]);

  // the next best one; none: "Looking further back" until the scan finds one
  const next = () => {
    setVerdict(null);
    setSt((s) => { if (s.cur) skipped.current.add(s.cur.p.id); return { ...s, cur: pickFrom(s.pool, skipped.current, notMe.current), passed: true }; });
  };
  const vote = (v: 'up' | 'down') => {
    setVerdict(v);
    console.log(`[selfie] verdict ${v === 'up' ? "that's me" : 'not me'} fit ${best?.fit.toFixed(3)} ${best?.p.uri}`);
    if (v === 'down' && best) {
      const vec = best.box && faceVec(best.box);
      if (vec) notMe.current.push(vec);
      next();
    }
  };

  /** s and the other selfies of the same person (all the others before facepack: no grouping), best first; grows as the scan goes. */
  const mine = (s: Selfie) => {
    const r = rankSelfies(st.pool).filter((x) => !isAnyOf(x.box, notMe.current));
    const who = r.find((x) => x.p.id === s.p.id)?.person ?? -1;
    return r.filter((x) => who < 0 || x.person === who);
  };

  // what it waits for: [title, body, progress or null]
  const wait: [string, string, number | null] | null = best ? null
    : st.done ? null
    : !st.passed ? ['Picking your best selfie', 'Looking through your recent photos. Nothing leaves your phone.', Math.min(1, st.scanned / st.firstBy)]
    : ['Looking further back', 'Checking older photos.', null];
  return { best, wait, verdict, vote, next, mine };
}

/** /selfie: the pick, a verdict, and the user's name. */
export function SelfieFinder() {
  const { t } = useTheme();
  const { best, wait, verdict, vote, next } = useSelfiePick();
  const [name, setName] = useState('');
  useEffect(() => { getProfile().then((p) => setName(p.name)); }, []);
  const editName = (n: string) => {
    setName(n);
    setProfile({ name: n.trim() }).catch((e) => console.warn('[selfie] name save failed:', e));
  };

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
      <>
        <Text style={[label(10, 0.12), { color: t.inkMuted, marginTop: 14, marginBottom: 4, paddingHorizontal: 4 }]}>{caps("What's your name?")}</Text>
        <FrameCard radius={18} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
          <TextInput value={name} onChangeText={editName} placeholder="Your name" placeholderTextColor={t.inkMuted}
            returnKeyType="done" style={[display(18), { color: t.ink, paddingVertical: 8 }]} />
        </FrameCard>
      </>
    </>
  );
}
