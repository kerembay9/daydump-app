import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import { StatusScrim } from '../components/ui/Screen';
import { FrameCard } from '../components/ui/FrameCard';
import { IconButton } from '../components/ui/TopHeader';
import { Icons } from '../components/ui/Icons';
import { Pill } from '../components/ui/Pill';
import { FaceCircle } from '../components/FaceCircle';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { useApp } from '../state/AppState';
import { ClipEmbedder, type Face, type FaceScan } from '../../modules/clip-embedder';
import { faceVec, groupFaces } from '../services/faces';

/**
 * uri -> faces found; names: face key (uri#index) -> name, so a name survives regrouping; groups: face key -> person,
 * saved because grouping takes seconds (cleared by a scan, redone once after it).
 */
type Saved = { scans: Record<string, FaceScan>; names: Record<string, string>; groups?: Record<string, number> };
type Shot = { key: string; uri: string; aspect: number; f: Face };
type Person = { shots: Shot[]; photos: number; name: string };

const file = () => new File(Paths.document, 'people-experiment.json');
const BATCH = 16;
const MIN_FACE = 0.05; // face height as a share of the photo: smaller ones are too few pixels for SFace

async function load(): Promise<Saved> {
  try { const f = file(); if (f.exists) return JSON.parse(await f.text()); } catch (e) { console.warn('[people] load failed:', e); }
  return { scans: {}, names: {} };
}
const save = (s: Saved) => { try { file().write(JSON.stringify(s)); } catch (e) { console.warn('[people] save failed:', e); } };

const shotsOf = (s: Saved): Shot[] => Object.entries(s.scans).flatMap(([uri, sc]) =>
  sc.faces.flatMap((f, i) => (f.vec && f.h >= MIN_FACE ? [{ key: `${uri}#${i}`, uri, aspect: sc.aspect, f }] : [])));

/** Face key -> person for every face. ponytail: 4 s for 1,784 faces in JS on the A54; native grouping if it grows. */
function groupAll(s: Saved): Record<string, number> {
  const t0 = Date.now();
  const shots = shotsOf(s);
  const group = groupFaces(shots.map((x) => faceVec(x.f)!));
  console.log(`[people] grouped ${shots.length} faces in ${Date.now() - t0} ms`);
  return Object.fromEntries(shots.map((x, i) => [x.key, group[i]]));
}

/** The saved groups as people, most photos first; a person's name is the one given to most of their faces. */
function people(s: Saved, groups: Record<string, number>): Person[] {
  const by = new Map<number, Shot[]>();
  shotsOf(s).forEach((x) => { const g = groups[x.key]; if (g !== undefined) by.set(g, [...(by.get(g) ?? []), x]); });
  return [...by.values()]
    .map((sh) => {
      const votes = new Map<string, number>();
      sh.forEach((x) => { const n = s.names[x.key]; if (n) votes.set(n, (votes.get(n) ?? 0) + 1); });
      const name = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      // biggest, surest face first: the person's picture
      return { shots: sh.sort((a, b) => b.f.w * b.f.h * b.f.score - a.f.w * a.f.h * a.f.score), photos: new Set(sh.map((x) => x.uri)).size, name };
    })
    .sort((a, b) => b.photos - a.photos);
}

/** Dev tools experiment: find every face on the phone (YuNet), group them into people (SFace) and name them. On-device. */
export default function People() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { library } = useApp();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => { load().then(setSaved); return () => { stop.current = true; }; }, []);
  // group after the "Grouping…" frame paints, then keep it
  useEffect(() => {
    if (!saved || saved.groups || progress || !Object.keys(saved.scans).length) return;
    const id = setTimeout(() => { const s = { ...saved, groups: groupAll(saved) }; setSaved(s); save(s); }, 50);
    return () => clearTimeout(id);
  }, [saved, progress]);
  const list = useMemo(() => (saved?.groups && !progress ? people(saved, saved.groups) : []), [saved, progress]);
  const shown = useMemo(() => list.filter((p) => p.photos >= 2), [list]);
  const todo = library && saved ? library.photos.filter((p) => !saved.scans[p.uri]) : [];

  const scan = async () => {
    if (!saved || !ClipEmbedder) return;
    stop.current = false;
    const s: Saved = { ...saved, scans: { ...saved.scans }, groups: undefined };
    const t0 = Date.now();
    for (let i = 0; i < todo.length && !stop.current; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const res = await ClipEmbedder.faces(batch.map((p) => p.uri), 0.6, true);
      batch.forEach((p, k) => (s.scans[p.uri] = res[k]));
      const left = ((Date.now() - t0) / (i + batch.length)) * (todo.length - i - batch.length);
      setProgress(`${i + batch.length} / ${todo.length} photos · ~${Math.ceil(left / 60000)} min left`);
      if ((i / BATCH) % 10 === 9) save(s);
    }
    save(s);
    console.log(`[people] scanned ${todo.length} photos in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    setSaved(s); setProgress(null);
  };

  const rename = (p: Person, name: string) => {
    if (!saved || name === p.name) return;
    const names = { ...saved.names };
    p.shots.forEach((x) => (name ? (names[x.key] = name) : delete names[x.key]));
    const s = { ...saved, names };
    setSaved(s); save(s);
  };

  const faces = list.reduce((n, p) => n + p.shots.length, 0);
  const header = (
    <>
      <View style={{ paddingTop: 2, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}><Icons.back size={16} /></IconButton>
        <Text style={[display(20), { color: t.ink }]}>People experiment</Text>
      </View>
      <FrameCard radius={18} padding={14}>
        <Text style={[ui(12.5, 500), { color: t.inkMuted }]}>
          {!saved || !library ? 'Loading…'
            : progress ? `Looking for faces: ${progress}`
              : !saved.groups && Object.keys(saved.scans).length ? 'Grouping faces into people…'
                : `${Object.keys(saved.scans).length} photos scanned · ${faces} faces · ${list.length} people (${shown.length} in 2+ photos). Found on your phone; it never leaves your device.`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
          {progress ? <><ActivityIndicator color={t.ink} /><Pill label="Stop" onPress={() => { stop.current = true; }} height={32} size={12} /></>
            : todo.length > 0 && <Pill label={`Scan ${todo.length} photos (~${Math.ceil((todo.length * 0.09) / 60)} min)`} onPress={scan} height={32} size={12} />}
        </View>
      </FrameCard>
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.shots[0].key}
        extraData={open}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={5}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 16 }}
        renderItem={({ item: p }) => {
          const key = p.shots[0].key;
          return (
            <FrameCard radius={18} padding={12} style={{ marginTop: 10 }} onPress={() => setOpen(open === key ? null : key)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <FaceCircle uri={p.shots[0].uri} box={p.shots[0].f} aspect={p.shots[0].aspect} size={56} />
                <View style={{ flex: 1 }}>
                  <TextInput defaultValue={p.name} onEndEditing={(e) => rename(p, e.nativeEvent.text.trim())} placeholder="Who is this?"
                    placeholderTextColor={t.inkMuted} returnKeyType="done" style={[display(17), { color: t.ink, paddingVertical: 4 }]} />
                  <Text style={[ui(11.5, 500), { color: t.inkMuted }]}>{p.photos} photos</Text>
                </View>
              </View>
              {open === key && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {p.shots.slice(0, 24).map((x) => <FaceCircle key={x.key} uri={x.uri} box={x.f} aspect={x.aspect} size={44} />)}
                </View>
              )}
            </FrameCard>
          );
        }}
      />
      <StatusScrim />
    </View>
  );
}
