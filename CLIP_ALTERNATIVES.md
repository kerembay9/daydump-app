# CLIP replacements: candidates, shortlist, measurements

Search for a better on-device image-text model than the shipped TinyCLIP-45M/32 that a commercial app may ship.
108 checkpoints were checked against primary sources (model cards, LICENSE files, papers), with two skeptics
re-checking each shortlisted one (2026-10-22). Raw data: `research/clip-alternatives/rows.json`; search script:
`research/clip-alternatives/workflow.js`. Keep this file current when a measurement or decision changes.

Ruled out on license: Apple MobileCLIP v1 and MobileCLIP2. Their weights are research-only (Apple ML Research Model
license: "use in any commercial product or service" excluded, fine-tunes included). Only the code is MIT.

## Shortlist

Ordered by how plausible the swap is. ms are **estimates** (32.5 ms per image GMAC, calibrated on our TinyCLIP
A54 timings; 577-token PE graphs may run up to 2x off on the GPU delegate) except where marked measured. Text tower
sizes include the token embedding table (that is what the file holds).

| # | Model | IN-1k zero-shot | COCO text→image R@1 | Est. A54 ms | Image int8 | Text tower (int8) | License | Why / catch |
|---|---|---|---|---|---|---|---|---|
| 0 | **TinyCLIP-45M/32 (current)** | 62.7% (61.4% on our subset) | **37.0% (measured)** | **73 @224 (measured)** | 46 MB | ~43M (45 MB) | MIT | baseline |
| 1 | **PE-Core-S16-384** | **72.7%** @384 | 42.6% @384 (reported) | ~546 @384, **~164 @224** | ~25 MB | ~63M (~65 MB) | Apache-2.0 | Measured: beats current only at 384 (ECCV R@1 80.1% vs 76.6%, ~7× slower); ties at 256, below at 224 |
| 2 | TinyCLIP-63M/32 LAION+YFCC | 64.5% | n/r | ~103 | ~64 MB | ~57M | MIT | Drop-in for `build_assets.py`. Measured on VIST: ties current on search and curation |
| 3 | PE-Core-T16-384 | 62.1% @384 | 33.0% @384 (reported) | ~165 @384, ~45 @224 | ~7 MB | ~63M (~65 MB) | Apache-2.0 | Out: measured below current at every size (ECCV R@1 61.6% @224 vs 76.6%) |
| 4 | OpenVision S/16 @160 | 63.5% | n/r | ~74 | ~22 MB | ~34M | Apache-2.0 | Same speed, half the download; BERT tokenizer. Stock open_clip load gave near-random VIST scores: unmeasured |
| 5 | DatologyAI cls-opt B/32 | 76.9%? (self-reported) | n/r | ~143 | ~88 MB | ~63M | Apache-2.0 | Measured on VIST: −7 search R@1 vs current. Out. Its sibling **retr-opt** is the one search win: +4.9 R@1 |
| 6 | OpenCLIP B-32-256 DataComp s34b | 72.8% | n/r | ~187 | ~88 MB | ~63M | MIT | Measured on VIST: ties current on search, +2 on tags. 2x download |
| 7 | OpenVision S/8 @160 | 67.3% | n/r | ~331 | ~22 MB | ~34M | Apache-2.0 | Small but 4.5x slower |
| 8 | SigLIP2 B/32 @256 | 74.0% | 47.2% (reported) | ~187 | ~96 MB | 282M | Apache-2.0 | Text tower far too big |
| 9 | TIPS v1 S/14 | 71.5% | n/r | ~1037 @448, ~201 @224 | ~22 MB | ~34M | Apache-2.0 | Heavy at native size |

Text tower facts for the app: it only runs for free-word search in Create (textpack). Indexing, concept tags and
the selfie phrases use precomputed text vectors, so a bigger text tower costs download only. A swap needs the
model's own text tower (vectors only match their pair); to shrink it, prune the 49k-token table (~-17 MB) or
distill a small text student into its space. Any swap means recomputing concepts, phrases and a full reindex.

## Measured here

COCO 5k / ECCV Caption text→photo search (`scripts/eval_retrieval.py` data and metrics), fp32 on PC, shortest side
→ N px then center crop as in the app. PE-Core at sizes below 384 uses timm's resized position embeddings.

| Model @ px | ECCV R@1 (top hit correct) | ECCV mAP@R | COCO R@1 | COCO R@5 | COCO R@10 |
|---|---|---|---|---|---|
| **TinyCLIP-45M @224 (current)** | **76.6%** | **36.4** | **37.0%** | **62.8%** | **73.2%** |
| PE-Core-T16 @384 | 73.6% | 33.9 | 32.0% | 57.9% | 69.3% |
| PE-Core-T16 @256 | 67.3% | 30.4 | 27.4% | 52.3% | 63.9% |
| PE-Core-T16 @224 | 61.6% | 26.4 | 23.1% | 46.7% | 58.0% |
| PE-Core-T16 @192 | 53.5% | 21.5 | 17.9% | 38.2% | 49.7% |
| PE-Core-T16 @160 | 42.0% | 16.1 | 12.7% | 29.4% | 39.1% |
| PE-Core-T16 @128 | 35.7% | 12.4 | 8.9% | 21.7% | 30.1% |
| PE-Core-S16 @384 | **80.1%** | **39.3** | **41.0%** | **66.7%** | **76.6%** |
| PE-Core-S16 @256 | 76.7% | 37.2 | 37.3% | 63.8% | 74.3% |
| PE-Core-S16 @224 | 74.2% | 35.2 | 35.1% | 60.6% | 71.7% |
| PE-Core-S16 @192 | 68.1% | 30.8 | 29.0% | 54.3% | 65.6% |
| PE-Core-S16 @160 | 56.5% | 23.7 | 21.5% | 44.0% | 55.3% |
| PE-Core-S16 @128 | 42.8% | 17.1 | 15.1% | 32.9% | 43.0% |

PE-Core-T16 is below the current model at every size, even at its native 384. It drops ~6–11 ECCV points per size step below 384, so shrinking the input is not viable.

PE-Core-S16 beats the current model only at 384 (+3.5 ECCV R@1, +4.0 COCO R@1), at ~546 ms estimated vs 73 ms. At 256 it ties (~214 ms est.), at 224 it is 2.4 points below. Its image tower is smaller (~25 vs 46 MB) but the text tower is ~20 MB bigger, so it is not a clear win at any size. Below 224 both PE-Core models collapse.

### VIST (camera-roll-like albums)

The first 5 GB of the VIST test split (HF `dyliu/VIST`, Flickr albums; images in `scripts/.cache/vist/`, gitignored). That is 2,631 photos, 1,821 human photo descriptions as search queries, and 118 complete albums with 590 human-picked 5-photo stories. Same preprocessing as the app.

- **Search**: each description searches all 2,631 photos; "album" means searching only within the photo's own album.
- **Tags**: the share of photos whose top-5 concept tags share a word with the photo's Flickr tags or title.
- **Curation**: the app's `pick()` (time buckets, `photoWorth` quality, near-duplicate skip) chooses 5 per album. The score is the share of the picks that humans put in a story. Reference points: random 27.1, time buckets only 29.0, best possible 78.5.

| Model @ px | Search R@1 | R@5 | R@10 | Album R@1 | Tags | Curation |
|---|---|---|---|---|---|---|
| **TinyCLIP-45M @224 (current)** | **43.0** | **73.3** | **80.9** | **67.7** | **36.3** | **29.5** |
| TinyCLIP-63M @224 | 43.7 | 73.6 | 81.3 | 68.2 | 35.0 | 30.2 |
| PE-Core-T16 @224 | 30.1 | 54.9 | 65.9 | 56.7 | 30.2 | 28.7 |
| PE-Core-S16 @224 | 40.1 | 68.6 | 77.5 | 63.6 | 38.0 | 30.0 |
| PE-Core-S16 @256 | 43.5 | 71.7 | 79.7 | 64.6 | 38.8 | 29.1 |
| PE-Core-S16 @384 | 47.3 | 74.9 | 82.8 | 68.7 | 39.1 | 28.0 |
| DatologyAI cls-opt B/32 @224 | 36.0 | 64.6 | 74.0 | 62.3 | 35.8 | 27.1 |
| **DatologyAI retr-opt B/32 @224** | **47.9** | **75.1** | **82.4** | **70.9** | 35.1 | 28.5 |
| OpenCLIP B-32-256 DataComp @256 | 43.3 | 71.6 | 79.2 | 66.6 | 38.5 | 29.2 |
| OpenVision S/16 @160 | (broken load) | | | | | |

Differences vs current with 95% paired-bootstrap CIs: only DatologyAI retr-opt (+4.9 R@1 [+2.6, +7.1], +3.2 album [+1.2, +5.1]) and PE-Core-S16@384 (+4.3 R@1 [+2.1, +6.6]) win search clearly. TinyCLIP-63M, PE-S16@256 and OpenCLIP B-32-256 tie. PE-S16 and OpenCLIP B-32-256 gain 2–3 points on tags, and retr-opt loses 1. No model changes curation (every CI spans 0); curation sits close to the time-bucket baseline because `worth` adds almost nothing, so better curation has to come from the ranking logic, not the model. DatologyAI cls-opt's self-reported ImageNet lead does not carry over to search here (−7 R@1). OpenVision returned near-random scores through stock open_clip, so its loader needs the OpenVision repo code; it is unmeasured, not ruled out.

Takeaway: the only search upgrade under ~150 ms is DatologyAI retr-opt B/32 (Apache-2.0, ~143 ms est., ~88 MB image + ~64 MB text int8, about 2× today's ms and MB).

---

# Full candidate table (workflow output)

Correction to the text-tower note under "Pareto picks" below: "~3.5x today's 18M" compares PE's tower *with* its
embedding table to TinyCLIP's *without*. Like for like it is ~63M vs ~43M, about 1.5x (+~20 MB int8).


**Context.** The app currently ships TinyCLIP-auto-ViT-45M/32 (LAION+YFCC). That is a 45M-param image tower, an 18M text tower, 62.7% ImageNet-1k zero-shot, a 46 MB int8 image file, and 73 ms per photo measured on the Galaxy A54.

**How to read the tables**
- **Markers.** `~` means I computed the number from the model config or a formula. `?` means the number is unverified. `n/r` means not reported. `†` marks conv or hybrid models: their estimate can be off by up to 2x either way on the mobile GPU delegate.
- **Image GMACs.** Where a source reports image-only cost I used it. open_clip's `model_profile.csv` gives GFLOPs, which I divided by 2 (its own ViT-B-32 entry, 8.82, equals the known 4.4 GMACs). For plain ViTs I used params × tokens + 2·L·N²·d.
- **Est. A54 ms.** This is 32.5 ms × image GMACs. That scale comes from the in-app calibration: TinyCLIP 22M/32 at 1.1 GMACs = 38 ms, 40M/32 at 2.0 = 64 ms, 45M/32 at 2.25 = 73 ms.
- **Reported phone latencies** are shown in `[…ʳ]`. They come from other phones and runtimes, not the A54. Most use the LiteRT CompiledModel API or the ML-Drift GPU path rather than the app's classic GPU delegate, so they are not directly comparable (see Unknowns #1). iPhone CoreML numbers are in the Notes column only.

**Corrections applied** (where the skeptic verdicts outvoted the row, or confirmed a correction the row itself made)
- OpenCLIP ViT-B-32 laion400m_e32: ImageNet zero-shot is **62.96%**, not 60.2%. Both skeptics found that 60.2% came from the non-QuickGELU rows of `openclip_results.csv`; the QuickGELU rows say 62.93/62.94.
- OpenCLIP ViT-B-32 datacomp_xl_s13b_b90k: **69.2%**, not 72.7%. The row and both skeptics agree. The 72.7% in the brief belongs to ViT-B-32-256 datacomp_s34b_b86k (72.8% in the CSV).
- OpenCLIP B-16 datacomp_l: ObjectNet is 53.0, not 54.0 (both skeptics).
- ViTamin-S-LTT and ViTamin-B-LTT: the text tower is about 123.7M (the frozen ViTamin-L text tower). The card's 40.4M and 63.4M are copy errors (row plus both skeptics).
- FG-CLIP 2: both skeptics say it is not clearly commercial, because it was trained on Wukong (CC BY-NC-SA) and its card tells users to obey dataset licenses. It is excluded.
- OpenAI RN50x4 GMACs (my own correction): ~21.3, not 42.6. The row assumed 1 FLOP = 1 MAC, which is inconsistent with the same CSV's ViT-B/32 entry.
- TinyCLIP 45M/32: the README's "1.9 GMACs" is a typo. The paper says 3.7 GMACs per image+text pair.

### Table 1 — Usable (commercial OK)

Sorted by image params, ascending.

| Model | Org | Image M | Text M | Res / arch | Est. A54 ms | Image GMACs | IN-1k ZS | License | Load id | Notes (mobile export, latency, caveats) |
|---|---|---|---|---|---|---|---|---|---|---|
| OpenVision Ti/16 | UCSC-VLAA | ~5.6 (paper 5.9) | ~11.5 | 224 (also 160/384 ckpts); ViT-Ti/16, 197 tok | ~42 | ~1.3 | 49.6 | Apache-2.0 | open_clip `hf-hub:UCSC-VLAA/openvision-vit-tiny-patch16-224` | 160: ~20 ms, 46.9%. 384: ~155 ms, 51.4%. BERT WordPiece tokenizer, 192-d embedding. No exports exist. |
| OpenVision Ti/8 | UCSC-VLAA | ~5.6 | ~11.5 | 224; ViT-Ti/8, 785 tok | ~235 | ~7.2 | 53.5 | Apache-2.0 | `hf-hub:UCSC-VLAA/openvision-vit-tiny-patch8-224` | 160: ~97 ms, 51.9%. ImageNet numbers come from the README only. |
| PE-Core-T16-384 | Meta FAIR | 6.14 | 63.4 (25.3 emb) | 384; ViT-Ti/16 + 2D RoPE + MAP head, 577 tok | ~165 | ~5.1 | 62.1 | Apache-2.0 | `hf-hub:timm/PE-Core-T-16-384` | At 224 with interpolated pos-emb: ~45 ms, ~1.4 GMACs, measured ECCV R@1 61.6% / COCO R@1 23.1% (well below current). Image tower ~7 MB int8. CLIP BPE, 32-token context. No exports exist. |
| TinyCLIP-ViT-8M/16 (YFCC15M) | Microsoft | 8.28 | 15.2 (2.5 w/o emb) | 224; ViT/16 w256, 197 tok | ~59 | ~1.8 | 41.1 | MIT | HF `wkcn/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M` | An onnx-community combined-graph ONNX exists. Too weak to replace the current model. |
| TinyCLIP-ResNet-19M | Microsoft | ~18.6 | ~44.8 | 224; ModifiedResNet w44 + attnpool | ~89† | ~2.7 | 56.4 | MIT (repo; weights asset has no LICENSE file, same as current) | TinyCLIP fork `TinyCLIP-ResNet-19M-Text-19M` + release .pt | Not on HF. 1024-d embedding. Conv backbone is GPU-friendly. |
| TIPS v1 S/14-HR | Google DeepMind | 21.6 | 33.6 | 448 native (any multiple of 14); ViT-S/14, 1026 tok | ~1037 | ~31.9 | 71.5 (eval resolution ?; 1 skeptic reads it as 224) | Apache-2.0 (HF); GCS ckpts CC-BY-4.0 | HF `google/tipsv1-s14` (trust_remote_code) | At 224: ~201 ms, ~6.2 GMACs, accuracy ?. 384-d embedding, SentencePiece 32k. COCO T→I 50.0. |
| UForm3 english-small | Unum Cloud | 21.77 | 57.1 (~52 used) | 224; ViT-S/16 | ~151 | ~4.7 | 36.1 | Apache-2.0 | HF `unum-cloud/uform3-image-text-english-small` | Official ONNX (image 22.6 MB). Only iPad latency is reported. Much too weak. |
| OpenVision S/16 | UCSC-VLAA | ~21.8 (paper 22.4) | ~33.8 | 224 (160/384 ckpts); ViT-S/16 | ~151 | ~4.7 | 65.9 (160: 63.5; 384: 67.1) | Apache-2.0 | `hf-hub:UCSC-VLAA/openvision-vit-small-patch16-224` | **160: ~74 ms, ~2.3 GMACs**, the same latency as current at 63.5%. 384: ~513 ms. BERT tokenizer, 384-d. |
| OpenVision S/8 | UCSC-VLAA | ~21.8 | ~33.8 | 224 / 160; ViT-S/8, 785 tok | ~741 | ~22.8 | 68.6 (160: 67.3) | Apache-2.0 | `…/openvision-vit-small-patch8-160` | 160: ~331 ms, ~10.2 GMACs. ImageNet numbers come from the README only. |
| ViTamin-S | JHU + ByteDance | 22.0 | 40.4 | 224; hybrid MBConv + ViT, 196 tok | ~179† | 5.50 (reported) | 62.2 | MIT (weights), Apache-2.0 (code) | open_clip `('ViTamin-S','datacomp1b')` | LayerNorm2d / GeGLU / erf-GELU need care in conversion. CLIP BPE, 384-d. |
| SLIP ViT-S/16 (YFCC15M, 100 ep) | Meta FAIR | ~22 | ~63 | 224; ViT-S/16 (12 heads) | ~152 | ~4.7 | 39.5 | MIT | `dl.fbaipublicfiles.com/slip/slip_small_100ep.pt` + SLIP `models.py` | The 1.26 GB checkpoint includes training state. Dominated. |
| TinyCLIP-auto-22M/32 (LAION-400M) | Microsoft | 22 (paper) | 10 (paper, excl. ~25 emb) | 224; pruned ViT-B/32 | 38 (measured) | ~1.1 | 53.7 | MIT | fork `TinyCLIP-auto-ViT-22M-32-Text-10M`, `LAION400M` | Flickr T→I 52.0 vs 63.9 for current. No LAION+YFCC version exists. |
| ViTamin-S-LTT | JHU + ByteDance | 22.2 | ~123.7 (ViTamin-L text) | 224; hybrid | ~179† | 5.50 | 63.4 | MIT | `('ViTamin-S-LTT','datacomp1b')` | 768-d. Text tower ~124 MB int8. |
| **PE-Core-S16-384** | Meta FAIR | 23.78 | 63.4 | 384; ViT-S/16 + RoPE + MAP, 577 tok | ~546 | ~16.8 | **72.7** | Apache-2.0 | `hf-hub:timm/PE-Core-S-16-384` | **At 224 (interpolated): ~164 ms, ~5.0 GMACs, measured ECCV R@1 74.2% / COCO R@1 35.1% (below current).** COCO T→I 42.6. Image ~25 MB int8. Only exports: an MLX port and an ANE CoreML port (trunk features). |
| TinyCLIP-ResNet-30M | Microsoft | ~29.6 | ~54.2 (28.9 w/o emb) | 224; ModifiedResNet w56 + attnpool | ~153† | ~4.7 | 59.1 | MIT (repo) | fork `TinyCLIP-ResNet-30M-Text-29M` + release .pt | Dominated. |
| Chinese-CLIP RN50 | OFA-Sys / Alibaba | 38 | 39 | 224; ModifiedResNet-50 + RBT3 | ~199† | ~6.1 | 33.5 (Chinese prompts) | Apache-2.0 (weights), MIT (code) | `cn_clip.load_from_name("RN50")` | Chinese-only text. Official ONNX/TensorRT export. |
| OpenCLIP RN50-quickgelu cc12m | mlfoundations | 38.32 | 63.69 | 224; ModifiedResNet-50 | ~199† | ~6.1 | 36.5 (yfcc15m: 32.8) | MIT | `hf-hub:timm/resnet50_clip.cc12m` | Dominated. |
| TinyCLIP-ViT-39M/16 (YFCC15M) | Microsoft | 38.59 | 44.5 (19.2 w/o emb) | 224; ViT/16 w512, 197 tok | ~263 | ~8.1 | 63.5 | MIT | HF `wkcn/TinyCLIP-ViT-39M-16-Text-19M-YFCC15M` | iPhone 12 Pro Max CoreML: 5.2 ms image (MobileCLIP paper, Table 7). ONNX exists. |
| TinyCLIP-ViT-40M/32 (LAION-400M) | Microsoft | 39.7 | 44.5 (19.2 w/o emb) | 224; ViT/32 w512 | 64 (measured) | ~2.0 | 59.8 | MIT | HF `wkcn/TinyCLIP-ViT-40M-32-Text-19M-LAION400M` | iPhone 12 Pro Max: 3.0 ms. Dominated by current. |
| **TinyCLIP-auto-45M/32 LAION+YFCC (current)** | Microsoft | ~45 | 18 (excl. emb) | 224; pruned ViT-B/32, 50 tok | **73 (measured)** | ~2.25 | 62.7 | MIT | fork `TinyCLIP-auto-ViT-45M-32-Text-18M`, `LAIONYFCC400M` | 46 MB int8. Paper: 3.7 GMACs per image+text pair. |
| OpenAI CLIP RN101 | OpenAI | 56.26 | 63.43 | 224; ModifiedResNet-101 | ~319† | ~9.8 | 62.3 | MIT (repo; see footnote) | open_clip `('RN101','openai')` | Card says deployed use is "out of scope" (advisory). No gain over current. |
| TinyCLIP-ViT-61M/32 (LAION-400M) | Microsoft | 61.4 | 54.0 | 224; ViT/32 w640 | ~101 | ~3.1 | 62.4 | MIT | HF `wkcn/TinyCLIP-ViT-61M-32-Text-29M-LAION400M` | iPhone 12 Pro Max: 4.3 ms. Dominated. |
| TinyCLIP-auto-63M/32 LAION+YFCC | Microsoft | 62.75 | 57.3 (32.0 w/o emb) | 224; pruned ViT-B/32, 50 tok | ~103 | ~3.2 | 64.5 | MIT | fork `TinyCLIP-auto-ViT-63M-32-Text-31M`, `LAIONYFCC400M` | Same loader and export path as current: drop-in. +1.8 pt for ~64 MB int8. |
| TinyCLIP-auto-63M/32 LAION-400M | Microsoft | 63.4 | 56.5 | same | ~104 | ~3.2 | 63.9 | MIT | same, `LAION400M` | Strictly worse than its YFCC sibling. |
| RWKV-CLIP B/32 (YFCC15M) | DeepGlint | 84.2 (B/16: 82.8) | 65.35 | 224; Vision-RWKV-6 | ~130? | ~4.0 (7.91 GFLOPs ÷ 2) | 44.3 | Apache-2.0 (weights), MIT (code) | HF `Kaichengalex/RWKV-CLIP-B32-YFCC15M` | WKV kernels are CUDA-only, so it cannot be exported without a rewrite. LAION checkpoints have no zero-shot numbers. |
| TIPSv2 B/14 | Google DeepMind | 85.7 (paper 86.3) | 109.6 | 448; ViT-B/14, 1026 tok | ~3487 [Pixel 8a GPU ≤920ʳ, backbone + 3 DPT heads] | ~107 | n/r | Apache-2.0 (HF) | HF `google/tipsv2-b14` | At 224: ~764 ms, ~23.5 GMACs, accuracy ?. Flickr I→T 92.6. |
| ALBEF ViT-B/16 (ITC path) | Salesforce | 85.8 | ~66.4 (6-layer ITC path) | 224/256/384; ViT-B/16, interpolated pos | ~572 @224 | ~17.6 | n/r | BSD-3 (repo; weights by implication) | GCS `sfr-pcl-data-research/ALBEF/ALBEF.pth` | 384: ~1814 ms. Its zero-shot Flickr numbers include ITM reranking. 256-d. |
| jina-clip-v1 | Jina AI | 85.9 | 136.8 | 224; EVA02-B/16 | ~572 | ~17.6 | 59.1 | Apache-2.0 (weights) | HF `jinaai/jina-clip-v1` (`onnx/` files) | Its remote modeling code is CC-BY-NC, so use the ONNX files (int8 image 87.9 MB). Dominated. |
| TernaryCLIP ViT-B/16 (Q-ALL) | LAMDA, Nanjing Univ. | ~86 | ~63 | 224; ViT-B/16, ternary weights | ~572 | ~17.6 | 53.3 | MIT | `hf-hub:zhangsq-nju/TernaryCLIP_ViT-B-16` (gated, auto-approved) | The size win (tq1_0 ~37 MB for both towers) needs GGML. LiteRT has no ternary kernels. |
| UForm3 english-base | Unum Cloud | 86.0 | 56.8 (~52 used) | 224; ViT-B/16 | ~572 | ~17.6 | n/r | Apache-2.0 | HF `unum-cloud/uform3-image-text-english-base` | Flickr T→I R@1 72.7 (possibly inherited from uform-vl). |
| UForm3 multilingual-base | Unum Cloud | 86.0 | 120.1 (~110 used; 96 emb) | 224; ViT-B/16 | ~572 | ~17.6 | n/r | Apache-2.0 | HF `unum-cloud/uform3-image-text-multilingual-base` | 21 languages. Its card evaluations used the reranker. |
| LINE clip-japanese-base-v2 | LY Corp | 86.07 | 110.2 | 224; EVA02-B/16 (RoPE) | ~572 | ~17.6 | 66.6 (Japanese prompts) | Apache-2.0 | HF `line-corporation/clip-japanese-base-v2` | Japanese-only text. Community ONNX exists. |
| OpenCLIP ViT-B-16 datacomp_xl_s13b_b90k | LAION / mlfoundations | 86.19 | 63.43 | 224; ViT-B/16 | ~572 | ~17.6 | 73.5 | MIT | `('ViT-B-16','datacomp_xl_s13b_b90k')` | Card advisory: "deployed use out of scope". |
| OpenCLIP ViT-B-16 laion2b_s34b_b88k | LAION | 86.19 | 63.43 | 224; ViT-B/16 | ~572 | ~17.6 | 70.2 | MIT | `('ViT-B-16','laion2b_s34b_b88k')` | LAION-5B provenance (pulled 2023, replaced by Re-LAION). |
| OpenCLIP ViT-B-16 laion400m_e32 | LAION | 86.19 | 63.43 | 224; ViT-B/16 | ~572 | ~17.6 | 67.1 | MIT | `('ViT-B-16','laion400m_e32')` | iPhone 12 Pro Max: 11.5 ms (MobileCLIP paper, Table 7). |
| OpenCLIP ViT-B-16 datacomp_l_s1b_b8k | DataComp | 86.19 | 63.43 | 224; ViT-B/16 | ~572 | ~17.6 | 63.1 | MIT | `('ViT-B-16','datacomp_l_s1b_b8k')` | Dominated. |
| HQ-CLIP ViT-B/16 | USTC + Tencent | 86.19 | 63.43 | 224; OpenAI-style B/16 | ~572 | ~17.6 | 70.6 | Apache-2.0 | `hf-hub:zhixiangwei/vlm150m-hqclip-large-vitb16` | Training images were selected with Apple's DFN index (AMLR license): a lineage caveat. |
| OpenVision B/16 | UCSC-VLAA | ~86.2 | ~54.5 | 224 (160/384 ckpts); ViT-B/16 | ~575 | ~17.7 | 73.9 (160: 72.4; 384: 74.5) | Apache-2.0 | `hf-hub:UCSC-VLAA/openvision-vit-base-patch16-160` | 160: ~289 ms, ~8.9 GMACs. BERT tokenizer, 512-d. |
| OpenVision B/8 | UCSC-VLAA | ~86.2 | ~54.5 | 224; 785 tok | ~2568 | ~79 | 75.4 | Apache-2.0 | `…/openvision-vit-base-patch8-224` | Impractical on a phone. |
| FG-CLIP base (v1) | Qihoo 360 | ~86.2 | ~63.9 | 224; ViT-B/16 | ~572 | ~17.6 | 69.0 | Apache-2.0 | HF `qihoo360/fg-clip-base` (trust_remote_code) | 248-token long text. One skeptic notes Llama-3.1-70B-generated hard negatives in training. |
| BGE-VL-base (MMRet) | BAAI | ~86.2 | ~63.4 | 224; OpenAI CLIP B/16 | ~572 | ~17.6 | n/r | MIT | HF `BAAI/BGE-VL-base` | Tuned for composed retrieval. Weights are bf16. |
| FLAIR B/16 merged30m | ExplainableML | ~86.2 | ~63.4 | 224; B/16 + text-conditioned pool | ~572 | ~17.6 | 56.6 | MIT (HF tag only; code unlicensed) | HF `xiaorui638/flair` → `flair-merged30m.pt` | Only the global path works with precomputed vectors. |
| EVA02-CLIP-B/16 | BAAI | 86.26 | 63.43 | 224; EVA02 B/16 (RoPE, SwiGLU) | ~572 | ~17.6 | 74.7 | MIT | `('EVA02-B-16','merged2b_s8b_b131k')` | Interleaved RoPE is a likely GPU-delegate partition point. |
| TIPS v1 B/14-HR | Google DeepMind | 86.3 | 109.6 | 448; ViT-B/14 | ~3507 | ~108 | 76.3 | Apache-2.0 (HF) | HF `google/tipsv1-b14` | At 224: ~764 ms, accuracy ?. |
| FLAVA full | Meta | ~86.4 | ~110 | 224; ViT-B/16 (the card's "B/32" is wrong) | ~575 | ~17.7 | n/r | BSD-3 | transformers `FlavaModel('facebook/flava-full')` | 1.43 GB checkpoint. Card advisory. ImageNet linear probe 75.5. |
| LongProLIP ViT-B/16 (SHD128M / S24M / S128M) | NAVER | 86.98 | 111.1 | 224; ViT-B/16 + UNC token | ~582 | ~17.9 | 74.5 / 70.8 / 69.5 | MIT | ProLIPHF `SanghyukChun/LongProLIP-ViT-B-16-SHD128M` | 1 of 2 skeptics rates commercial use unclear (ShareGPT4V CC-BY-NC fine-tune data; DFN index). The parent ProLIP is cleaner and better. |
| ProLIP ViT-B/16 | NAVER | 87.0 | 110.9 | 224; ViT-B/16 + UNC token | ~582 | ~17.9 | 74.6 | MIT | ProLIPHF `SanghyukChun/ProLIP-ViT-B-16-DC-1B-12_8B` | SigLIP SentencePiece tokenizer. Drop the std head. |
| OpenAI CLIP RN50x4 | OpenAI | 87.14 | 91.16 | 288; ModifiedResNet | ~692† | ~21.3 | 66.3 | MIT (repo; see footnote) | `('RN50x4','openai')` | Card advisory. Dominated. |
| ViTamin-B | JHU + ByteDance | 87.5 | 63.4 | 224; hybrid | ~709† | 21.8 (reported) | 68.9 | MIT | `('ViTamin-B','datacomp1b')` | Dominated. |
| ViTamin-B-LTT | JHU + ByteDance | 87.5 | ~123.7 | 224; hybrid | ~709† | 21.8 | 70.8 | MIT | `('ViTamin-B-LTT','datacomp1b')` | 845 MB fp32 checkpoint. |
| **DatologyAI cls-opt-vit-b-32** | DatologyAI | ~87.8 | ~63.4 | 224; stock OpenCLIP B/32, 50 tok | ~143 [Pixel 8a 40ʳ, same arch] | ~4.4 | **76.9 (self-reported)** | Apache-2.0 | `hf-hub:DatologyAI/cls-opt-vit-b-32` | Same graph and CLIP BPE tokenizer as OpenCLIP B/32, so existing ports apply. ~88 MB int8. |
| DatologyAI retr-opt-vit-b-32 | DatologyAI | ~87.8 | ~63.4 | 224; stock OpenCLIP B/32 | ~143 [Pixel 8a 40ʳ] | ~4.4 | n/r | Apache-2.0 | `hf-hub:DatologyAI/retr-opt-vit-b-32` | COCO R@1 55.5, Flickr 79.7 (direction not stated). Different embedding space from cls-opt. |
| OpenCLIP ViT-B-32 datacomp_xl_s13b_b90k | LAION / DataComp | 87.85 | 63.43 | 224; ViT-B/32 | ~143 [Pixel 8a 40ʳ] | ~4.4 | 69.2 | MIT | `('ViT-B-32','datacomp_xl_s13b_b90k')` | The HF card's 72.7% is a copy error. Community CoreML export exists. |
| OpenCLIP ViT-B-32 laion2b_e16 | LAION | 87.85 | 63.43 | 224; ViT-B/32 | ~143 [Pixel 8a 40ʳ] | ~4.4 | 65.7 | MIT | `('ViT-B-32','laion2b_e16')` | Dominated. |
| OpenCLIP ViT-B-32-quickgelu laion400m_e32 | LAION | 87.85 | 63.43 | 224; ViT-B/32 | ~143 [Pixel 8a 40ʳ] | ~4.4 | 63.0 (corrected) | MIT | `('ViT-B-32-quickgelu','laion400m_e32')` | Must use QuickGELU. |
| OpenCLIP roberta-ViT-B-32 | LAION | 87.85 | 124.87 | 224; B/32 + roberta-base | ~143 | ~4.4 | 61.7 | MIT | `('roberta-ViT-B-32','laion2b_s12b_b32k')` | Dominated. |
| OpenCLIP xlm-roberta-base-ViT-B-32 | LAION | 87.85 | 278.27 | 224; B/32 + XLM-R | ~143 | ~4.4 | 62.3 | MIT | `('xlm-roberta-base-ViT-B-32','laion5b_s13b_b90k')` | Multilingual. 250k vocab makes the text tower huge. |
| **OpenCLIP ViT-B-32-256 datacomp_s34b_b86k** | LAION / DataComp | 87.86 | 63.43 | 256; ViT-B/32, 65 tok | ~187 | ~5.75 | 72.8 | MIT | `('ViT-B-32-256','datacomp_s34b_b86k')` | RedHat int8 ONNX scores 71.1%. Card advisory. |
| OpenCLIP ConvNeXt-Base laion400m | LAION | 88.09 | 63.43 | 224; ConvNeXt-B | ~501† | ~15.4 | 66.3 | MIT | `('convnext_base','laion400m_s13b_b51k')` | Dominated. |
| OpenCLIP ConvNeXt-Base-W augreg | LAION | 88.22 | 91.16 | 256; ConvNeXt-B (wide text) | ~653† | ~20.1 | 71.5 | MIT | `('convnext_base_w','laion2b_s13b_b82k_augreg')` | Dominated. |
| OpenCLIP CoCa ViT-B/32 | LAION | 89.16 | 63.43 | 224; B/32 + attentional pooler | ~150 | ~4.6 | 63.3 | MIT | `('coca_ViT-B-32','laion2b_s13b_b90k')` | Pickle checkpoint only. The legacy text-mask quirk must be reproduced. |
| SigLIP2 B/16 | Google | 92.88 | 282.3 (196.6 emb) | 224 (also 256, NaFlex); ViT-B/16 + MAP | ~572 [Pixel 8a: 60 CompiledModel / 964 classic GPU / 313 XNNPACK ʳ; Galaxy S26 GPU 13.7ʳ] | ~17.6 | 78.2 (256: 79.1) | Apache-2.0 | HF `google/siglip2-base-patch16-224`; LiteRT `litert-community/SigLIP2-base-patch16-224` | 256: ~751 ms. On the classic delegate only 44 of 809 nodes ran on GPU. Gemma 256k tokenizer. |
| SigLIP v1 B/16 | Google | ~92.9 | ~110.3 | 224 (256/384/512); ViT-B/16 + MAP | ~572 | ~17.6 | 76.2 | Apache-2.0 | HF `google/siglip-base-patch16-224` | 32k vocab, so text is ~110 MB int8 vs ~282 MB for v2. Xenova ONNX exists. |
| nomic-embed-vision-v1.5 + text-v1.5 | Nomic AI | 92.9 | 136.7 | 224; EVA02-style B/16 | ~569 | ~17.5 | 71.0 | Apache-2.0 (pin revision ≥ 351ebb2; earlier ones were CC-BY-NC) | HF `nomic-ai/nomic-embed-vision-v1.5` | Official ONNX (int8 image 96.7 MB). Text needs the `search_query:` prefix. DFN-2B data terms ?. |
| Marqo-Ecommerce-Embeddings-B | Marqo | 92.9 | 110.3 | 224; SigLIP B/16 | ~572 | ~17.6 | n/r | Apache-2.0 (metadata tag only) | `hf-hub:Marqo/marqo-ecommerce-embeddings-B` | Tuned for products. Training data undisclosed. |
| SigLIP B/16-i18n-256 | Google | 92.93 | 277.7 | 256; ViT-B/16 | ~761 | ~23.4 | 75.1 | Apache-2.0 | `hf-hub:timm/ViT-B-16-SigLIP-i18n-256` | Multilingual. 250k vocab. |
| C-RADIOv3-B | NVIDIA | ~93 effective (98.25 stored) | 708 (borrowed SigLIP2-so400m text) | 256–2048 (preferred 512); ViT-B/16 + MLP head | ~790 @256 | ~24 | 71.3 (resolution ?) | NVIDIA Open Model License | torch.hub `NVlabs/RADIO`, `c-radio_v3-b`, adaptor `siglip2` | 224 is untested: ~604 ms. 512: ~3.5 s. Loader code is non-commercial, so reimplement it. No on-device free-text search. |
| PE-Core-B16-224 | Meta FAIR | 93.7 | ~354 (card says 0.31B) | 224; ViT-B/16 + RoPE | ~623 [Pixel 8a GPU CompiledModel 66ʳ] | ~19.2 | 78.4 | Apache-2.0 | `hf-hub:timm/PE-Core-B-16`; LiteRT `mlboydaisuke/PE-Core-base-patch16-224-LiteRT` | Existing all-GPU LiteRT export (187 MB fp16). Text tower too large for on-demand download. |
| SigLIP2 B/32@256 | Google | 94.55 | 282.3 | 256; ViT-B/32 + MAP, 64 tok | ~187 | ~5.8 | 74.0 | Apache-2.0 | HF `google/siglip2-base-patch32-256` | Split-tower ONNX: image int8 95.9 MB, text int8 283 MB. COCO T→I 47.2. |
| OpenCLIP ViT-B-16-plus-240 | LAION | 117.2 | 91.16 | 240; ViT-B/16 w896 | ~891 | ~27.4 | 69.2 | MIT | `('ViT-B-16-plus-240','laion400m_e32')` | Over the 100M ceiling. Registry bug: `laion400m_e32` actually loads e31. |

**Footnote on OpenAI CLIP.** The row researchers rated OpenAI checkpoints inconsistently: RN101 and RN50x4 as "yes", RN50, B/32 and B/16 as "unclear". They all share the same MIT repo, have no explicit grant for the weights, and carry the same model-card line ("deployed use… out of scope"). Treat every OpenAI checkpoint as the same judgement call. None of them beats current on cost per point of accuracy.

### Table 2 — Excluded

| Model | Reason |
|---|---|
| OpenCLIP ViT-B-32 laion2b_s34b_b79k | Weights are MIT, but the row stayed "unclear": the card says deployed use is out of scope, and the training set is the original LAION-5B. It is also dominated at 66.6%. |
| OpenAI CLIP RN50 / ViT-B/32 / ViT-B/16 | No explicit license for the weights (the MIT repo covers "the Software"), and the card says deployment is out of scope. One of two skeptics rated B/32 and B/16 as not holding. |
| sentence-transformers clip-ViT-B-32-multilingual-v1 | The text tower is Apache-2.0, but it must be paired with the OpenAI B/32 image tower (unclear, see above). |
| FG-CLIP 2 base | Trained on Wukong (CC BY-NC-SA, explicitly non-commercial), and the card tells users to follow dataset licenses. Both skeptics rated it not clearly commercial. |
| NLLB-CLIP base SigLIP | CC-BY-NC-4.0, inherited from NLLB-200. |
| LiT B16B / B16B_2 | No license for the weights, and the model card says any deployment is out of scope. |
| BLIP ITM base COCO | BSD-3 tag, but the card says research only and the repo is deprecated and archived. |
| COYO-ALIGN-B7 (`kakaobrain/align-base`) | The HF conversion has no license. The original TF checkpoint is Apache-2.0, but no ImageNet zero-shot is reported (KNN only). |
| CLIP-KD students (ViT-T/16, MobileViT-S, EffNet-B0, Swin-T, RN18, MNv3-S, RN50) | No license anywhere (GitHub `license=null`), so all rights reserved. |
| ALIP ViT-B/32 | The README says MIT, but the LICENSE file is missing (404) and the weights carry no license. |
| DeCLIP | BSD-2 for academic use only; commercial use requires contacting the authors. |
| Apple DFN2B-CLIP-ViT-B-16 | Apple ML Research license (AMLR): research only. |
| Apple MobileCLIP v1 (S0–B) | AMLR since 2025 (HF Feb, GitHub Aug). Whether rights granted under the older permissive license survive the relicense is legally unclear. |
| Apple MobileCLIP2 (S0–L-14) | AMLR; also covers derivatives such as TFLite conversions. |
| Apple TiC-CLIP | AMLR. |
| Apple VeCLIP | Apple sample-code "personal" license with no patent grant and no coverage of weights. Unclear (split verdicts). |
| MetaCLIP 2 distilled (S16 / M16 / B32) | CC-BY-NC-4.0. |
| TULIP B/16 | No license for the weights. Training data includes Llama-3.1 outputs, WebVid and MVImgNet (non-commercial). |
| Long-CLIP-B (and B-32) | Labelled Apache-2.0, but fine-tuned on ShareGPT4V (CC-BY-NC plus OpenAI terms). Unclear. |
| COSMOS B/16, B/32 | MIT appears only as a metadata tag; no LICENSE file, and the code is unlicensed. Unclear. |
| UniCL Swin-T / Swin-B | MIT repo but no explicit grant for the weights; trained partly on ImageNet-21K. Unclear. |
| UniCL Focal-B | Weights were never released. |
| LaCLIP B/16, B/32 | Weights deleted from Dropbox. No weights license, and the captions were rewritten by LLaMA-1. |
| Also excluded per the brief (not re-checked here) | MetaCLIP v1 (CC-BY-NC), jina-clip-v2 (NC), EmbeddingGemma 2 (740M, too large). |

### Pareto picks for this app

- **Best accuracy at or below the current image size: PE-Core-S16-384.** It has a 23.8M image tower (~25 MB int8, half of today's 46 MB) and 72.7% zero-shot, +10 points. It is Apache-2.0. The catch is 577 tokens: ~546 ms estimated at 384. Interpolated to 224 it would be ~164 ms; measured here at 224 it falls below current (ECCV R@1 74.2% vs 76.6%), and it only wins at 384. If 224 falls apart, the fallback is OpenVision S/16-224 (65.9%, ~151 ms) or S/8-160 (67.3%, ~331 ms).
- **Smallest model at about the current accuracy: PE-Core-T16-384.** It is 6.1M (~7 MB int8) at 62.1% (−0.6 pt), ~165 ms estimated. If matching the current 73 ms matters more than bytes, OpenVision S/16-160 gets 63.5% at ~74 ms estimated with half the image download. It needs a BERT tokenizer and a recompute of its 384-d vectors.
- **Best overall under ~100M: DatologyAI cls-opt-vit-b-32, if its self-reported 76.9% reproduces.** It has the stock OpenCLIP B/32 graph, CLIP BPE tokenizer, 77-token context and 512-d embedding, so the current export and text pipeline carry over. Cost is ~4.4 GMACs (~143 ms estimated) and ~88 MB int8, under Apache-2.0. The fallback is OpenCLIP ViT-B-32-256 datacomp_s34b_b86k (72.8%, MIT, ~187 ms). The highest raw accuracy, SigLIP2-B/16-256 (79.1%) or PE-Core-B16 (78.4%, existing all-GPU LiteRT export), costs ~4x the compute and comes with 282M or 354M text towers.
- **Text tower note.** Every realistic pick ships a 12-layer, 512-wide CLIP-BPE text tower of ~63.4M (25.3M of it the embedding table), about 64 MB int8 and ~3.5x today's 18M. That covers PE-Core T/S, OpenCLIP B, Datology, EVA02 and HQ-CLIP. Avoid SigLIP/SigLIP2-i18n (250–256k vocab, ~280M), PE-Core-B (~354M), C-RADIO (708M) and the ViTamin-LTT variants (~124M). The smallest decent towers are OpenVision S (33.8M, BERT) and ViTamin-S (40.4M, CLIP BPE). Pruning the vocabulary to the tokens actually used can cut most of the embedding table. Any swap means recomputing the ~3,600 concept vectors and the fixed phrases.

### Unknowns to measure ourselves

1. **Runtime path.** The same SigLIP2-B/16 graph on a Pixel 8a takes 60 ms with LiteRT CompiledModel, 964 ms with the classic GPU delegate (only 44 of 809 nodes on GPU), and 313 ms with XNNPACK. The 32.5 ms/GMAC calibration comes from 50-token TinyCLIP graphs on the classic delegate. Measure on the A54 whether 577-token, RoPE or MAP-head graphs fall off the GPU, and whether CompiledModel also speeds up the current model.
2. **PE-Core T/S (and TIPS S/14) at 224/256** with interpolated position embeddings and RoPE: zero-shot accuracy on our 4.7k-image subset. No source reports it.
3. **DatologyAI cls-opt's self-reported 76.9%** (independently confirmed only on its own card): reproduce it locally, and compare cls-opt with retr-opt on free-text search.
4. **int8 accuracy loss per candidate.** The only data points are RedHat's B/32-256 int8 (71.1 vs 72.8) and Arm's B/32 dynamic int8 (CIFAR-100 61.6 vs 60.7).
5. **Retrieval quality on real personal-photo queries**, and text-tower size after vocabulary pruning. No candidate reports either.

### Sources

**TinyCLIP**
- https://github.com/wkcn/TinyCLIP
- https://raw.githubusercontent.com/wkcn/TinyCLIP/main/LICENSE
- https://github.com/microsoft/Cream/tree/main/TinyCLIP
- https://github.com/wkcn/TinyCLIP-model-zoo/releases/tag/checkpoints
- https://arxiv.org/abs/2309.12314
- https://huggingface.co/wkcn/TinyCLIP-ViT-39M-16-Text-19M-YFCC15M
- https://huggingface.co/wkcn/TinyCLIP-ViT-61M-32-Text-29M-LAION400M
- https://huggingface.co/wkcn/TinyCLIP-ViT-40M-32-Text-19M-LAION400M
- https://huggingface.co/wkcn/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M
- https://huggingface.co/timm/vit_medium_patch16_clip_224.tinyclip_yfcc15m
- https://huggingface.co/onnx-community/TinyCLIP-ViT-39M-16-Text-19M-YFCC15M-ONNX
- https://huggingface.co/onnx-community/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M-ONNX
- https://arxiv.org/abs/2311.17049

**Perception Encoder (PE-Core)**
- https://github.com/facebookresearch/perception_models
- https://raw.githubusercontent.com/facebookresearch/perception_models/main/apps/pe/README.md
- https://raw.githubusercontent.com/facebookresearch/perception_models/main/LICENSE.PE
- https://huggingface.co/facebook/PE-Core-T16-384
- https://huggingface.co/facebook/PE-Core-S16-384
- https://huggingface.co/facebook/PE-Core-B16-224
- https://huggingface.co/timm/PE-Core-T-16-384
- https://huggingface.co/timm/PE-Core-S-16-384
- https://huggingface.co/timm/PE-Core-B-16
- https://huggingface.co/mlboydaisuke/PE-Core-base-patch16-224-LiteRT
- https://arxiv.org/abs/2504.13181

**TIPS**
- https://github.com/google-deepmind/tips
- https://huggingface.co/google/tipsv1-s14
- https://huggingface.co/google/tipsv1-b14
- https://huggingface.co/google/tipsv2-b14
- https://huggingface.co/litert-community/TIPSv2-B14-DPT-LiteRT
- https://arxiv.org/abs/2410.16512
- https://arxiv.org/abs/2604.12012

**OpenVision**
- https://github.com/UCSC-VLAA/OpenVision
- https://huggingface.co/UCSC-VLAA/openvision-vit-tiny-patch16-224
- https://huggingface.co/UCSC-VLAA/openvision-vit-tiny-patch8-224
- https://huggingface.co/UCSC-VLAA/openvision-vit-small-patch16-224
- https://huggingface.co/UCSC-VLAA/openvision-vit-small-patch8-224
- https://huggingface.co/UCSC-VLAA/openvision-vit-base-patch16-224
- https://huggingface.co/UCSC-VLAA/openvision-vit-base-patch8-224
- https://arxiv.org/abs/2505.04601
- https://huggingface.co/datasets/UCSC-VLAA/Recap-DataComp-1B

**ViTamin**
- https://github.com/Beckschen/ViTamin
- https://huggingface.co/jienengchen/ViTamin-S
- https://huggingface.co/jienengchen/ViTamin-S-LTT
- https://huggingface.co/jienengchen/ViTamin-B
- https://huggingface.co/jienengchen/ViTamin-B-LTT
- https://arxiv.org/abs/2404.02132

**DatologyAI**
- https://huggingface.co/DatologyAI/cls-opt-vit-b-32
- https://huggingface.co/DatologyAI/retr-opt-vit-b-32
- https://www.datologyai.com/blog/clip-gets-a-data-upgrade-outperforming-sota-with-improved-data-curation-only

**SigLIP / SigLIP2**
- https://huggingface.co/google/siglip2-base-patch32-256
- https://huggingface.co/google/siglip2-base-patch16-224
- https://huggingface.co/google/siglip-base-patch16-224
- https://huggingface.co/timm/ViT-B-16-SigLIP-i18n-256
- https://github.com/google-research/big_vision
- https://github.com/google-research/big_vision/blob/main/big_vision/configs/proj/image_text/README_siglip2.md
- https://arxiv.org/abs/2502.14786
- https://arxiv.org/abs/2303.15343
- https://huggingface.co/litert-community/SigLIP2-base-patch16-224
- https://huggingface.co/onnx-community/siglip2-base-patch32-256-ONNX
- https://huggingface.co/qualcomm/SigLIP2

**OpenCLIP**
- https://github.com/mlfoundations/open_clip
- https://raw.githubusercontent.com/mlfoundations/open_clip/main/LICENSE
- https://raw.githubusercontent.com/mlfoundations/open_clip/main/docs/openclip_results.csv
- https://raw.githubusercontent.com/mlfoundations/open_clip/main/docs/model_profile.csv
- https://raw.githubusercontent.com/mlfoundations/open_clip/main/docs/openclip_retrieval_results.csv
- https://raw.githubusercontent.com/mlfoundations/open_clip/main/docs/PRETRAINED.md
- https://raw.githubusercontent.com/mlfoundations/open_clip/main/docs/datacomp_models.md
- https://raw.githubusercontent.com/mlfoundations/open_clip/main/src/open_clip/pretrained.py
- https://huggingface.co/laion/CLIP-ViT-B-32-256x256-DataComp-s34B-b86K
- https://huggingface.co/laion/CLIP-ViT-B-32-DataComp.XL-s13B-b90K
- https://huggingface.co/laion/CLIP-ViT-B-16-DataComp.XL-s13B-b90K
- https://huggingface.co/laion/CLIP-ViT-B-16-DataComp.L-s1B-b8K
- https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K
- https://huggingface.co/laion/CLIP-ViT-B-16-laion2B-s34B-b88K
- https://huggingface.co/timm/vit_base_patch32_clip_224.laion2b_e16
- https://huggingface.co/timm/vit_base_patch16_clip_224.laion400m_e32
- https://huggingface.co/timm/vit_base_patch32_clip_224.laion400m_e32
- https://huggingface.co/laion/CLIP-convnext_base-laion400M-s13B-b51K
- https://huggingface.co/laion/CLIP-convnext_base_w-laion2B-s13B-b82K-augreg
- https://huggingface.co/timm/vit_base_patch16_plus_clip_240.laion400m_e32
- https://huggingface.co/laion/CLIP-ViT-B-32-xlm-roberta-base-laion5B-s13B-b90k
- https://huggingface.co/laion/CLIP-ViT-B-32-roberta-base-laion2B-s12B-b32k
- https://huggingface.co/laion/CoCa-ViT-B-32-laion2B-s13B-b90k
- https://huggingface.co/timm/resnet50_clip.cc12m
- https://huggingface.co/mlboydaisuke/clip-vit-b32-litert
- https://huggingface.co/mlboydaisuke/CLIP-ViT-B32-ExecuTorch
- https://huggingface.co/RedHatAI/CLIP-ViT-B-32-256x256-DataComp-s34B-b86K-quant-ds
- https://arxiv.org/abs/2304.14108
- https://huggingface.co/datasets/mlfoundations/datacomp_1b

**EVA-CLIP**
- https://github.com/baaivision/EVA
- https://huggingface.co/QuanSun/EVA-CLIP
- https://huggingface.co/timm/eva02_base_patch16_clip_224.merged2b_s8b_b131k

**OpenAI CLIP**
- https://github.com/openai/CLIP
- https://github.com/openai/CLIP/blob/main/model-card.md
- https://huggingface.co/openai/clip-vit-base-patch32
- https://huggingface.co/openai/clip-vit-base-patch16
- https://huggingface.co/timm/resnet101_clip.openai
- https://huggingface.co/timm/resnet50x4_clip.openai
- https://huggingface.co/timm/resnet50_clip.openai
- https://huggingface.co/qualcomm/OpenAI-Clip

**Embedding models: Nomic, Jina, UForm**
- https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5
- https://huggingface.co/nomic-ai/nomic-embed-text-v1.5
- https://arxiv.org/abs/2406.18587
- https://huggingface.co/jinaai/jina-clip-v1
- https://huggingface.co/jinaai/jina-clip-implementation
- https://arxiv.org/abs/2405.20204
- https://github.com/unum-cloud/uform
- https://huggingface.co/unum-cloud/uform3-image-text-english-small
- https://huggingface.co/unum-cloud/uform3-image-text-english-base
- https://huggingface.co/unum-cloud/uform3-image-text-multilingual-base

**FG-CLIP**
- https://huggingface.co/qihoo360/fg-clip-base
- https://huggingface.co/qihoo360/fg-clip2-base
- https://github.com/360CVGroup/FG-CLIP
- https://arxiv.org/abs/2505.05071
- https://arxiv.org/abs/2510.10921
- https://arxiv.org/abs/2202.06767

**Excluded or minor candidates**
- https://huggingface.co/sentence-transformers/clip-ViT-B-32-multilingual-v1
- https://huggingface.co/visheratin/nllb-clip-base-siglip
- https://github.com/google-research/vision_transformer/blob/main/model_cards/lit.md
- https://huggingface.co/Salesforce/blip-itm-base-coco
- https://github.com/salesforce/BLIP
- https://huggingface.co/kakaobrain/align-base
- https://huggingface.co/kakaobrain/coyo-align-b7-base
- https://github.com/kakaobrain/coyo-align
- https://huggingface.co/zhangsq-nju/TernaryCLIP_ViT-B-16
- https://github.com/zhangsq-nju/TernaryCLIP
- https://arxiv.org/abs/2510.21879
- https://github.com/winycg/CLIP-KD
- https://arxiv.org/abs/2307.12732
- https://github.com/facebookresearch/SLIP
- https://arxiv.org/abs/2112.12750
- https://github.com/deepglint/ALIP
- https://github.com/deepglint/RWKV-CLIP
- https://huggingface.co/Kaichengalex/RWKV-CLIP-B32-YFCC15M
- https://arxiv.org/abs/2406.06973
- https://github.com/Sense-GVT/DeCLIP

**Apple models**
- https://huggingface.co/apple/DFN2B-CLIP-ViT-B-16
- https://github.com/apple/ml-mobileclip
- https://raw.githubusercontent.com/apple/ml-mobileclip/main/LICENSE_MODELS
- https://huggingface.co/apple/MobileCLIP-S2
- https://huggingface.co/apple/MobileCLIP2-S0
- https://arxiv.org/abs/2508.20691
- https://huggingface.co/apple/TiC-CLIP-basic-oracle
- https://github.com/apple/ml-veclip

**MetaCLIP 2, TULIP, HQ-CLIP**
- https://huggingface.co/facebook/metaclip-2-worldwide-s16
- https://github.com/facebookresearch/MetaCLIP
- https://github.com/tulip-berkeley/open_clip
- https://arxiv.org/abs/2503.15485
- https://huggingface.co/zhixiangwei/vlm150m-hqclip-large-vitb16
- https://github.com/w1oves/hqclip
- https://arxiv.org/abs/2507.22431
- https://huggingface.co/datasets/apf1/datafilteringnetworks_2b

**NVIDIA C-RADIO**
- https://huggingface.co/nvidia/C-RADIOv3-B
- https://huggingface.co/nvidia/C-RADIOv4-H
- https://github.com/NVlabs/RADIO
- https://developer.download.nvidia.com/licenses/nvidia-open-model-license-agreement-june-2024.pdf
- https://arxiv.org/abs/2601.17237

**Long-CLIP, COSMOS, UniCL, FLAVA**
- https://github.com/beichenzbc/Long-CLIP
- https://huggingface.co/BeichenZhang/LongCLIP-B
- https://huggingface.co/datasets/Lin-Chen/ShareGPT4V
- https://huggingface.co/sankim2/cosmos
- https://github.com/ExplainableML/cosmos
- https://github.com/microsoft/UniCL
- https://huggingface.co/facebook/flava-full
- https://github.com/facebookresearch/multimodal

**Chinese-CLIP, LINE, ProLIP**
- https://huggingface.co/OFA-Sys/chinese-clip-rn50
- https://github.com/OFA-Sys/Chinese-CLIP
- https://huggingface.co/line-corporation/clip-japanese-base-v2
- https://huggingface.co/SanghyukChun/ProLIP-ViT-B-16-DC-1B-12_8B
- https://huggingface.co/SanghyukChun/LongProLIP-ViT-B-16-SHD128M
- https://github.com/naver-ai/prolip
- https://arxiv.org/abs/2410.18857
- https://arxiv.org/abs/2503.08048

**LaCLIP, BGE-VL, FLAIR, ALBEF, Marqo**
- https://github.com/LijieFan/LaCLIP
- https://huggingface.co/BAAI/BGE-VL-base
- https://github.com/VectorSpaceLab/MegaPairs
- https://huggingface.co/xiaorui638/flair
- https://github.com/ExplainableML/flair
- https://github.com/salesforce/ALBEF
- https://arxiv.org/abs/2107.07651
- https://huggingface.co/Marqo/marqo-ecommerce-embeddings-B
- https://huggingface.co/Marqo/marqo-fashionSigLIP