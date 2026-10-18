# On-device model benchmarks

Measured 2026-10-18 on a Samsung Galaxy A54 (Android, ONNX Runtime CPU) for the stories index.

## Image models

- **Accuracy:** ImageNet top-1 on a 4,660-image val subset (every 7th image of shard 0, plus the first part of shards 1–7), one prompt `a photo of a {class}.`, int8 models, run on PC.
- **Phone timings:** Stories debug → **TinyCLIP index bench**. 64 random photos, batches of 16, parallel decode, CPU EP.
  - *Model* = vision tower only.
  - *Total* = asset info + decode + model + concept lookup, per photo.
  - Ranges come from separate runs; differences under ~8 ms are run-to-run noise.

| Model | Accuracy | Vision file | PC ms/img | Phone model ms | Phone total ms/photo | Status |
|---|---|---|---|---|---|---|
| **TinyCLIP 45M (LAION+YFCC), int8** | **61.4%** | 58 MB | 12.3 | 67–73 | 98–103 | **Shipped** |
| TinyCLIP 45M (LAION), int8 | 59.6% | 58 MB | 13.2 | 73 | 103 | Same speed, lower accuracy |
| TinyCLIP 40M, int8 | 57.5% | 50 MB | 10.3 | 52–64 | 79–102 | Shipped before 2026-10-18, in bench |
| TinyCLIP 40M, fp32 | ~57.5% | 159 MB | — | 48–51 | 77–79 | No faster in practice, 3× the size |
| TinyCLIP 22M, int8 | 52.0% | 29 MB | 6.3 | 32–38 | 63–71 | Fastest, in bench |
| TinyCLIP 8M/16, int8 | 41.1% | 12 MB | 9.9 | — | — | Rejected: no faster than 40M on PC, much worse |
| ML Kit image labeling | — (labels only, no text search) | Play services | — | — | 95–129 (median) | Bench only |
| Gemma 4 E2B, describe 1 photo | — (writes text) | 2.6 GB | — | — | ~16,100 | Bench only, far too slow to index |

Decode (~25 ms/photo) is a fixed cost, so a smaller model shortens indexing by less than its model-time gain.

## Runtime settings (shipped 45M)

| Setting | Total ms/photo | Model ms |
|---|---|---|
| Parallel decode, CPU EP (shipped) | 98 | 67 |
| Serial decode, CPU EP | 138 | 61 |
| Parallel decode, XNNPACK EP | 240 | 209 |
| MediaStore thumbnails instead of full decode | decode 83 → 23–47 ms | top concept changed for ~40% of photos: not used |

Full reindex of 3,942 photos with the 45M took 7.6 min (116 ms/photo, with the app UI running).

## Reproducing

1. Shipped model: `.venv/bin/python scripts/build_assets.py clip vocab`
2. Bench-only models: `.venv/bin/python scripts/build_assets.py bench`
3. Push them with the adb commands that step 2 prints.
4. Phone: Settings → Stories debug → **TinyCLIP index bench**. A model whose file wasn't pushed shows "skipped".
