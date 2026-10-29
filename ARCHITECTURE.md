# PicDump — Architecture

Written 2026-10-29 from `package.json`, `app.json`, `src/` and `MODELS.md`. Model and asset details live in [MODELS.md](MODELS.md); this file points there instead of repeating them.

## Stack
- Expo SDK: 57 (`expo ~57.0.x`, pinned with a tilde; Expo packages follow `expo install`)
- React Native: 0.86.3, React 19.2.3 (`react-dom` pinned to the same version so `npm ci` resolves in EAS builds)
- Routing: Expo Router (`src/app/`): tabs for Discover, Create, Tidy and Library, plus Edit, Preview, Profile, Today, People, Selfie and Tidy sub-screens
- State: React context providers, no state library. `src/state/AppState.tsx` (index progress, stories, onboarding, share intents) and `src/state/Pro.tsx` (subscription, paywall, weekly unlock). Screen-local state with hooks.
- Styling / theme: `src/theme/` (`ThemeProvider.tsx`, `tokens.ts`, `type.ts`), light and dark, Source Serif 4 and Inter bundled as fonts
- Rendering and gestures: `@shopify/react-native-skia` for filters and photo drawing, `react-native-reanimated` and `react-native-gesture-handler` for crop and pinch
- Language: TypeScript. Tests: Jest (`__tests__/`, 67 suites) and Maestro flows (`.maestro/`).
- Languages in the UI: English only today. The PRD requires all available languages, so i18n is not yet set up (open item for this phase).

## Backend
None. PicDump has no server of its own. No accounts, no API, no database in the cloud, no server-side processing of photos.

Third-party services the app talks to:
- RevenueCat (subscription entitlement `daydump_pro`) for purchases and receipts.
- Google Play (Feature Delivery) for model packs, and Google ML Kit for per-language translation models. These are downloads only.

Full list, with what each one receives, in [PRIVACY.md](PRIVACY.md).

## Data model
All data is on the device. Nothing is written by a server.

| Store | Holds | Written by |
|---|---|---|
| SQLite `picdump` DB (`expo-sqlite`, `src/services/index/photoIndex.ts`) | `photos` (index of each gallery photo: tags, embeddings, date, GPS-derived place), `tidy_photos` (stats, faces, sharpness, embedding, concepts), `meta` (key/value, e.g. model name, index state) | The indexer (`photoIndex.ts`, native `clip-embedder`) |
| AsyncStorage | Profile (`@daydump_profile`), dumps and drafts (Library), unlock state (`@picdump_unlocks`), first-paywall flag, seen stories, recent searches, today state, theme mode, onboarding flags | The matching service in `src/services/` |
| Gallery (`expo-media-library`) | Original photos (read in place, never copied) and exported slides in the "PicDump" album | The user and the export flow |
| RevenueCat (remote) | Anonymous app user ID, purchases | RevenueCat SDK. The app only reads the entitlement. |

Entitlement: Pro status comes from RevenueCat's `daydump_pro` entitlement, read on the client (`src/services/subscription.ts`, `revenuecat.ts`). There is no server to hold it, so Pro gating is client-side only. `PAYWALLS_ENABLED` in `src/constants/flags.ts` is the kill switch (off = everyone Pro).

The weekly free unlock is stored locally. Clearing app data resets it; this is accepted in the monetization spec.

Identifiers kept from the old DayDump name (storage keys, entitlement id, notification ids) are listed in the README. They must not be renamed without a data migration.

## Auth
None. No sign-in, no session, no tokens, no SecureStore use. RevenueCat identifies a user by an anonymous app user ID it generates.

## Offline behaviour
- Works fully offline once the model files are on the phone: indexing, stories, Tidy, Bingo, search in English, editing, export, sharing.
- Needs the network for: first launch downloads of model packs from Play (release builds), a translation model the first time the user searches in a non-English language, purchases and entitlement checks (RevenueCat caches the last answer).
- No writes sync anywhere, so there are no conflicts.
- If a pack or translation model has not downloaded, the feature that needs it falls back as described in `MODELS.md` ("what happens without them").

## Native modules and models
Android only. `modules/clip-embedder` (Expo native module) runs the on-device index; it does not exist on iOS or in Expo Go, where `ClipEmbedder` is `null` and the index features are off. Full table of assets, sizes, packs and fallbacks: [MODELS.md](MODELS.md).

| Module / model | Ships in | Size | Fallback | Features that need it | iOS | Android |
|---|---|---|---|---|---|---|
| `clip-embedder` + CLIP image tower (visionpack) | Play asset pack | 14 MB on disk | none: index features off | Discover, search, Tidy, Bingo | no | yes |
| CLIP text tower + tokenizer (textpack) | Play asset pack | 34.7 MB on disk | fixed phrases from the APK work; free-text search waits | Natural-language search | no | yes |
| Face model `sface` (facepack) | Play asset pack | 15.1 MB on disk | selfie finder off | Selfie finder, People | no | yes |
| GPU image model skeleton | APK | 18.4 MB | CPU path | Faster indexing | no | yes |
| ML Kit translate + language-id | On-demand feature module and models | 7.7 MB module, about 30 MB per language | search runs as typed | Search in other languages | no | yes |
| RevenueCat (`react-native-purchases`) | JS + native SDK | n/a | `PAYWALLS_ENABLED` off | Pro subscription | yes | yes |

iOS gap: Discover, Tidy, Bingo, search and the selfie finder need the Android-only module. See `APP_STATE.md` hold list and the PRD parity list.

## Secrets
| Secret | Lives in | Used by |
|---|---|---|
| RevenueCat public SDK keys (`goog_…`, `appl_…`) | Hardcoded in `src/services/revenuecat.ts` (public keys, meant to ship in the app). A `test_…` Test Store key is in the same file but nothing reads it; remove it before release. | `src/services/revenuecat.ts` |
| Android upload keystore `daydump-release.keystore` | Local file, gitignored (`*.keystore`); not on this machine right now | Release signing (`plugins/withReleaseSigning.js`) |
| `PICDUMP_UPLOAD_*` keystore passwords | `~/.gradle/gradle.properties` | Release signing |
| App Store Connect and Play API credentials | Local MCP configuration, not in the repo | Store tooling |
| EAS project ID | `app.json` (`extra.eas.projectId`, public) | EAS builds |

`.env*.local` is gitignored. `af check` found no secrets in tracked files, but its history scan flags three old commits that touched secret-like lines (one of them removed keystore passwords from `RELEASE_SIGNING.md`); treat any password that was ever in git history as burned.

## Decisions
See [docs/adr/](docs/adr/).
