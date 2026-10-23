# Distilled image tower (MobileCLIP-style recipe, our own teacher)

Goal: an image tower faster and/or better than TinyCLIP-45M/32 (73 ms on the A54, VIST search R@1 43.0), every
weight commercially usable. MobileCLIP's *weights* are research-only (AMLR); its *method* (multi-crop teacher
embeddings stored once, student trained against them) is public and is what we copy.

## Picks
- **Teacher:** PE-Core-L14-336 (Apache-2.0), pending a VIST-val bake-off vs SigLIP2-So400m-384 (Apache-2.0) and
  OpenCLIP L/14 DataComp-XL (MIT). Runs offline only, so its size doesn't matter. Concept vectors come from its text tower,
  offline; its 1024-d space is PCA'd to 512 so the app's vectors keep their size.
- **Student image:** timm MobileNetV4-Conv-Medium (Apache-2.0, ImageNet-12k init) + linear head -> 512. Conv-only for the
  Mali GPU delegate. Fallback: Conv-Large. Speed measured on the A54 with untrained weights before training.
- **Student text:** TinyCLIP-45M's text tower (MIT) + new projection, trained to the teacher's text space.

## Training
1. Data: Open Images V4 train (all CC BY 2.0) from the public S3 mirror, 288 px shortest side (`fetch_oi.py`).
   Pilot 100k photos; full run ~1.2M.
2. Teacher embeddings once per photo for 5 augmented crops (crop params stored with them): no teacher at train time.
3. Image loss: cosine to the teacher embedding of the same crop + KL to the teacher's softmax over a text bank
   (the app's 3,566 concept prompts + ~100k captions).
4. Text loss: cosine to teacher text embeddings on ~3M captions + KL vs a bank of teacher image embeddings.
5. Export: the existing int8 LiteRT path; parity cosine >= 0.99 vs torch; real ms on the A54.

## Evaluation (no overfitting)
- Train: Open Images. Tune: VIST val + COCO Karpathy val (look freely). Test (locked): VIST test 5 GB subset +
  COCO 5k / ECCV, run only on finalists, every look logged in `CLIP_ALTERNATIVES.md`.
- Leakage: drop training photos with teacher cosine > 0.95 to any test photo; no VIST/COCO-test text in text training.
- Ship rule (fixed in advance): test search R@1 CI lower bound >= -1 at <= 60% of today's ms, or CI > 0 at <= today's ms.
- Training on the app's own concept vocab is the product, not leakage (tag metric uses Flickr tags).

## Log
Code version per run: everything through `pilot_m700k_lr1e-4` ran on v1 (`git show distill-v1:research/distill/train.py`).
From `pilot_m100k_v2` on, each entry names its version (v2 = tag `distill-v2`) and any non-default knobs (KL_W / REL_W / PCA_TXT).
- 2026-10-22: untrained MNV4-S/M/L exported for the bench (`export_speed.py`; 3.8M / 9.7M / 32M params). Pilot
  download started.
- 2026-10-22: teacher bake-off on VIST val (2,284 photos, 1,929 queries), R@1 / album / tags / curation:
  tc45 42.1 / 65.1 / 36.1 / 34.4; PE-Core-L/336 57.2 / 72.3 / 42.0 / 33.2; SigLIP2-SO400M/384 57.3 / 74.0 / 38.8 / 35.8;
  OpenCLIP L/14 DataComp 49.8 / 68.9 / 38.4 / 34.9. PE-L and SigLIP2 tie on search (+15, CI [+12.8, +17.4]); PE-L wins
  tags (+5.9 vs +2.7); curation flat for all. Teacher stays PE-Core-L. Teacher precompute started on the first ~40k photos.
- 2026-10-22: pilot `pilot_m40k` = MNV4-M, 37.5k OI photos x 5 crops, 20 epochs (15 min): VIST-val R@1 24.7 / R@5 48.1 /
  album 51.8 / tags 23.2 / curation 33.9 (tc45 42.1 / 72.7 / 65.1 / 36.1 / 34.7; teacher at 512-d PCA 57.0). Pipeline works,
  but plateaued from epoch ~12 while train KL kept falling (4.2 -> 1.7): data-bound. Next point on the scaling curve: 100k.
- 2026-10-22: A54 speed gate (TinyCLIP index bench, n=256, GPU only, ms/photo end-to-end / model only): tc45 56-57 / 48-49;
  MNV4-S 25 / 15; MNV4-M 31 / 23; MNV4-L 42 / 34. Shipped tc45 path (GPU + LiteRT CPU int8 helper) 35-37. Gate passed: M is
  ~2x faster than tc45 on GPU, and even L is faster, so L is affordable if M can't reach tc45 quality.
- 2026-10-22: `pilot_m100k` = MNV4-M, 99.7k OI photos x 5 crops, 20 epochs (25 min): VIST-val R@1 27.6 / R@5 54.6 / album 55.0 /
  tags 26.2 / curation 34.7 (vs tc45 CI [-16.9, -12.2]). 37.5k -> 100k (2.7x) bought +2.9 R@1, ~+2 per data doubling: all of
  Open Images (1.74M) extrapolates to ~36, short of tc45's 42. Data alone with this recipe won't get there; next lever: capacity (MNV4-L).
- 2026-10-22: `pilot_l100k` = MNV4-L, same 100k data/recipe (40 min): VIST-val R@1 28.6 / R@5 54.6 / album 54.8 / tags 27.7
  (M: 27.6 / 54.6 / 55.0 / 26.2). 3.5x the params buys ~+1: capacity isn't the limit, data is. Stay on MNV4-M. Fetching photos to 200k.
- 2026-10-22: `pilot_m200k` = MNV4-M, first 200k OI photos x 5 crops, 20 epochs (60 min): VIST-val R@1 31.4 / R@5 58.6 / album 56.6 /
  tags 29.2 (vs tc45 CI [-13.1, -8.3]). 100k -> 200k bought +3.8 R@1, more than the +2.9 of 37.5k -> 100k: the curve isn't flattening
  yet. At ~+3.5 per doubling, tc45's 42.1 needs ~1.6M photos, i.e. about all of Open Images. Next: 300k point to pin the slope.
- 2026-10-22: `pilot_m100k_e40` = MNV4-M, 100k photos x 40 epochs (same 15.6k steps as pilot_m200k): VIST-val R@1 27.7 / R@5 52.9 /
  album 53.2 / tags 27.4, no better than 20 epochs (27.6). Overfitting probe (student-teacher cos on crop 0, 5k trained vs 5k unseen
  OI photos): 0.772 / 0.730 at the end, gap grew steadily from 0.003; unseen OI kept rising but VIST R@1 sat at ~28 from epoch 20 on.
  So the 200k gain (31.4) is the photos, not the steps: data is the lever. Next: `pilot_m300k_e20` (294k, last 5.8k held out for the probe).
- 2026-10-22: `pilot_m300k_e20` = MNV4-M, 294k photos x 20 epochs (70 min): VIST-val R@1 33.6 / R@5 61.2 / album 58.1 / tags 29.3
  (vs tc45 CI [-10.8, -6.1]). 200k -> 294k = +2.2 R@1, ~+4 per doubling: still not flattening, tc45 still extrapolates to
  ~1.5M photos. Probe at the end 0.764 / 0.745 (gap 0.019): no harmful overfitting. VIST R@1 per epoch jumps +-1 (1.9k queries),
  peaked 34.4 at epoch 13. LR 1e-3 was never swept: next `pilot_m100k_lr3e-4` / `_lr3e-3` against pilot_m100k (27.6).
- 2026-10-22: LR sweep at 100k x 20 epochs: `pilot_m100k_lr3e-4` VIST-val R@1 29.4 vs 27.6 at 1e-3 (+1.8, about what doubling the
  data bought); probe 0.760 / 0.731, gap 0.028 (more memorization than 1e-3, but unseen still higher). 1e-3 was too high for the
  pretrained backbone. 3e-3 dropped (direction already clear); `pilot_m100k_lr1e-4` next, then 294k at the winning LR.
- 2026-10-22: `pilot_m100k_lr1e-4` VIST-val R@1 30.9 (vs 29.4 at 3e-4, 27.6 at 1e-3): lower keeps winning, +3.3 total from the LR
  alone at 100k. Probe 0.747 / 0.725, gap 0.022 (less than 3e-4). Next: `pilot_m300k_lr1e-4` (294k), then 3e-5 at 100k to find the floor.
- 2026-10-22: `pilot_m300k_lr1e-4` (294k x 20 epochs, LR 1e-4) VIST-val R@1 35.9 / R@5 63.6 / album 60.4 / tags 31.3 / curation 34.8
  (tc45 42.1 / 72.7 / 65.1 / 36.1 / 34.5; R@1 CI vs tc45 [-8.6, -3.9], was [-10.8, -6.1] at 1e-3). LR gain shrinks with data
  (+3.3 at 100k, +2.3 at 294k). At 1e-4: 100k -> 294k = +5.0, ~+3.2 per doubling, so closing the 6.2 gap by data alone needs
  ~4x (~1.2M photos). Plateau from epoch ~11 (34.8-36.2). Probe 0.772 / 0.753, gap 0.019: no overfitting. Curation already ties tc45.
- 2026-10-22: `pilot_m100k_lr3e-5` stopped at epoch 10/20: VIST-val R@1 25.8 vs 29.6 for 1e-4 at the same epoch (23.5 vs 27.9 at
  epoch 5). Too slow; 1e-4 is the LR for this recipe.
- 2026-10-23: ImageNet zero-shot (6.7k val, one prompt): pel336 86.7, tc45 63.5, tc22 52.8, pilot_m300k_lr1e-4 48.5,
  pilot_m100k_lr1e-4 44.1, pilot_m300k_e20 37.8. Same ranking as VIST, gaps magnified.
- 2026-10-23: `pilot_tc22_100k_lr3e-5` (TinyCLIP-22M image tower as init, 100k x 20 epochs) VIST-val R@1 30.1 / R@5 56.8 /
  album 56.6 / tags 30.4 / curation 33.9; ImageNet 30.3. tc22 out of the box: 34.9 / 62.6 / 60.4 / 33.8 / 33.4, ImageNet 52.8.
  Distillation at 100k DESTROYS the CLIP init (-4.8 VIST, -22.5 ImageNet) and lands where MNV4-M from IN-12k lands (30.9).
  The 100k teacher signal, not the init, sets the ceiling. tc22/tc45-init runs at LR 1e-4 not run (stopped per user).
- 2026-10-23: `pilot_m700k_lr1e-4` (MNV4-M, 658.8k OI photos x 20 epochs, LR 1e-4; 664,830 fetched, last 6k = unseen probe)
  VIST-val R@1 37.7 / R@5 66.1 / album 61.2 / tags 32.7 / curation 32.7; EMA 38.2 / 66.3 / 61.7 / 32.7 / 32.5
  (tc45 42.1 / 72.7 / 65.1 / 36.1 / 34.7). R@1 CI vs tc45 [-6.2, -1.7] for EMA (was [-8.5, -3.8] at 294k). ImageNet zero-shot
  50.8 / EMA 50.7 (294k: 48.5, tc45 63.5). 294k -> 659k (2.2x) = +2.3 R@1, ~+2 per doubling: returns shrinking, ~4 more doublings
  to tc45 by data alone. Curation fell 34.9 -> 32.7 (CI vs tc45 [-4.6, +0.2]).
  Per epoch: R@1 peaked 39.0 / EMA 39.3 at epochs 12-14, then EMA fell 5 epochs in a row to 37.9 while the probe cos kept rising
  (0.780 -> 0.787 trained, 0.768 -> 0.773 unseen, gap ~0.013): the loss (cos + KL on OI) and VIST ranking diverge late. The
  per-epoch save overwrote the best epoch: keep a best-VIST checkpoint, or ~12 epochs. Probe gap small at all points, so not
  memorization; cos 0.787 even on trained photos = student capacity / loss shape is the ceiling, not data.
  Ops: first attempt was killed at epoch 16 by systemd-oomd (training ran inside the Claude app scope; 40.8G cgroup peak from file
  cache + a 12-process VIST Pool forked twice per epoch). Fixes: VIST val pixels prepped once (PIX), `del emb` after targets, save
  every epoch, run as its own systemd user unit. PCA moved from full SVD (CUDA OOM at 660k rows) to Gram + eigh (identical basis).
- 2026-10-23: `pilot_m100k_v2` (**v2**, default knobs = v1 loss; MNV4-M, N=99,700 x 20 epochs, LR 1e-4) VIST-val R@1 30.1 / R@5 57.4 /
  album 55.0 / tags 29.2 / curation 33.4; EMA 29.9 / 56.0 / 55.4 / 28.1 / 33.0 (v1 `pilot_m100k_lr1e-4`: 30.9 / 57.9 / 54.9 / 29.4 /
  36.8). Search, album, tags within noise of v1; curation -3.4 but v1 runs alone spread 32.7-36.8 on it (128 albums), and inputs are
  bit-identical, so read as noise; re-check on the next run. Speed: 0.090 s/step after a ~75 s compile/autotune warmup (v1 0.12,
  1.33x); 16 min wall vs 25 for the same run; GPU now ~97% busy, so the data loader is no longer the limit. Resume (RESUME=1) smoke
  test continued at epoch 20 with the same probe cos (0.7473 vs 0.7474): optimizer, schedule, EMA and PCA restore correctly.
