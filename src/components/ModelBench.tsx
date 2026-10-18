import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { ClipEmbedder, EdgeBench, GemmaResult, MlkitResult } from '../../modules/clip-embedder';
import { IndexedPhoto, Library } from '../services/index/photoIndex';
import { b64ToFloats, DIM } from '../services/index/vectors';

const GEMMA_URL = 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm';
const PROMPT = 'Give 5 short tags and a one-line caption for this photo.\nFormat:\ntags: a, b, c, d, e\ncaption: ...';
const N = 10;
const GEMMA_SIDE = 512; // shortest side sent to Gemma's vision encoder
const MLKIT_SIDE = 480;
const GEMMA_MAX_TOKENS = 48;

const CAPTION = 'Write one short caption for this photo. Reply with the caption only.';
const STORY = 'These photos are one story from a camera roll. Reply with a short title and a one-line caption.\nFormat:\ntitle: ...\ncaption: ...';
type Variant = { name: string; prompt: string; side: number; max: number; thinking?: boolean; story?: boolean; text?: boolean };
/** Same photos through each config; "story" sends 6 photos in one call. */
const VARIANTS: Variant[] = [
  { name: 'base 512 tags+cap', prompt: PROMPT, side: 512, max: GEMMA_MAX_TOKENS },
  // 256 px and thinking=false measured no faster than 384 on GPU (encoder resizes; thinking is off by default).
  { name: 'caption 384', prompt: CAPTION, side: 384, max: 24 },
  { name: 'text only (no image)', prompt: 'Write one short caption for a photo of a beach at sunset. Reply with the caption only.', side: 0, max: 24, text: true },
  { name: 'story 6 photos 384', prompt: STORY, side: 384, max: 32, story: true },
];
const OPT_N = 5;
const MODES = [
  { gpu: true, visionGpu: true },
  { gpu: false, visionGpu: true },
  { gpu: true, visionGpu: false },
  { gpu: false, visionGpu: false },
];
const modeName = (m: { gpu: boolean; visionGpu: boolean }) => `LLM ${m.gpu ? 'GPU' : 'CPU'} · vision ${m.visionGpu ? 'GPU' : 'CPU'}`;
type OptRow = { backend: string; v: Variant; runs: GemmaResult[]; photos: number };

/** Indexer path (batches of 16: asset info for GPS, embed, top concepts) with full decode vs MediaStore thumbnails. */
const IDX_N = 64;
const IDX_BATCH = 16;
const IDX_MODES = [{ name: 'full decode', thumb: 0 }, { name: 'thumb 448', thumb: 448 }, { name: 'thumb 256', thumb: 256 }];
const contentUri = (id: string) => `content://media/external/images/media/${id}`;

type Row = { p: IndexedPhoto; clip?: { ms: number; words: string[] }; mlkit?: MlkitResult; gemma?: GemmaResult; err?: string };

const sample = (lib: Library) => [...lib.photos].sort(() => Math.random() - 0.5).slice(0, N);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
const timed = async <T,>(f: () => Promise<T>): Promise<[T, number]> => {
  const t0 = Date.now();
  const r = await f();
  return [r, Date.now() - t0];
};
const med = (rs: GemmaResult[], f: (r: GemmaResult) => number) => median(rs.map(f));
const mb = (b: number) => `${(b / 1e6).toFixed(0)} MB`;

/** Same N random photos through CLIP, ML Kit labeling and Gemma 4 E2B; per-photo wall time including decode. */
export const ModelBench: React.FC<{ lib: Library | null }> = ({ lib }) => {
  const [file, setFile] = useState({ bytes: 0, partial: 0 });
  const [dl, setDl] = useState('');
  const [mode, setMode] = useState(0); // index into MODES
  const { gpu, visionGpu } = MODES[mode];
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const [opt, setOpt] = useState<OptRow[]>([]);
  const [idx, setIdx] = useState<string[]>([]);

  const refresh = () => EdgeBench?.gemmaFile().then(setFile);
  useEffect(() => {
    refresh();
    const sub = EdgeBench?.addListener('onDownload', (e) => setDl(`${mb(e.bytes)} / ${mb(e.total)} (${((100 * e.bytes) / e.total).toFixed(0)}%)`));
    return () => sub?.remove();
  }, []);

  if (!EdgeBench || !ClipEmbedder) return <Text style={s.meta}>Benchmark needs the Android dev build.</Text>;
  const bench = EdgeBench;
  const clip = ClipEmbedder;

  const guard = (label: string, f: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(label);
    try {
      await f();
    } catch (e) {
      setDl(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy('');
      refresh();
    }
  };

  const download = guard('download', async () => {
    await bench.downloadGemma(GEMMA_URL);
    setDl('downloaded');
  });

  const load = guard('load', async () => {
    setLoadMs(null);
    setLoadMs(await bench.loadGemma(gpu, visionGpu));
  });

  const run = guard('run', async () => {
    if (!lib) return;
    const out: Row[] = sample(lib).map((p) => ({ p }));
    setRows([...out]);
    for (let i = 0; i < out.length; i++) {
      const r = out[i];
      try {
        const [c, ms] = await timed(async () => clip.topConcepts(await clip.embedImages([r.p.uri]), 3));
        r.clip = { ms, words: c.ids.map((id) => lib.conceptNames[id]) };
        setRows([...out]);
        r.mlkit = await bench.mlkitLabels(r.p.uri, MLKIT_SIDE);
        setRows([...out]);
        if (loadMs != null) r.gemma = await bench.gemmaDescribe([r.p.uri], PROMPT, GEMMA_SIDE, GEMMA_MAX_TOKENS, null);
      } catch (e) {
        r.err = e instanceof Error ? e.message : String(e);
      }
      setRows([...out]);
    }
  });

  const runVariants = guard('variants', async () => {
    if (!lib || loadMs == null) return;
    const photos = sample(lib).slice(0, 6);
    const backend = modeName(MODES[mode]);
    for (const v of VARIANTS) {
      const row: OptRow = { backend, v, runs: [], photos: v.story ? photos.length : 1 };
      setOpt((o) => [...o, row]);
      const calls = v.story ? [photos.map((p) => p.uri)] : photos.slice(0, OPT_N).map((p) => (v.text ? [] : [p.uri]));
      for (const uris of calls) {
        row.runs.push(await bench.gemmaDescribe(uris, v.prompt, v.side, v.max, v.thinking ?? null));
        setOpt((o) => [...o]);
      }
    }
  });

  const runIndexBench = guard('index bench', async () => {
    if (!lib) return;
    const photos = [...lib.photos].sort(() => Math.random() - 0.5).slice(0, IDX_N);
    const n = photos.length;
    const lines: string[] = [];
    let ref: { vecs: Float32Array; top1: number[] } | null = null;
    for (const m of IDX_MODES) {
      const t = { info: 0, decode: 0, model: 0, concepts: 0 };
      let size = '';
      const vecs = new Float32Array(n * DIM);
      const top1: number[] = [];
      for (let i = 0; i < n; i += IDX_BATCH) {
        const batch = photos.slice(i, i + IDX_BATCH);
        const [infos, infoMs] = await timed(() => Promise.all(batch.map((a) => MediaLibrary.getAssetInfoAsync(a.id).catch(() => null))));
        t.info += infoMs;
        const b64 = await clip.embedImages(batch.map((a, j) => (m.thumb ? contentUri(a.id) : (infos[j]?.localUri ?? a.uri))), m.thumb);
        const lt = clip.lastEmbedTimings();
        t.decode += lt.decodeMs;
        t.model += lt.modelMs;
        size ||= lt.size;
        const [c, cMs] = await timed(() => clip.topConcepts(b64, 10));
        t.concepts += cMs;
        for (let j = 0; j < batch.length; j++) top1.push(c.ids[j * 10]);
        vecs.set(b64ToFloats(b64), i * DIM);
      }
      const per = (x: number) => (x / n).toFixed(0);
      let vs = '';
      if (ref) {
        const cos = photos.map((_, k) => {
          let d = 0;
          for (let x = 0; x < DIM; x++) d += vecs[k * DIM + x] * ref!.vecs[k * DIM + x];
          return d;
        });
        const same = top1.filter((id, k) => id === ref!.top1[k]).length;
        vs = `\n   vs full: cosine mean ${(cos.reduce((a, b) => a + b, 0) / n).toFixed(3)} min ${Math.min(...cos).toFixed(3)} · top concept same ${((100 * same) / n).toFixed(0)}%`;
      }
      lines.push(`${m.name}: ${per(t.info + t.decode + t.model + t.concepts)} ms/photo (n=${n})\n   info ${per(t.info)} · decode ${per(t.decode)} · model ${per(t.model)} · concepts ${per(t.concepts)} · src ${size}${vs}`);
      setIdx([...lines]);
      ref ??= { vecs, top1 };
    }
  });

  const have = file.bytes > 0;
  const stat = (k: 'clip' | 'mlkit' | 'gemma') => {
    const ms = rows.flatMap((r) => (r[k] ? [r[k]!.ms] : []));
    return ms.length ? `median ${median(ms).toFixed(0)} ms · mean ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(0)} ms (n=${ms.length})` : '—';
  };
  const g = rows.flatMap((r) => (r.gemma ? [r.gemma] : []));

  return (
    <View>
      <Text style={s.meta}>
        Gemma 4 E2B: {have ? `on device, ${mb(file.bytes)}` : file.partial ? `partial ${mb(file.partial)}` : 'not downloaded (2.6 GB)'}
        {dl ? `\n${dl}` : ''}
        {loadMs != null ? `\nloaded (${modeName(MODES[mode])}) in ${(loadMs / 1000).toFixed(1)} s` : ''}
        {busy ? `\n${busy}…` : ''}
      </Text>
      <View style={s.row}>
        {!have && <Btn label={file.partial ? 'Resume download' : 'Download Gemma'} onPress={download} />}
        {have && <Btn label={modeName(MODES[mode])} onPress={() => { setMode((mode + 1) % MODES.length); setLoadMs(null); bench.unloadGemma(); }} />}
        {have && <Btn label="Load" onPress={load} />}
        {have && <Btn label="Delete" onPress={guard('delete', async () => { await bench.deleteGemma(); setLoadMs(null); })} />}
      </View>
      <View style={s.row}>
        <Btn label={`Run ${N} random photos${loadMs == null ? ' (no Gemma)' : ''}`} onPress={run} />
        {loadMs != null && <Btn label="Gemma variants" onPress={runVariants} />}
        <Btn label="CLIP index bench" onPress={runIndexBench} />
      </View>
      {idx.length > 0 && <Text style={s.mono}>{idx.join('\n')}</Text>}

      {opt.map((o, i) => (
        <Text key={i} style={s.line}>
          <Text style={s.k}>
            {o.backend} {o.v.name}: {o.runs.length ? `${(med(o.runs, (r) => r.ms) / 1000).toFixed(1)} s/call${o.photos > 1 ? ` (${(med(o.runs, (r) => r.ms) / 1000 / o.photos).toFixed(1)} s/photo)` : ''}` : '…'}
          </Text>
          {o.runs.length
            ? `  n=${o.runs.length} · prep ${med(o.runs, (r) => r.prepMs)} ms · ttft ${(med(o.runs, (r) => r.ttftMs) / 1000).toFixed(1)} s · prefill ${med(o.runs, (r) => r.prefillTokens)} tok @ ${med(o.runs, (r) => r.prefillTps).toFixed(0)}/s · decode ${med(o.runs, (r) => r.decodeTokens)} tok @ ${med(o.runs, (r) => r.decodeTps).toFixed(1)}/s\n  “${o.runs[0].text.replace(/\s+/g, ' ')}”`
            : ''}
        </Text>
      ))}

      <Text style={s.mono}>
        CLIP   {stat('clip')}{'\n'}
        MLKit  {stat('mlkit')}{'\n'}
        Gemma  {stat('gemma')}
        {g.length ? `\n       ttft ${median(g.map((x) => x.ttftMs)).toFixed(0)} ms · ${median(g.map((x) => x.prefillTokens))} prefill tok · decode ${median(g.map((x) => x.decodeTps)).toFixed(1)} tok/s` : ''}
      </Text>

      {rows.map((r) => (
        <View key={r.p.id} style={s.result}>
          <Image source={{ uri: r.p.uri }} style={s.thumb} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={s.line}><Text style={s.k}>CLIP {r.clip ? `${r.clip.ms} ms` : '…'} </Text>{r.clip?.words.join(', ')}</Text>
            <Text style={s.line}>
              <Text style={s.k}>MLKit {r.mlkit ? `${r.mlkit.ms} ms` : '…'} </Text>
              {r.mlkit?.labels.slice(0, 4).map((l) => `${l.text} ${l.conf.toFixed(2)}`).join(', ')}
            </Text>
            {r.gemma && <Text style={s.line}><Text style={s.k}>Gemma {r.gemma.ms} ms </Text>{r.gemma.text}</Text>}
            {r.err && <Text style={[s.line, { color: '#FF453A' }]}>{r.err}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
};

const Btn = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <TouchableOpacity style={s.btn} onPress={onPress}><Text style={s.btnText}>{label}</Text></TouchableOpacity>
);

const s = StyleSheet.create({
  meta: { color: '#8E8E93', fontSize: 12, lineHeight: 17 },
  mono: { color: '#C7C7CC', fontSize: 11, fontFamily: 'monospace', marginVertical: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginVertical: 4 },
  btn: { backgroundColor: '#2C2C2E', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
  result: { flexDirection: 'row', gap: 8, backgroundColor: '#1C1C1E', borderRadius: 10, padding: 8, marginBottom: 6 },
  thumb: { width: 64, height: 64, borderRadius: 6, backgroundColor: '#2C2C2E' },
  line: { color: '#E5E5EA', fontSize: 11, lineHeight: 15 },
  k: { color: '#FF9500', fontWeight: '700' },
});
