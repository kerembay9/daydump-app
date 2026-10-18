import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { ClipEmbedder, EdgeBench, GemmaResult, MlkitResult } from '../../modules/clip-embedder';
import { IndexedPhoto, Library } from '../services/index/photoIndex';

const GEMMA_URL = 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm';
const PROMPT = 'Give 5 short tags and a one-line caption for this photo.\nFormat:\ntags: a, b, c, d, e\ncaption: ...';
const N = 10;
const GEMMA_SIDE = 512; // shortest side sent to Gemma's vision encoder
const MLKIT_SIDE = 480;
const GEMMA_MAX_TOKENS = 48;

const CAPTION = 'Write one short caption for this photo. Reply with the caption only.';
const STORY = 'These photos are one story from a camera roll. Reply with a short title and a one-line caption.\nFormat:\ntitle: ...\ncaption: ...';
type Variant = { name: string; prompt: string; side: number; max: number; thinking?: boolean; story?: boolean };
/** Same photos through each config; "story" sends 6 photos in one call. */
const VARIANTS: Variant[] = [
  { name: 'base 512 tags+cap', prompt: PROMPT, side: 512, max: GEMMA_MAX_TOKENS },
  { name: 'caption 512', prompt: CAPTION, side: 512, max: 24 },
  { name: 'caption 384', prompt: CAPTION, side: 384, max: 24 },
  { name: 'caption 256', prompt: CAPTION, side: 256, max: 24 },
  { name: 'caption 384 nothink', prompt: CAPTION, side: 384, max: 24, thinking: false },
  { name: 'story 6 photos 384', prompt: STORY, side: 384, max: 32, story: true },
];
const OPT_N = 5;
type OptRow = { backend: string; v: Variant; runs: GemmaResult[]; photos: number };

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
  const [gpu, setGpu] = useState(true);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const [opt, setOpt] = useState<OptRow[]>([]);

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
    setLoadMs(await bench.loadGemma(gpu));
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
    const backend = gpu ? 'GPU' : 'CPU';
    for (const v of VARIANTS) {
      const row: OptRow = { backend, v, runs: [], photos: v.story ? photos.length : 1 };
      setOpt((o) => [...o, row]);
      const calls = v.story ? [photos.map((p) => p.uri)] : photos.slice(0, OPT_N).map((p) => [p.uri]);
      for (const uris of calls) {
        row.runs.push(await bench.gemmaDescribe(uris, v.prompt, v.side, v.max, v.thinking ?? null));
        setOpt((o) => [...o]);
      }
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
        {loadMs != null ? `\nloaded on ${gpu ? 'GPU' : 'CPU'} in ${(loadMs / 1000).toFixed(1)} s` : ''}
        {busy ? `\n${busy}…` : ''}
      </Text>
      <View style={s.row}>
        {!have && <Btn label={file.partial ? 'Resume download' : 'Download Gemma'} onPress={download} />}
        {have && <Btn label={`LLM on ${gpu ? 'GPU' : 'CPU'}`} onPress={() => { setGpu(!gpu); setLoadMs(null); bench.unloadGemma(); }} />}
        {have && <Btn label="Load" onPress={load} />}
        {have && <Btn label="Delete" onPress={guard('delete', async () => { await bench.deleteGemma(); setLoadMs(null); })} />}
      </View>
      <View style={s.row}>
        <Btn label={`Run ${N} random photos${loadMs == null ? ' (no Gemma)' : ''}`} onPress={run} />
        {loadMs != null && <Btn label="Gemma variants" onPress={runVariants} />}
      </View>

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
