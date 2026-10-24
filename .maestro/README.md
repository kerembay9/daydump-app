# Maestro UI tests

Scripted pass over the main flows on as many parallel Android emulators as the PC holds, with crash detection and screenshot diffs. Purchases are skipped (RevenueCat isn't initialised).

## Quick start (emulators)

```bash
.maestro/e2e.py setup          # once: 100-photo set + AVD + "seeded" snapshot (~5 min, ~4 GB in ~/.android/avd)
.maestro/e2e.py build          # e2e APK (~5 min warm, ~5 GB of intermediates in android/app/build)
.maestro/e2e.py run -n 4       # all flows on 4 headless emulators
```

Measured: emulators boot from the snapshot in about 20 s. Each flow takes 25–90 s, including wiping app data and re-indexing the 100 photos (about 15 s). The 26 flows add up to about 26 min, so about 9 min on the default 3 emulators.

- `--headed` shows the emulator windows; leave it off for headless.
- `-n N` sets the number of emulators (default 3). Each takes about 3 GB of RAM plus a ~1 GB disk overlay in `.cache/tmp`, and 2 cores (niced); keep N × 4 GB under your free RAM or the PC swaps and freezes.
- `run 03_search.yaml 06_profile.yaml` runs only those flows.
- `--keep` leaves the emulators running so you can poke at them; kill them with `adb -s emulator-5560 emu kill`.
- Results go to `.maestro/out/<emulator>/`: `maestro.log`, `junit.xml`, the full `logcat.txt` (`ReactNativeJS` lines are the JS console), screenshots, and `*.diff.png` for failed screen diffs.
- The run fails on any failed flow, any `FATAL EXCEPTION`/ANR in logcat, or any screen differing from its baseline.

`e2e.py` only talks to emulators it started (`adb -s emulator-NNNN`), so a phone on USB is never touched.

## Two builds

| | `build` → **e2e** (default) | `build --debug` → **debug** |
|---|---|---|
| What | Release config: bundled JS, Hermes, same R8/shrink, release source sets (EdgeBench stub, no `__DEV__`) | Normal debug build, JS from Metro |
| Use for | Speed, and what users get (catches R8/minify breakage) | Dev logs, LogBox, redbox stack traces |
| Run | `e2e.py run` | Metro on :8081, then `e2e.py run --debug` |
| Output | `android/app/build/outputs/apk/e2e/` | the usual `apk/debug/` |

How they stay out of the way:

- The `e2e` build type exists only when `.maestro/e2e.gradle` is passed with `--init-script`. Release and debug builds never see it, and it lives outside the gitignored `android/`, so it survives a prebuild.
- The e2e build is x86_64-only, for the emulators. Its own output dir means `app-release.apk` is never overwritten.
- `build --debug` rebuilds the standard debug APK with arm64 + x86_64, so the same APK still runs on a phone. The cost: the debug APK is bigger, and the next arm64-only debug build recompiles native code once.

## Photo set

`.maestro/.cache/photos/` holds 100 fixed Lorem Picsum photos (list page 1), except `dd_005`: Picsum 1027, a close-up face for the avatar selfie finder. There are 10 per "day" every 3 days from 1 June 2025, and the days rotate GPS between Istanbul, Paris, Lisbon, Madrid and none. The photos are baked into the snapshot under `/sdcard/Pictures/DayDumpE2E`. After changing the photo logic in `e2e.py`, delete `.cache/photos` and re-run `setup`.

Android only fills MediaStore's `datetaken` when EXIF has `OffsetTimeOriginal`. Without it, every photo falls back to the push time and all the dumps land on one day. The file mtime is set as well.

## Flows

Every `NN_*.yaml` is independent, so any subset runs in any order on any emulator. Each flow wipes DayDump's data first. Most start with `subflows/ready.yaml`: launch, skip onboarding, then wait until indexing is done and Discover has a dump.

| Area | Flows |
|---|---|
| First run | `01` onboarding + photo permission, `02` indexing, `24` access denied |
| Discover | `04` open a dump, `07` hero Edit chip, tiles, pull-to-refresh shuffle |
| Create search | `03` text search, `08` clear search (the suggestions dropdown is unreachable, see the flow), `09` month / place / no match |
| Create basket | `05` create → edit → share step, `10` Total stepper + review sheet, `11` Suggest fills (2 ways, Use this, take out, Save as draft, Add N picked) |
| Edit | `12` sizes, layouts, paging, Bleed/Border; `13` filter, strength, apply to all; `14` filmstrip cover, remove, swap, add |
| Preview + share | `15` IG / grid / TikTok mocks, like, save, HD, handle; `16` Save only → Drafts; `17` Post → Posted → Reuse |
| Library | `18` drafts: search, delete with confirm, empty state |
| Navigation | `19` tab bar + Android Back, `25` deep links (`daydump://preview/today` and unknown ids) |
| Profile | `06` overview, `20` name, handle and defaults reach a new dump, `21` dark theme, `26` avatar selfie finder, `22` Terms/Privacy + developer tools, `23` recap/sensitive switches + Reindex |

- Flows marked `writes-album` (`16`, `17`) really export slides to the emulator's DayDump album. `e2e.py` runs them last on each emulator, because the new photos change counts and screens. On a phone they leave files in the gallery.
- `17` posts through the share chooser, since the emulator has no Instagram or TikTok.
- Not covered: photos shared into DayDump from another app (Maestro can't send a share intent), purchases,.
- The app asks for notification permission at first launch, before onboarding (`NotificationService.init()` in `AppState.tsx`). `subflows/dismiss_notifications.yaml` taps "Don't allow" whenever that prompt shows.
- `26`: the finder's first pick is a cat nose; the face (`dd_005`) ranks #5 of 20. `vr_avatar_selfie` records that until `src/services/selfie.ts` checks for a real face.
- Known failure: `16` fails until the app is fixed. Save only can't export a topic dump: the export file name contains `:` (from the dump id), so `MediaLibrary.createAlbumAsync` can't tell its MIME type (`src/services/slides.tsx`, `exportSlides`).
- Rare launch crashes seen on the emulator, both right after `clearState`: a `SQLITE_IOERR_FSYNC` in AsyncStorage, and a SIGSEGV in React Native Fabric (`MountingCoordinator::pullTransaction`). A re-run passes.
- `--debug` mode hasn't been run yet. Headless and `--headed` both pass.

## Screenshot diffs

`takeScreenshot: vr_<name>` in a flow is compared against `.maestro/baselines/vr_<name>.png`:

- The status bar and gesture bar are cropped first.
- The comparison fails if more than 0.4% of pixels differ.
- The first run records missing baselines.
- After an intended UI change, run `e2e.py run --update` and commit the new baselines.
- Baselines assume the default `--gpu swiftshader_indirect`. `--gpu host` is faster but renders slightly differently.

## On a real phone

The flows are plain Maestro, so they also run on a phone without `e2e.py`:

```bash
maestro --device <adb-serial> test .maestro/
```

`01`/`02` wipe DayDump's data on that device. To run the release build:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

That APK has the same `appId` (`com.horizonzeta.picdump`) and debug signing as the debug build.
