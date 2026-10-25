export const meta = {
  name: 'clip-alternatives-table',
  description: 'Exhaustive search for small, commercially licensed CLIP-style image-text models; verify each from primary sources; build one table',
  phases: [
    { title: 'Sweep', detail: 'parallel searches from different angles' },
    { title: 'Merge', detail: 'dedup into a canonical candidate list' },
    { title: 'Verify', detail: 'one agent per candidate, primary sources' },
    { title: 'Challenge', detail: 'skeptics re-check license + numbers of shortlisted models' },
    { title: 'Critic', detail: 'what is missing? feed back into verify' },
    { title: 'Synthesize', detail: 'final table' },
  ],
}

const CONTEXT = `
CONTEXT: An Android photo app (Expo/React Native, native Kotlin module, LiteRT/TFLite with GPU delegate + XNNPACK CPU) runs a CLIP-style dual encoder fully on-device.
It currently ships TinyCLIP-auto-ViT-45M/32-Text-18M (LAION+YFCC-400M, MIT): image tower ~45M params, text tower ~18M, 224px, ImageNet-1k zero-shot 62.7%, int8 image tower 46 MB, ~73 ms/photo on a Galaxy A54.
Uses: (1) image embeddings for similarity/near-duplicates, (2) zero-shot tagging against ~3,600 precomputed concept text vectors, (3) free-text photo search (text tower on device, downloaded on demand), (4) a few fixed precomputed phrases.
The user wants a better model that: has a weights license allowing use in a shipped COMMERCIAL app (Apache-2.0, MIT, BSD, CC-BY etc. OK; research-only / non-commercial / CC-BY-NC / Apple AMLR NOT OK); keeps the image tower small (ideally <= ~50M params, absolute ceiling ~100M; download size matters a lot); has a shared image-text embedding (true zero-shot text queries, not just a classifier); exportable to TFLite/LiteRT (ONNX/PyTorch fine).
Text tower size matters less but still counts (it is an on-demand download).
ALREADY KNOWN (still to be verified, but find MORE beyond these): TinyCLIP family (MIT); Apple MobileCLIP v1 + MobileCLIP2 (apple-amlr research-only -> excluded); Meta PE-Core T16/S16-384 (Apache-2.0, 62.1% / 72.7% IN ZS); OpenCLIP ViT-B/32 DataComp-XL (MIT, 72.7%); UCSC OpenVision Ti/S (Apache-2.0, ZS unknown); SigLIP/SigLIP2 (Apache, smallest is B); EmbeddingGemma 2 (Apache, 740M, too big); MetaCLIP (CC-BY-NC); jina-clip (NC).
Today is 2026-10-21. Prefer primary sources (model cards, LICENSE files, papers, official repos). Never guess a license: say "unclear" if not found.`

const SWEEP_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'specific checkpoint/variant name' },
          org: { type: 'string' },
          approx_image_params_M: { type: 'string' },
          license_guess: { type: 'string' },
          why: { type: 'string' },
          source_url: { type: 'string' },
        },
        required: ['name', 'org', 'why', 'source_url'],
      },
    },
  },
  required: ['candidates'],
}

const SWEEPS = [
  { key: 'papers', prompt: 'Search arXiv / CVPR / ICCV / NeurIPS / ICLR / ECCV 2022-2026 for efficient, mobile, tiny, distilled, or pruned CLIP / contrastive image-text models (e.g. TinyCLIP, MobileCLIP, CLIP-KD, EfficientCLIP, LightCLIP, ALIP, CLIP-distillation, RepViT/FastViT/EfficientViT/MobileViT-based CLIP, EVA-CLIP small, data-efficient CLIP). For each, find whether weights were released and under what license.' },
  { key: 'hubs', prompt: 'Sweep model hubs: the open_clip pretrained list (open_clip.list_pretrained / its README results table), timm image-text models, Hugging Face hub (search "clip", "siglip", "image-text", "zero-shot-image-classification" filtered by small size and permissive licenses like apache-2.0 / mit), Kaggle Models, ONNX community. List small image-text dual encoders with permissive licenses.' },
  { key: 'labs', prompt: 'Sweep releases from major labs and companies for small image-text embedding models: Google (SigLIP, SigLIP2 incl. any small/patch32 variants, TIPS, MediaPipe image embedder, EmbeddingGemma), Meta (Perception Encoder all sizes, MetaCLIP 1/2 incl. small variants), Apple (MobileCLIP, DFN, AIMv2), Microsoft, NVIDIA (RADIO with text adaptor, NV-CLIP), Alibaba/Qwen, ByteDance, Tencent, Baidu, Nomic (nomic-embed-vision), Jina, Unum (UForm), Cohere, Voyage, LAION, Hugging Face, Salesforce (BLIP/ALBEF small), Snap, Samsung, Qualcomm.' },
  { key: 'ondevice', prompt: 'Sweep the on-device deployment ecosystem for CLIP-style models people actually ship on phones: Qualcomm AI Hub models, Google LiteRT / MediaPipe model zoos, Apple Core ML zoo, Immich machine-learning model list (it lists many CLIP models with sizes and accuracy), Ente photos, PhotoPrism, open-source Android photo search apps (e.g. PicQuery, Smart Search, Searchy), Hugging Face spaces/blogs about mobile CLIP, ONNX Runtime mobile examples. Report the models they use and their licenses.' },
  { key: 'licensing', prompt: 'Focus on LICENSE-clean alternatives: (a) open retrains or reproductions of efficient architectures (e.g. MobileCLIP-architecture models retrained on DataComp / open data by third parties, OpenCLIP small models like ViT-S/16, ViT-Ti, ConvNeXt-tiny/nano CLIP, RN50 variants, EfficientNet CLIP, MobileNetV3/MobileNetV4 CLIP); (b) small CLIP models under Apache-2.0 / MIT / BSD; (c) distilled text encoders compatible with an existing image tower (to shrink text side). Check each weights license carefully.' },
  { key: 'recent', prompt: 'Focus on the newest releases, 2025-10 through 2026-10: any new small or mobile vision-language embedding / CLIP-like models, new versions of SigLIP, Perception Encoder, OpenVision, TinyCLIP, MobileCLIP, MetaCLIP, EmbeddingGemma, Gemma-based or Qwen-based embedders, multilingual small CLIPs. Use extended web search. Report weights licenses.' },
]

phase('Sweep')
const sweepResults = await parallel(SWEEPS.map(s => () =>
  agent(`${CONTEXT}\n\nYOUR SEARCH ANGLE: ${s.prompt}\n\nReturn every relevant candidate checkpoint you find (be inclusive at this stage: include ones with unclear license or image tower up to ~150M params; skip clearly huge ones >300M). One entry per distinct checkpoint/size variant. Include the URL where you found it.`,
    { label: `sweep:${s.key}`, phase: 'Sweep', schema: SWEEP_SCHEMA })))
const raw = sweepResults.filter(Boolean).flatMap(r => r.candidates)
log(`Sweep found ${raw.length} raw mentions`)

const MERGE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          org: { type: 'string' },
          hints: { type: 'string', description: 'URLs and notes from the sweep' },
        },
        required: ['name', 'org', 'hints'],
      },
    },
    dropped: { type: 'array', items: { type: 'string' }, description: 'names dropped with reason (e.g. >150M image params, not image-text)' },
  },
  required: ['candidates', 'dropped'],
}

phase('Merge')
async function merge(items, alreadyVerified) {
  return agent(`${CONTEXT}\n\nDeduplicate and canonicalize these candidate mentions into one list of distinct checkpoints (one per size variant; merge aliases like "PE-Core-S16-384" / "timm/PE-Core-S-16-384"). Drop anything that is not an image-text dual encoder with a usable text side, or whose image tower is clearly >150M params; list drops with a reason. Also drop names already in this verified list: ${JSON.stringify(alreadyVerified)}.\n\nMENTIONS:\n${JSON.stringify(items)}`,
    { label: 'merge', phase: 'Merge', schema: MERGE_SCHEMA })
}
const merged = await merge(raw, [])
log(`Merged to ${merged.candidates.length} candidates; dropped ${merged.dropped.length}`)

const ROW_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    org: { type: 'string' },
    released: { type: 'string' },
    image_params_M: { type: 'string' },
    text_params_M: { type: 'string' },
    resolution: { type: 'string' },
    arch: { type: 'string', description: 'e.g. ViT-S/16, FastViT, ResNet; patch size; token count' },
    image_gmacs: { type: 'string' },
    in1k_zeroshot: { type: 'string', description: 'number + where it came from; "not reported" if none' },
    other_zeroshot: { type: 'string', description: 'COCO retrieval etc. if reported' },
    weights_license: { type: 'string' },
    commercial_ok: { type: 'string', enum: ['yes', 'no', 'unclear'] },
    license_notes: { type: 'string', description: 'exact license name + any usage restrictions, data-license caveats' },
    load_id: { type: 'string', description: 'open_clip / HF / timm id to load it' },
    export_notes: { type: 'string', description: 'existing TFLite/ONNX/CoreML exports, GPU-delegate-unfriendly ops, mobile latency reports' },
    exists: { type: 'boolean', description: 'false if weights not actually downloadable' },
    sources: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['name', 'org', 'image_params_M', 'text_params_M', 'in1k_zeroshot', 'weights_license', 'commercial_ok', 'license_notes', 'exists', 'sources', 'confidence'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    license_holds: { type: 'boolean' },
    numbers_hold: { type: 'boolean' },
    corrections: { type: 'string', description: 'corrected values with sources, or empty' },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['license_holds', 'numbers_hold', 'corrections', 'sources'],
}

function shortlisted(r) {
  if (!r || !r.exists || r.commercial_ok === 'no') return false
  const p = parseFloat(String(r.image_params_M).replace(/[^0-9.]/g, ''))
  return isNaN(p) || p <= 110
}

async function verifyAll(cands) {
  return pipeline(cands,
    c => agent(`${CONTEXT}\n\nVERIFY ONE CANDIDATE from primary sources (official model card, LICENSE file in the repo AND on the weights host, paper tables, model config files). Compute params from the config if not stated, and say so. Check whether the weights license differs from the code license, and whether the model card adds use restrictions. Check whether the text tower is actually released. Find any existing mobile export or latency report.\n\nCANDIDATE: ${c.name} (${c.org})\nHINTS: ${c.hints}`,
      { label: `verify:${c.name}`, phase: 'Verify', schema: ROW_SCHEMA }),
    async row => {
      if (!shortlisted(row)) return { row, verdicts: [] }
      const verdicts = (await parallel([0, 1].map(i => () =>
        agent(`${CONTEXT}\n\nSKEPTIC #${i + 1}: Try to REFUTE this verified row. Independently re-check, from primary sources only, (a) the weights license and whether it truly permits commercial use in a shipped app (look for research-only clauses, NC data terms, model-card restrictions, gated access terms), and (b) the image/text param counts and ImageNet zero-shot number. If uncertain, set the field to false.\n\nROW: ${JSON.stringify(row)}`,
          { label: `challenge${i + 1}:${row.name}`, phase: 'Challenge', schema: VERDICT_SCHEMA })))).filter(Boolean)
      return { row, verdicts }
    })
}

phase('Verify')
let verified = (await verifyAll(merged.candidates)).filter(Boolean)

phase('Critic')
for (let round = 0; round < 2; round++) {
  const names = verified.map(v => v.row && v.row.name).filter(Boolean)
  const critic = await agent(`${CONTEXT}\n\nCOMPLETENESS CRITIC (round ${round + 1}). Here is the list of checkpoints already verified:\n${JSON.stringify(names)}\n\nWhat relevant small, image-text dual encoders are MISSING? Search actively (web search, hubs, papers, open_clip results table, Immich model list) for ones not in the list. Only return genuinely new checkpoints, not aliases of listed ones. Return an empty list if nothing is missing.`,
    { label: `critic:${round + 1}`, phase: 'Critic', schema: SWEEP_SCHEMA })
  const fresh = (critic && critic.candidates) || []
  if (!fresh.length) { log(`Critic round ${round + 1}: nothing missing`); break }
  const m2 = await merge(fresh, names)
  if (!m2.candidates.length) { log(`Critic round ${round + 1}: only aliases`); break }
  log(`Critic round ${round + 1}: ${m2.candidates.length} new candidates`)
  verified = verified.concat((await verifyAll(m2.candidates)).filter(Boolean))
}

phase('Synthesize')
const table = await agent(`${CONTEXT}\n\nBuild the FINAL markdown deliverable from these verified rows and skeptic verdicts. Apply skeptic corrections where a majority of verdicts disagree with the row (cite which). Rules:
- Table 1 "Usable (commercial OK)": rows with commercial_ok=yes after challenge, sorted by image params ascending. Columns: Model | Org | Image M | Text M | Res / arch | IN-1k ZS | License | Load id | Notes (mobile export, latency, caveats). Mark the current model (TinyCLIP-45M/32 LAION+YFCC) with "(current)".
- Table 2 "Excluded": license no/unclear or not released, with the one-line reason.
- Then "Pareto picks for this app": at most 4 bullets: best accuracy at <= current image size, smallest at ~current accuracy, best overall under ~100M image, and a text-tower note. Be concrete.
- Then "Unknowns to measure ourselves" (max 5 bullets).
- Then a Sources list (dedup URLs).
Mark any number that is computed from config with "~" and any number that is unverified with "?". Do not invent numbers.
- ADD an "Est. A54 ms" column to Table 1 (after Res / arch), plus an "Image GMACs" column. Calibration, measured in this app on a Galaxy A54 (GPU delegate, fp16, batch 1, 224px, ViT /32 = 50 tokens): TinyCLIP ViT-22M/32 = 38 ms, ViT-40M/32 = 64 ms, ViT-45M/32 = 73 ms. For each model compute image-tower GMACs (use reported if image-only; else for ViTs ~ params x tokens + attention 2*L*N^2*d, tokens = (res/patch)^2 + 1; for conv/hybrid use reported or "?"), then scale ms linearly from the calibration (the three calibration points come to ~32-34 ms per image-GMAC, e.g. 45M x 50 tokens ~ 2.25 GMACs -> 73 ms). Prefix every estimate with "~", note conv/hybrid nets on the mobile GPU delegate can deviate +-2x, and where a model is flexible in resolution (RoPE / interpolated pos-emb) also give the estimate at 224px in the Notes column. Use any real phone latency report found in the rows instead when one exists, cited.

ROWS + VERDICTS:\n${JSON.stringify(verified)}`,
  { label: 'synthesize', phase: 'Synthesize' })

return { table, rowCount: verified.length, dropped: merged.dropped }
