import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipEmbedder, EdgeBench } from '../../modules/clip-embedder';
import { EVAL_ALBUM } from '../services/galleryService';
import { ModelBench } from './ModelBench';
import { clearEmbeddings, conceptsForVector, indexLibrary, IndexedPhoto, Library, loadLibrary, resetIndex } from '../services/index/photoIndex';
import { b64ToFloats, DIM } from '../services/index/vectors';
import { buildStories, searchRanked, Story } from '../services/stories';
import { DEFAULT_TOPIC_OPTIONS, TopicOptions } from '../services/stories/topics';
import { profileNow } from '../services/profile';

const golden = require('../services/index/clipGolden.json') as {
  phrases: string[]; ids: number[][]; text: number[][]; image: { file: string; vec: number[] };
};

/** What the photos show: a topic's own words, else the most common top-3 concepts across a trip's photos. */
const storyWords = (s: Story, names: string[]) => {
  if (s.concepts.length) return s.concepts.slice(0, 6);
  const n = new Map<number, number>();
  s.photos.forEach((p) => p.concepts.slice(0, 3).forEach((c) => n.set(c, (n.get(c) ?? 0) + 1)));
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => names[c]);
};

const titlePrompt = (s: Story, words: string[]) =>
  [
    "Write a title for a photo story from someone's camera roll: 2 to 6 words, warm and specific, no seasons or dates, no emoji, no quotes.",
    `Photos show: ${words.join(', ')}`,
    s.place && `Place: ${s.place}`,
    'Reply with the title only.',
  ].filter(Boolean).join('\n');

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Debug: called after the index is wiped, to rerun the home screen's first-index flow. */
  onResetIndex: () => void;
}

/** Eval/debug view of the on-device index: every story with its words and scores, plus raw search. */
export const DebugStoriesModal: React.FC<Props> = ({ visible, onClose, onResetIndex }) => {
  // Android Modals draw edge to edge, and SafeAreaView inside one measures zero insets: use the root's.
  const insets = useSafeAreaInsets();
  const [lib, setLib] = useState<Library | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [opts, setOpts] = useState<TopicOptions>(DEFAULT_TOPIC_OPTIONS);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [minScore, setMinScore] = useState(0.2);
  const [hits, setHits] = useState<{ p: IndexedPhoto; s: number }[]>([]);
  const [gemma, setGemma] = useState<Record<string, { text: string; ms: number }>>({});
  const gemmaBusy = useRef(false); // a second tap would load a second 2.6 GB engine: the app gets OOM-killed

  const rebuild = (o: TopicOptions) =>
    loadLibrary().then(async (l) => {
      setLib(l);
      setStories((await buildStories(l, o, undefined, profileNow().hideSensitive)).stories);
    });

  useEffect(() => {
    if (visible) rebuild(opts);
  }, [visible, opts]);

  const reindex = async (all = false) => {
    if (all) await clearEmbeddings();
    const t0 = Date.now();
    const n = await indexLibrary((d, t) => setStatus(`indexing ${d}/${t}`));
    setStatus(`${n} photos indexed or retagged in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    rebuild(opts);
  };

  const search = async () => setHits(lib && query.trim() ? (await searchRanked(lib, query)).slice(0, 30) : []);

  const showConcepts = async (p: IndexedPhoto) => {
    if (!lib) return;
    const i = lib.photos.findIndex((x) => x.id === p.id);
    const c = await conceptsForVector(lib.vecs.slice(i * DIM, (i + 1) * DIM), 12);
    const where = p.location ? `\n${p.location.latitude.toFixed(3)}, ${p.location.longitude.toFixed(3)}` : '\nno GPS';
    Alert.alert(new Date(p.creationTime).toLocaleString() + where, c.map((x) => `${x.score.toFixed(3)}  ${x.name}`).join('\n') || 'no embedding');
  };

  const selfCheck = async () => {
    if (!ClipEmbedder) return setStatus('self-check: no native ClipEmbedder (iOS / Expo Go)');
    const lines: string[] = [];
    let idsOk = 0;
    for (let i = 0; i < golden.phrases.length; i++) {
      const ids = await ClipEmbedder.tokenize(golden.phrases[i]);
      if (ids.join() === golden.ids[i].join()) idsOk++;
      else lines.push(`tokens differ: "${golden.phrases[i]}"`);
    }
    const t = b64ToFloats(await ClipEmbedder.embedTexts(golden.phrases));
    const cos = golden.text.map((g, i) => g.reduce((a, v, j) => a + v * t[i * DIM + j], 0));
    lines.unshift(`tokenizer ${idsOk}/${golden.phrases.length}`, `text cos ${cos.map((c) => c.toFixed(3)).join(' ')}`);
    const img = lib?.photos.find((p) => p.uri.endsWith(golden.image.file));
    if (img && lib) {
      const i = lib.photos.indexOf(img);
      lines.push(`image cos ${golden.image.vec.reduce((a, v, j) => a + v * lib.vecs[i * DIM + j], 0).toFixed(3)}`);
    } else lines.push(`image: put ${golden.image.file} in the library to check`);
    setStatus(lines.join('\n'));
  };

  // Text only (no photos sent), Gemma 4 E2B on the GPU. Downloaded from the model bench above.
  const gemmaTitles = async () => {
    if (!EdgeBench || !lib) return setStatus('Gemma titles: needs the Android dev build');
    if (gemmaBusy.current) return;
    if (!(await EdgeBench.gemmaFile()).bytes) return setStatus('Gemma titles: download Gemma 4 E2B in the model bench first');
    gemmaBusy.current = true;
    try {
      await runGemmaTitles(EdgeBench, lib);
    } catch (e) {
      setStatus(`Gemma titles failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      gemmaBusy.current = false;
    }
  };

  const runGemmaTitles = async (bench: NonNullable<typeof EdgeBench>, l: Library) => {
    setStatus('Gemma titles: loading model…');
    const loadMs = await bench.loadGemma(true, true);
    const t0 = Date.now();
    const out: typeof gemma = {};
    for (const [i, s] of stories.entries()) {
      setStatus(`Gemma titles ${i + 1}/${stories.length}`);
      const r = await bench.gemmaDescribe([], titlePrompt(s, storyWords(s, l.conceptNames)), 0, 16, null);
      out[s.id] = { text: r.text.replace(/^["“']|["”']$/g, ''), ms: r.ms };
      setGemma({ ...out });
    }
    const ms = Object.values(out).map((x) => x.ms).sort((a, b) => a - b);
    setStatus(`Gemma titles: ${ms.length} in ${((Date.now() - t0) / 1000).toFixed(1)} s, median ${((ms[ms.length >> 1] ?? 0) / 1000).toFixed(1)} s (load ${(loadMs / 1000).toFixed(1)} s)`);
  };

  const step = (k: keyof TopicOptions, d: number) => setOpts((o) => ({ ...o, [k]: Math.max(0, +(o[k] + d).toFixed(2)) }));
  const geo = lib?.photos.filter((p) => p.location).length ?? 0;
  const embedded = lib ? lib.photos.filter((p) => p.concepts.length).length : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingTop: 16 + insets.top, paddingBottom: 60 + insets.bottom }}>
        <View style={styles.rowBetween}>
          <Text style={styles.h1}>Stories debug</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.link}>Close</Text></TouchableOpacity>
        </View>
        <Text style={styles.meta}>
          Source: {EVAL_ALBUM ? `eval album "${EVAL_ALBUM}"` : 'full library'} · CLIP {lib?.hasClip ? 'on' : 'off'}{'\n'}
          {lib?.photos.length ?? 0} photos · {embedded} embedded · {geo} geotagged
        </Text>
        <View style={styles.row}>
          <Btn label="Reindex" onPress={() => reindex()} />
          <Btn label="Re-embed all" onPress={() => reindex(true)} />
          <Btn label="Reset index" onPress={() => resetIndex().then(() => { onClose(); onResetIndex(); })} />
          <Btn label="Self-check" onPress={selfCheck} />
        </View>
        {!!status && <Text style={styles.mono}>{status}</Text>}

        <Text style={styles.h2}>Model benchmark (TinyCLIP · ML Kit · Gemma 4 E2B)</Text>
        <ModelBench lib={lib} />

        <Text style={styles.h2}>Topic knobs</Text>
        {(['minPhotos', 'minDays', 'maxShare', 'topK', 'windowDays'] as const).map((k) => {
          const d = k === 'maxShare' ? 0.05 : k === 'windowDays' ? 30 : 1;
          return (
            <View key={k} style={styles.rowBetween}>
              <Text style={styles.meta}>{k}: {opts[k]}</Text>
              <View style={styles.row}><Btn label="−" onPress={() => step(k, -d)} /><Btn label="+" onPress={() => step(k, d)} /></View>
            </View>
          );
        })}

        <Text style={styles.h2}>Search</Text>
        <View style={styles.row}>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder="cinnamon bun, wearing red…" placeholderTextColor="#666" />
          <Btn label="Go" onPress={search} />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.meta}>story cutoff ≥ {minScore.toFixed(2)} (dimmed = below)</Text>
          <View style={styles.row}><Btn label="−" onPress={() => setMinScore((m) => m - 0.02)} /><Btn label="+" onPress={() => setMinScore((m) => m + 0.02)} /></View>
        </View>
        <View style={styles.grid}>
          {hits.map(({ p, s }) => (
            <Thumb key={p.id} p={p} label={s.toFixed(3)} dim={s < minScore || s < (hits[0]?.s ?? 0) - 0.03} onPress={() => showConcepts(p)} />
          ))}
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.h2}>Stories ({stories.length})</Text>
          <Btn label="Gemma titles" onPress={gemmaTitles} />
        </View>
        {stories.map((s) => (
          <View key={s.id} style={styles.story}>
            <Text style={styles.storyTitle}>{s.title} <Text style={styles.meta}>[{s.kind}] score {s.score.toFixed(2)} · {s.group} · worth {s.worth.toFixed(2)}</Text></Text>
            {gemma[s.id] && <Text style={styles.gemma}>Gemma: {gemma[s.id].text} <Text style={styles.meta}>{(gemma[s.id].ms / 1000).toFixed(1)} s</Text></Text>}
            <Text style={styles.meta}>{s.subtitle}</Text>
            {!!s.concepts.length && <Text style={styles.meta}>words: {s.concepts.join(', ')}</Text>}
            <Text style={styles.mono}>{JSON.stringify(s.debug)}</Text>
            <ScrollView horizontal>
              {s.picks.map((p) => <Thumb key={p.id} p={p} onPress={() => showConcepts(p)} />)}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </Modal>
  );
};

const Btn = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.btn} onPress={onPress}><Text style={styles.btnText}>{label}</Text></TouchableOpacity>
);

const Thumb = ({ p, label, dim, onPress }: { p: IndexedPhoto; label?: string; dim?: boolean; onPress: () => void }) => (
  <TouchableOpacity onPress={onPress} style={[styles.thumb, dim && { opacity: 0.3 }]}>
    <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
    {label && <Text style={styles.thumbLabel}>{label}</Text>}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0C' },
  h1: { color: '#fff', fontSize: 20, fontWeight: '800' },
  h2: { color: '#FF9500', fontSize: 12, fontWeight: '800', marginTop: 20, marginBottom: 6, letterSpacing: 1 },
  meta: { color: '#8E8E93', fontSize: 12, lineHeight: 17 },
  mono: { color: '#C7C7CC', fontSize: 11, fontFamily: 'monospace', marginTop: 4 },
  link: { color: '#FF9500', fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginVertical: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 2 },
  btn: { backgroundColor: '#2C2C2E', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
  input: { flex: 1, backgroundColor: '#1C1C1E', color: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  story: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 10, marginBottom: 10 },
  gemma: { color: '#FF9500', fontSize: 14, fontWeight: '700', marginTop: 2 },
  storyTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  thumb: { width: 72, height: 72, borderRadius: 6, overflow: 'hidden', backgroundColor: '#2C2C2E', marginRight: 4, marginTop: 6 },
  thumbLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, textAlign: 'center' },
});
