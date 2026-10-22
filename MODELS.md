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
| `gate.tflite` | APK | 5.2 MB | 4.7 MB | MobileNetV3-Small (timm, Apache 2.0), fp16 weights: the selfie step's P(document, screen or pet) and near-copy feature until visionpack lands (int8 was tried: it lets 19/30 pets through) | first `selfieCheck` / `warmSelfie` without visionpack |

Download (bundletool, arm64, 2026-10-22): **33.0 MB at install** (48.3 MB before R8, lucide deep imports, dropping Compose and cutting Inter; models are 5.4 MB of it), then visionpack 42.8 MB, facepack 11.5 MB, textpack 41.0 MB (128.3 MB in all; was 98 MB at install with only the text pack split out, 138 MB before any). Built from `scripts/build_assets.py`. No other models in release
builds: sensitive-photo hiding uses the concept tags, and Gemini isn't called. Debug builds add EdgeBench (Gemma, ML Kit).

## Download order (release builds)

All three download on their own, one at a time, so each gets the whole connection. vision is always first; after it, the pack a screen asked for (`useModels(want)` → `wantModel`) jumps ahead; otherwise this order:

| # | Pack | Delivery | Unlocks |
|---|---|---|---|
| 1 | visionpack | fast-follow: Play starts it at install, app opened or not | indexing → Discover dumps, Create's photo grid, topics, captions |
| 2 | facepack | on-demand: the app fetches it when visionpack lands. Wanted by onboarding's selfie step, /selfie, People (any `faces(embed)` call) | People; sharper selfie pick (works without it) |
| 3 | textpack | on-demand: fetched when facepack lands. Wanted by Create (first visit): then it goes before facepack | Create search by words |

```mermaid
flowchart TD
  INST{how was the app installed?} -->|Google Play| FF[Play downloads visionpack right after the install]
  INST -->|sideloaded / adb release APK| UNAV[every pack: unavailable, never arrives]
  INST -->|bundletool --local-testing| LT[packs copied to the phone; each fetched when the app asks]
  FF --> V[visionpack downloading]
  LT --> V
  V -->|COMPLETED: the listener calls next| W{a screen wanted textpack?}
  W -->|no: default| F[facepack downloading]
  W -->|yes: Create opened| T2[textpack downloading]
  F -->|COMPLETED| T[textpack downloading]
  T2 -->|COMPLETED| F2[facepack downloading]
  T & F2 -->|COMPLETED| DONE[all ready]
  V & F & T -.->|network etc.| FAILED[failed: restarted by the next modelState, i.e. the app coming back to the front]
  V & F & T -.->|Play wants Wi-Fi or the user's OK| WAIT[waiting]
```

`ModelPacks.next()` fetches the next missing pack (vision, then the last wanted, then Pack order) unless one is already
downloading. It runs when the module starts (app launch), when a pack completes, from `modelState()`, when a call needs a
missing pack (that also wants it), and from the background worker. Packs behind it report `queued`. A want doesn't stop
the pack already downloading (ponytail: Play may drop a cancelled pack's bytes; cancel it if waiting behind it hurts).

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
| Selfie finder (`useSelfiePick`: onboarding's profile step, scanning from the photo grant; /selfie) | yunet; visionpack if there, else gate; facepack if there (groups faces into people: the owner is in the most selfies). Doesn't wait for the photo index | `SelfieFinder` doesn't wait for any download: "Picking your best selfie" (bar) while it goes through the camera photos, 30 at a time, starting on the library's first page of 1000 while the rest is listed: sizes other than the main camera's first (the front camera's), each newest first; YuNet on MediaStore's cached 320 px thumbnails (`soloPhotos`, indexing held meanwhile), then only the photos with one big face decoded once more (`checkSelfies` → `selfieCheck`): YuNet and SFace on it while CLIP reads a 224 px copy on a CPU vision_dw8 of its own (never queued behind indexing). The next 30's thumbnails run during that check. Shows solo selfies only (one face ≥ 0.6 and ≥ 10% of the photo, no other face ≥ 0.35); photos tagged as documents (passport, ID, screenshot…) or other people (group, family, hug…) in their top 5 concepts, any cat or dog concept in their top 20, and near-copies (CLIP cosine > 0.92) are dropped. Before visionpack lands, `selfieCheck` runs the bundled gate on the same decode instead of CLIP: P(document, screen or pet) > 0.14 drops the photo (Commons test set: 20/20 IDs, 30/30 pets, about half of posters and video stills caught, 25/28 selfies kept); near-copies by its 1024-d feature (cosine > 0.90), sharpness by the face's Laplacian variance; no poor-avatar check, and photos picked then aren't rechecked once CLIP is there. Within a person, by `profileFit`: the avatar crop (a square ~2x the face) has its full margin and the face in its middle (a too-close or cut-off face loses), the face is >= 240 px tall, times CLIP's sharp-vs-blurry score (fixed phrase vectors, no textpack), halved for a poor-avatar concept in the top 5 (middle finger, crying, eating…). Without facepack: no grouping, best fit wins. Onboarding's strip: the picked person's other selfies (`mine`). Its YuNet and CLIP load during the onboarding slides (`warmSelfie`; without visionpack the gate loads at the scan's start), and the index's GPU model build waits out the hold. The first pick shows once those odd-sized photos are scanned (at most 240; listing done); scanning goes on in the background until 40 are found, so "Not me" (skips that face, SFace match) and "Try another" show the next one at once; none yet: "Looking further back"; none at all: "No other selfie on your phone" (onboarding: "No selfie found", Continue). Onboarding's "That's me" saves the face's square (512 px, `faceFile`) as the profile avatar; "Skip for now" leaves any time. Avatar sheet and Model bench still use `findSelfies` (CLIP's top 30 in the index) | yunet fails (or no native module, or iOS): no face found, so "No other selfie on your phone"; visionpack missing: the gate filters; gate fails too: nothing dropped beyond YuNet's one-face rule; facepack fails: biggest single face wins |
| People experiment (dev tools) | yunet, facepack | Scan rejects | finds nobody |
| 8 PM daily recap | none | always works | text-only notification without the module |

## Onboarding

Slides (intro, privacy) → "Allow photos & continue" → access granted: indexing starts (`app.start`) and the profile step
(`ProfileStep`) shows: a post header as on dump previews, with "only on your previews, stays on your phone" up front. The
name is asked first and flies into the header (the selfie scan, `useSelfiePick`, runs from the grant meanwhile); then the
pick: "That's me" flies the face into the header's avatar and shows a strip of the same person's other selfies to swap it;
"Not me" moves to the next person. Continue saves the avatar; "Skip for now" leaves the initial letter. Continue needs a
pick unless none was found; indexing carries on either way.
Denied: straight to the app. The slides are two taps. The notification permission is asked after onboarding, not before it.

## What the user sees, by scenario

| Scenario | How it happens | What changes in the UI |
|---|---|---|
| Play install, first open within a minute | visionpack (42.8 MB) still downloading | Discover and Create: **"Getting your dumps ready"**, "Downloading (N%)…". Onboarding's selfie step doesn't wait: the gate stands in for CLIP. Dumps start as soon as it lands |
| Play install, opened later | Play fetched visionpack meanwhile | indexing starts at once; faces then text download in the background |
| Word search before textpack | behind vision (and facepack if that had started) | Create: **"Word search is on its way"**, "Downloading (N%). Places and months work now." or "Next in line after the other downloads." |
| A pack waiting | Play holds it (Wi-Fi, needs the user's OK) | that pack's card: "Waiting for Wi-Fi." |
| A pack failed | network error | "The download stopped. DayDump tries again when you come back." Restarted on the next foreground |
| No packs at all | release APK sideloaded or installed with adb | every card: "This copy of DayDump can't download it. Install it from Google Play." Discover never fills |
| Debug build | Metro / `expo run:android` | every pack is in the APK: always ready |
| Vision model fails (no GPU, no CPU) | very old / broken device | Indexing stops silently (console warning); no new topics, captions, search hits |
| Face models fail | broken asset | yunet: selfie finder finds none ("No other selfie on your phone"), People finds nobody. facepack: selfie finder picks the biggest single face, People finds nobody |
| No native module | iOS, Expo Go | No CLIP anything, no download cards: Trips, Today, places and months only |

The UI has two availability signals: `Library.hasClip` (native module present) and `useModels()` (the packs). Nothing
tells the UI that a model on the phone failed to load.
