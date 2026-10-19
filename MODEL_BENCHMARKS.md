# On-device model benchmarks

Measured 2026-10-18 on a Samsung Galaxy A54 (Android, ONNX Runtime CPU) for the stories index.

## Image models

- **Search:** share of text searches whose top photo is correct (ECCV R@1, see [Photo search](#photo-search-text--photo)). Closest to real app use.
- **ImageNet:** top-1 on a 4,660-image val subset (every 7th image of shard 0, plus the first part of shards 1–7), one prompt `a photo of a {class}.`, int8 models, run on PC.
- **Phone timings:** Stories debug → **TinyCLIP index bench**. 64 random photos, batches of 16, parallel decode, CPU EP.
  - *Model* = vision tower only.
  - *Total* = asset info + decode + model + concept lookup, per photo.
  - Ranges come from separate runs; differences under ~8 ms are run-to-run noise.

| Model | Search | ImageNet | Vision file | PC ms/img | Phone model ms | Phone total ms/photo | Status |
|---|---|---|---|---|---|---|---|
| **TinyCLIP 45M (LAION+YFCC), int8** | **76.4%** | **61.4%** | 58 MB | 12.3 | 67–73 | 98–103 | **Shipped** |
| TinyCLIP 45M (LAION), int8 | — | 59.6% | 58 MB | 13.2 | 73 | 103 | Same speed, lower accuracy |
| TinyCLIP 40M, int8 | 72.4%¹ | 57.5% | 50 MB | 10.3 | 52–64 | 79–102 | Shipped before 2026-10-18, in bench |
| TinyCLIP 40M, fp32 | 72.4% | ~57.5% | 159 MB | — | 48–51 | 77–79 | No faster in practice, 3× the size |
| TinyCLIP 22M, int8 | 67.2%¹ | 52.0% | 29 MB | 6.3 | 32–38 | 63–71 | Fastest, in bench |
| TinyCLIP 8M/16, int8 | — | 41.1% | 12 MB | 9.9 | — | — | Rejected: no faster than 40M on PC, much worse |
| ML Kit image labeling | — (labels only, no text search) | — | Play services | — | — | 95–129 (median) | Bench only |
| Gemma 4 E2B, describe 1 photo | — (writes text) | — | 2.6 GB | — | — | ~16,100 | Bench only, far too slow to index |

¹ Measured in fp32; int8 differs by ≤ 0.2 points (checked on the 45M).

Decode (~25 ms/photo) is a fixed cost, so a smaller model shortens indexing by less than its model-time gain.

## Photo search (text → photo)

Closer to the app than ImageNet: type a description, find the photo. COCO 5k test (Karpathy split), 5,000 everyday Flickr photos. Run on PC with `scripts/eval_retrieval.py`.

- **COCO R@K:** 25,000 human captions. A hit means the caption's own photo is in the top K. This undercounts, because "a dog on a beach" fits many photos but only one counts as correct.
- **ECCV Caption** (Chun et al., ECCV 2022): 1,332 of those captions, with every matching photo checked by humans (8.5 per caption on average). This is the better ground truth.
  - *mAP@R* rewards ranking all true matches first.
  - *ECCV R@1* is the share of searches whose top photo is a true match: what a user sees first.

| Model | Top hit correct (ECCV R@1) | All matches ranked first (ECCV mAP@R) | Own photo #1 (COCO R@1) | Own photo in top 5 (R@5) | Own photo in top 10 (R@10) |
|---|---|---|---|---|---|
| **TinyCLIP 45M (shipped)** | **76.6%** | **36.4** | **37.0%** | **62.8%** | **73.2%** |
| TinyCLIP 45M, int8 ONNX (the exact phone file) | 76.4% | 36.4 | 36.9% | 62.6% | 73.1% |
| TinyCLIP 40M (old) | 72.4% | 34.8 | 33.3% | 59.1% | 69.9% |
| TinyCLIP 22M | 67.2% | 30.8 | 28.3% | 53.2% | 64.4% |

Rows are fp32 unless marked; int8 costs ≤ 0.2 points. Queries are the raw caption text, as the app sends them.

## Runtime settings (shipped 45M)

| Setting | Total ms/photo | Model ms |
|---|---|---|
| **LiteRT GPU + LiteRT CPU dynamic int8 (dw8) helping, 128 per call (shipped)** | **36–51, median ~40** (~90k photos/h) | 31–43 (GPU busy); CPU took 48–99 of 256 |
| LiteRT GPU + ORT CPU helping, 128 photos per call (shipped before dw8; ORT helps if XNNPACK fails to load) | 52 (~69k photos/h) | 47 (GPU busy) |
| LiteRT CPU dynamic int8 (dw8) alone, XNNPACK 4 threads | 48–58 | 43–52 (20 with serial decode) |
| Same, 64 per call | 59 | 50 |
| Same, 32 per call | 62 (51 on a cooler phone) | 51 |
| Same, 16 per call | 67 | 51 |
| LiteRT GPU only (Mali-G68, OpenCL), fp16 weights, decode pipelined | 66–70 | 53–55 |
| Parallel decode, ORT CPU EP (shipped before the GPU; still the fallback) | 95 | 66 |
| Serial decode, CPU EP | 138 | 61 |
| Parallel decode, XNNPACK EP | 240 | 209 |
| MediaStore thumbnails instead of full decode | decode 83 → 23–47 ms | top concept changed for ~40% of photos: not used |

Thread and core tests (2026-10-19, 128 photos, wall time per photo; the shipped config scored 88–92 in the same runs). None beat it, so the code was removed.

| Setting | Wall ms/photo | Why |
|---|---|---|
| 6 model threads | 106 | Threads 5+ land on the little cores and the run waits for the slowest |
| 8 model threads | 110 | Same |
| Pipelined: next batch decodes while the model runs | 90 | Decode and model compete for the same cores |
| Pipelined, decode pinned to little cores (cpu0–3), model to big (cpu4–7) | 92 | Little cores decode ~4× slower (90 vs 23 ms/photo), so decode becomes the bottleneck; model also slows 60 → 75 ms |
| Same, ORT spinning off | 103 | Spinning off adds wake-up latency |

GPU tests (2026-10-19, 64 photos, LiteRT 2.3 CompiledModel; vs ORT CPU: cosine ≥ 0.998, same top concept 100%):

| Setting | Result |
|---|---|
| fp32 weights (180 MB) | 68 ms/photo: no faster than fp16 (90 MB), so fp16 ships |
| int8 weights (46 MB) | Doesn't compile on the GPU delegate |
| fp32 GPU math | 93 ms/photo, no accuracy gain |
| Batch > 1 | GPU delegate fails ("Unrecognized Write selector") for every graph layout tried |
| Load | 3.4 s first compile, 0.5 s with the program cache |
| LiteRT CPU (XNNPACK, 4 threads), fp16 weights | 120 ms/photo: slower than ORT (int8 dw8: see below) |
| NNAPI (ORT EP) | 289–299 ms/photo: falls back to nnapi-reference; the NPU-only compile hangs |

The GPU delegate also rejects 3D concatenation, rank-mismatched broadcasts and L2_NORMALIZATION, so `build_assets.py gpu` rewrites the forward pass (same weights) and Kotlin normalizes.

GPU + CPU (2026-10-19, 64 photos): photos decode on 4 CPU threads while the GPU embeds them front to back. Once all are decoded, ORT on the CPU takes photos from the back until the two meet. The CPU took 10–12 of 64 photos; cosine vs ORT CPU ≥ 0.997, same top concept 98–100%. Bigger calls help because each call's tail (GPU waiting on the last decodes) is amortized over more photos. Batch sizes were compared on 256 photos in one run (2026-10-19); modes run in a fixed order, so later ones run on a hotter phone, and 128 still won. Its input buffer is 128 × 600 KB = 77 MB.

dw8 (2026-10-19, 256 photos per mode, 4 runs; GPU + ORT scored 48–56 in the same runs): `vision_dw8.tflite` (`build_assets.py gpu`), int8 weights with fp32 math (ai-edge-quantizer dynamic_wi8_afp32, 46 MB). `benchmark_model` runs it in 16–18 ms on XNNPACK, but in the app it takes 43–52 ms because decode threads share the 4 big cores. Decoding the whole call first cut model time to 28 ms but lost the overlap: 58 ms/photo vs 48 pipelined, so it was dropped. As the CPU helper it takes 2–3× as many photos as ORT. Accuracy vs ORT int8: top concept same 93% (hybrid) and 85–89% (dw8 alone) vs 96–97% for GPU + ORT; cosine min 0.958–0.988. dw8 costs 0.2 points of COCO R@1 (`scripts/.cache/npu/NOTES.md`).

NPU (Exynos 1380): not usable. Samsung's NNAPI driver rejects TRANSPOSE and LayerNorm, which are in every CLIP block. The ops it does accept run on the Mali GPU, not the NPU. LiteRT's Samsung NPU path supports only Exynos 2500/2600, and Samsung's own SDK is closed to third parties. Details: `scripts/.cache/npu/NOTES.md`.

Full reindex (2026-10-19, GPU + dw8, 3,957 photos, on the charger, starting cool): 172 s from the home screen (44 ms/photo, with story rebuilds running). Camera photos took 51 ms each and the smaller chat images 39 ms. Per batch: embed + concepts 47–53 ms/photo, DB writes 3–7, waiting on asset info (GPS) ~0, so reading GPS natively would save nothing. Thermal status reached 1–2 (light to moderate) with no clear slowdown. The same reindex from Stories debug ran at 64 ms/photo. A story rebuild takes ~2.2 s at 4k photos (DB load ~1 s); trips + topics scale near-linearly (PC: 70 ms at 4k, 100 ms at 32k). Listing 4k photos takes 1.1 s. Before the GPU: 7.6 min (116 ms/photo).

## Reproducing

1. Shipped model: `.venv/bin/python scripts/build_assets.py clip gpu vocab`
2. Bench-only models: `.venv/bin/python scripts/build_assets.py bench`
3. Push them with the adb commands that step 2 prints.
4. Phone: Settings → Stories debug → **TinyCLIP index bench**. A model whose file wasn't pushed shows "skipped".
5. Photo search table: `.venv/bin/python scripts/eval_retrieval.py` (downloads ~830 MB once; ~15 min on CPU).
