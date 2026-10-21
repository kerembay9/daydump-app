# Models: what ships, what loads, what happens without them

Keep this current. Update it in the same change whenever a model or asset is added, removed, moved out of the APK
(asset pack / download), gets a new fallback, or a feature starts or stops depending on one. Android only: the native
module (`modules/clip-embedder`) doesn't exist on iOS or in Expo Go, where `ClipEmbedder` is null.

Last checked against the code: 2026-10-21 (models split into three download packs, on top of 599f2db).

## Shipped assets

Base APK: `modules/clip-embedder/android/src/main/assets/clip/`. Packs: `modules/clip-embedder/android/<pack>/src/main/assets/clip/`.
Release builds download the packs from Play after the install (`ModelPacks.kt`); debug builds carry them in the APK.

| Asset | Where | On disk | Download | What it is | Loaded |
|---|---|---|---|---|---|
| `vision_dw8.tflite` | **visionpack** | 46.1 MB | 40.6 MB | CLIP image tower, int8 weights, CPU (XNNPACK) | first `embedImages` |
| `concepts.tflite` | **visionpack** | 3.7 MB | 2.2 MB | 3,566 precomputed concept-word vectors | first `topConcepts` |
| `sface.tflite` | **facepack** | 15.1 MB | 11.5 MB | face recognition (who is it), fp16 + int8 FCs | first `faces(…, embed=true)` |
| `text.tflite` | **textpack** | 45.0 MB | 40.4 MB | CLIP text tower, CPU | first `embedTexts` of a non-fixed phrase |
| `tokenizer.json` | **textpack** | 2.2 MB | 0.6 MB | text tokenizer | same |
| `vision_gpu.skel` | APK | 90.4 MB | 0.4 MB | GPU image model minus its weights; `VisionGpu` fills them from dw8 into `cacheDir/litert/vision-<install>.tflite` (90 MB, ~1 s on the A54). Stays in the APK: a pack would unpack it to 90 MB | first `embedImages` |
| `phrases.json` | APK | 8 KB | ~0 | the selfie finder's 3 phrases, already embedded (`FIXED_PHRASES` in build_assets.py) | first `embedTexts` |
| `vocab.json` | APK | 0.05 MB | ~0 | the 3,566 concept names | `loadLibrary` (app start) |
| `yunet_320.tflite` | APK | 0.3 MB | 0.2 MB | face detection (where are faces) | first `faces` |

Download (bundletool, arm64, 2026-10-21): **43.3 MB at install**, then visionpack 42.8 MB, facepack 11.5 MB, textpack 41.0 MB (138.6 MB in all; was 98 MB at install with only the text pack split out, 138 MB before any). Built from `scripts/build_assets.py`. No other models in release
builds: sensitive-photo hiding uses the concept tags, and Gemini isn't called. Debug builds add EdgeBench (Gemma, ML Kit).

## Download order (release builds)

One pack at a time, so each gets the whole connection, in the order the app needs them:

| # | Pack | Delivery | Unlocks |
|---|---|---|---|
| 1 | visionpack | fast-follow: Play starts it at install, app opened or not | indexing → Discover dumps, Create's photo grid, topics, captions |
| 2 | facepack | on-demand: the app fetches it when visionpack lands | People; sharper selfie pick (works without it) |
| 3 | textpack | on-demand: fetched when facepack lands | Create search by words |

```mermaid
flowchart TD
  INST{how was the app installed?} -->|Google Play| FF[Play downloads visionpack right after the install]
  INST -->|sideloaded / adb release APK| UNAV[every pack: unavailable, never arrives]
  INST -->|bundletool --local-testing| LT[packs copied to the phone; each fetched when the app asks]
  FF --> V[visionpack downloading]
  LT --> V
  V -->|COMPLETED: the listener calls next| F[facepack downloading]
  F -->|COMPLETED| T[textpack downloading]
  T -->|COMPLETED| DONE[all ready]
  V & F & T -.->|network etc.| FAILED[failed: restarted by the next modelState, i.e. the app coming back to the front]
  V & F & T -.->|Play wants Wi-Fi or the user's OK| WAIT[waiting]
```

`ModelPacks.next()` fetches the first pack in the order that isn't on the phone. It runs when the module starts (app
launch), when a pack completes, from `modelState()`, when a call needs a missing pack, and from the background worker.
Packs behind it report `queued`. ponytail: a feature waiting on a later pack doesn't jump the queue.

JS sees it through `modelState()` → `{vision, faces, text}: {state, progress}` (`ready | downloading | queued | waiting |
failed | unavailable`) and the `onModels` event (`{pack, state, progress}`). `src/state/models.ts` keeps one copy for
the app: `useModels()` for screens, `whenReady(pack)` for code, refreshed when the app comes back to the front.

## Loading and fallbacks

```mermaid
flowchart TD
  JS[JS calls ClipEmbedder] -->|null: iOS / Expo Go| NONE[No models: see features table]
  JS --> IMG[embedImages]
  JS --> TXT[embedTexts]
  JS --> CON[topConcepts]
  JS --> FACE[faces]

  IMG --> VP{visionpack here?}
  VP -->|no| VREJ[rejects 'vision model not downloaded yet', not sticky]
  VP -->|yes| BUILD{built GPU model in cache?}
  BUILD -->|no| VG[VisionGpu: dw8 + skel to fp16, CRC check]
  BUILD -->|yes| GPU
  VG --> GPU[GPU model, batch 1]
  GPU -->|ok| PAR[GPU from the front + dw8 CPU helper from the back]
  PAR -->|helper fails| GPUONLY[GPU alone, silent]
  GPU -->|any failure: no GPU, CRC, compile| CPU8[dw8 on CPU alone]
  CPU8 -->|fails| FAIL[liteFailed, sticky: embedImages rejects]

  TXT --> FIX{fixed phrase? phrases.json}
  FIX -->|yes| FIXV[precomputed vector, no model needed]
  FIX -->|no| HAVE{textpack here?}
  HAVE -->|yes| TM[text.tflite + tokenizer, CPU] -->|fails| TREJ[rejects that call, retried on the next]
  HAVE -->|no| FETCH[rejects that call]
  CON --> CP{visionpack here?} -->|yes| CM[concepts.tflite, CPU] -->|fails| CREJ[rejects: indexing batch fails]
  CP -->|no| CREJ
  FACE --> YN[yunet_320] -->|embed| FP{facepack here?}
  FP -->|no| FREJ[the whole call rejects]
  FP -->|yes| SF[sface] -->|decode / model failure| NOF[that photo: no faces]
```

In every "not here" case the model's `by lazy` throws and loads on the next call once the pack has landed.

Caches live in `cacheDir/litert`, keyed by install time: XNNPACK `dw8-`, `text-`, `concepts-`; the GPU program cache;
the built `vision-` model. `ClipEngine`'s init deletes entries from older installs. Indexing (GPU and CPU) sleeps while
the user touches the screen (`holdIndexing`).

## Features and the models they need

| Feature | Needs | While its pack is downloading | Other failures |
|---|---|---|---|
| Indexing (Discover strip, Profile "Index") | visionpack | `refreshStories` waits (`whenReady('vision')`); existing dumps stay | Module missing: rows are stored with no vectors. Model failure: the refresh stops silently (console warning only) |
| Background indexing (WorkManager) | visionpack | worker returns `retry` and kicks the download | worker throws; status reads idle |
| Discover | visionpack (via indexing) | no dumps yet: the **download card** (`ModelLoading`: developing prints, %, bar) instead of "No dumps yet" | |
| Create photo grid | visionpack (via indexing) | empty library: the same download card | |
| Create search: free words | textpack + stored vectors | a search with words and no hits: the **"Word search is on its way"** card, % and bar; re-searches when it lands | "No matches", retried on the next search |
| Create search: places, months | none | always work | |
| Stories: Trips, Today | none (GPS, dates) | indexing waits, so none until visionpack lands | |
| Stories: topics, curation, Hide sensitive photos, captions | stored concept tags | as indexing | Module missing: no topics, **Hide sensitive photos does nothing** |
| Similar / Suggest fills / Edit swaps | stored vectors only | as indexing | "Nothing similar to suggest yet"; swaps fall back to nearest in time |
| Selfie finder (`useSelfiePick`: onboarding's profile step, scanning from the photo grant; /selfie) | visionpack, yunet; facepack if there (groups faces into people: the owner is in the most selfies). Doesn't wait for the photo index | `SelfieFinder` shows visionpack's download, then "Picking your best selfie" (bar) while it goes through the camera photos, 30 at a time, starting on the library's first page of 1000 while the rest is listed: sizes other than the main camera's first (the front camera's), each newest first; YuNet on MediaStore's cached 320 px thumbnails (`soloPhotos`, indexing held meanwhile), then only the photos with one big face decoded once more (`checkSelfies` → `selfieCheck`): YuNet and SFace on it while CLIP reads a 224 px copy on a CPU vision_dw8 of its own (never queued behind indexing). The next 30's thumbnails run during that check. Shows solo selfies only (one face ≥ 0.6 and ≥ 10% of the photo, no other face ≥ 0.35); photos tagged as documents (passport, ID, screenshot…) or other people (group, family, hug…) in their top 5 concepts, any cat or dog concept in their top 20, and near-copies (CLIP cosine > 0.92) are dropped. Without facepack: the biggest single face wins. Its YuNet and CLIP load during the onboarding slides (`warmSelfie`), and the index's GPU model build waits out the hold. The first pick shows once those odd-sized photos are scanned (at most 240; listing done); scanning goes on in the background until 40 are found, so "Not me" (skips that face, SFace match) and "Try another" show the next one at once; none yet: "Looking further back"; none at all: "No other selfie on your phone" (onboarding: "No selfie found", Continue). Onboarding's "That's me" saves the face's square (512 px, `faceFile`) as the profile avatar; "Skip for now" leaves any time. Avatar sheet and Model bench still use `findSelfies` (CLIP's top 30 in the index) | yunet fails (or no native module, or iOS): no face found, so "No other selfie on your phone"; facepack fails: biggest single face wins |
| People experiment (dev tools) | yunet, facepack | Scan rejects | finds nobody |
| 8 PM daily recap | none | always works | text-only notification without the module |

## Onboarding

Slides (intro, privacy) → "Allow photos & continue" → access granted: indexing starts (`app.start`) and the profile step
shows: a live post header (as on dump previews), the name field (focused, so the keyboard hides the scan) and the selfie pick
(`useSelfiePick`, scanning from the grant). "That's me" puts the face in the header and Continue saves it as the profile
avatar; "Skip for now" leaves the initial letter. Continue needs a pick unless none was found; indexing carries on either way.
Denied: straight to the app. The slides are two taps. The notification permission is asked after onboarding, not before it.

## What the user sees, by scenario

| Scenario | How it happens | What changes in the UI |
|---|---|---|
| Play install, first open within a minute | visionpack (42.8 MB) still downloading | Discover and Create: **"Getting your dumps ready"**, "Downloading (N%)…". Onboarding's selfie step: the same. Dumps start as soon as it lands |
| Play install, opened later | Play fetched visionpack meanwhile | indexing starts at once; faces then text download in the background |
| Word search before textpack | last in the order | Create: **"Word search is on its way"**, "Downloading (N%). Places and months work now." or "Next in line after the other downloads." |
| A pack waiting | Play holds it (Wi-Fi, needs the user's OK) | that pack's card: "Waiting for Wi-Fi." |
| A pack failed | network error | "The download stopped. DayDump tries again when you come back." Restarted on the next foreground |
| No packs at all | release APK sideloaded or installed with adb | every card: "This copy of DayDump can't download it. Install it from Google Play." Discover never fills |
| Debug build | Metro / `expo run:android` | every pack is in the APK: always ready |
| Vision model fails (no GPU, no CPU) | very old / broken device | Indexing stops silently (console warning); no new topics, captions, search hits |
| Face models fail | broken asset | yunet: selfie finder finds none ("No other selfie on your phone"), People finds nobody. facepack: selfie finder picks the biggest single face, People finds nobody |
| No native module | iOS, Expo Go | No CLIP anything, no download cards: Trips, Today, places and months only |

The UI has two availability signals: `Library.hasClip` (native module present) and `useModels()` (the packs). Nothing
tells the UI that a model on the phone failed to load.
