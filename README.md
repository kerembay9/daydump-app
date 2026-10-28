# PicDump

Turns a camera roll into photo dumps: a pick of the best shots from your days and trips, ready to edit and post.
Everything runs on the phone. The photo index, story suggestions and search never leave the device.

(The repo and some identifiers still say `daydump`; the app, bundle id and URL scheme are `picdump`.)

## What it does

- **Discover:** dump suggestions built from your own photos ("A week in Seattle", "A red winter"), 4 to 10 photos each, on a parchment-paper look.
- **Create:** pick photos into a basket, preview the way they are paced, choose a finish and layout.
- **Edit:** per-slide crop (drag and pinch), film looks and borders, with Skia drawing the photo on the UI thread.
- **Library:** drafts and posted dumps. A posted dump opens a read-only preview, and Reuse makes an editable copy.
- **Share:** export slides to a "PicDump" album and open Instagram or TikTok, or the system share sheet. "Open with PicDump" also accepts shared photos.
- **Profile:** name and handle, selfie finder (so your own face anchors the stories), photos per dump (4 to 20), the daily 8 PM recap, Hide sensitive photos.
- **Pro:** RevenueCat subscription (`react-native-purchases`, entitlement `daydump_pro`). Free users see every Discover dump's title but only the 8 PM recap and one dump a week unlocked; Pro opens all of them, search, every film look, 4-20 photos per dump, and drops the "made with PicDump" end slide. Plans, prices and trials come from the store offering. `PAYWALLS_ENABLED` in `src/constants/flags.ts` is the kill switch. Design: `docs/superpowers/specs/2026-10-28-monetization-design.md`.

## Tech stack

- Expo SDK 57, React Native 0.86, TypeScript, Expo Router (routes in `src/app/`).
- `@shopify/react-native-skia` for filters and photo rendering, `react-native-reanimated` for gestures.
- `modules/clip-embedder`: native Android module for the on-device index (see below). On iOS and in Expo Go it is absent, so the index features are off.
- Which models ship and what happens without them: [MODELS.md](MODELS.md).

## Running it

```bash
npm install
npx expo run:ios       # iOS simulator (generates ios/ with prebuild)
npx expo run:android   # Android device or emulator (generates android/)
npx expo start         # dev server only, for an installed development build
```

`ios/` and `android/` are generated and gitignored. Configure native behaviour in `app.json` and config plugins, not by hand.

If `pod install` fails with `Unicode Normalization not appropriate for ASCII-8BIT`, run it with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.

```bash
npm test               # jest
npx tsc --noEmit       # typecheck
npx expo lint          # lint
```

## Developer tools (debug builds only)

In a debug build, tap the **Version** row in Profile repeatedly to unlock **Developer tools**: Model bench, Stories debug, CLIP model switch,
Bands (No bands, Default, Scrapbook), Paper grain, Fake Pro subscription for testing the paywall, Free unlock reset, Pretend 7 days passed, and Onboarding every launch. None of this is in release builds.

## Release

`expo.android.versionCode` in `app.json` goes up by 1 for every Play upload. `expo.version` only changes when preparing a release.
See [RELEASE_SIGNING.md](RELEASE_SIGNING.md) and [REVENUECAT_GOOGLE_PLAY_SETUP.md](REVENUECAT_GOOGLE_PLAY_SETUP.md).

## On-device stories (Android)

Story cards ("A week in Seattle", "A red winter") come from an on-device index: TinyCLIP embeddings
(`modules/clip-embedder`, ONNX Runtime) + GPS/dates + an offline city list. Nothing leaves the phone.

1. Build the model assets once (they're gitignored, ~110 MB):
   `python -m venv --system-site-packages .venv && .venv/bin/pip install onnx onnxruntime onnxscript wordfreq ftfy regex`
   then `.venv/bin/python scripts/build_assets.py`
   (`build_assets.py bench` exports the old 40M and the faster 22M vision models for the index bench and prints the adb push commands.)
   Accuracy vs phone speed of every model tried: [MODEL_BENCHMARKS.md](MODEL_BENCHMARKS.md).
2. Logic self-check: `npx -y tsx scripts/selfcheck.ts`
3. **Eval mode:** put a curated, diverse set of photos in a phone album (e.g. `DayDump Eval`) and add
   `EXPO_PUBLIC_EVAL_ALBUM=DayDump Eval` to `.env.local`. Every gallery read, the index, stories and search
   then use only that album (separate index DB). Inspect results in Profile → Developer tools → Stories debug.
   Only on a dedicated test phone: album copies keep their dates, so they show up twice in the gallery
   timeline. `scripts/make_eval_album.py push --test-phone` builds one; `... clean` removes it.

Attribution: GeoNames (CC BY 4.0), Open Images V7 class names (CC BY 4.0), TinyCLIP (MIT), YuNet face detector (OpenCV Zoo, MIT), SFace face recognition (OpenCV Zoo, Apache 2.0).
