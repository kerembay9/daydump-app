# 0002. On-device image-text index with our own distilled CLIP model

- **Status:** accepted
- **Date:** 2026-10-29 (recorded; model work 2026-10-18 to 2026-10-28)
- **Deciders:** Kerem Bayramoglu

## Context
Suggestions, search, Tidy and Bingo need image and text embeddings of every photo, computed on the phone. The first model, TinyCLIP-45M/32, worked but was slow (73 ms per image on a Galaxy A54). Apple's MobileCLIP weights are research-only and cannot ship in a commercial app (`CLIP_ALTERNATIVES.md`: 108 checkpoints checked, license is the main filter). Measurements: `MODEL_BENCHMARKS.md`.

## Options
1. **Keep TinyCLIP-45M/32** — MIT, known quality, slow.
2. **Another published model** (MobileCLIP, OpenVision, UForm and others) — most were ruled out on license or were weaker or no faster.
3. **Distill our own** — MobileNetV4-Conv-Medium image tower trained against a PE-Core L/14 teacher on Open Images (CC BY), text tower from TinyCLIP-45M (MIT) fine-tuned into the teacher's space. Every weight commercially usable (`research/distill/PLAN.md`).
4. **Cloud embeddings** — rejected by ADR 0001.

## Decision
Option 3, shipped as `distill-v2` (`MODELS.md`). The native Android module `modules/clip-embedder` runs it with LiteRT/ONNX Runtime. Model files ship as Play asset packs (visionpack, facepack, textpack) so the install stays small. Quality against TinyCLIP-45M on VIST val: search R@1 41.7 vs 42.1, tags 36.0 vs 36.1, R@5 68.4 vs 72.7. The model is calibrated so the app's fixed cutoffs still hold.

## Consequences
- Easier: private, offline, no per-use cost; license is clean.
- Harder: the module exists only on Android, so iOS has no index features (PRD parity list; an iOS engine is a launch blocker for the paywall copy). A new model name makes every phone re-read its library once. Packs need Play delivery.
- The research code (`research/`) lives in this repo, which the app-factory guide warns against. The decision is recorded here; consider moving `research/` out of the app repo.
- Revisit when an iOS engine is built, or when a better permissively licensed model appears.
