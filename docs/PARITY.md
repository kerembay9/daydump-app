# Platform parity (Android and iOS)

Checked against the code on 2026-10-30. The PRD launches on both platforms; this is where they differ and why. Keep it current when a feature gains an iOS side.

## What differs

| Area | Android | iOS | Why | Where |
|---|---|---|---|---|
| On-device index (Discover suggestions, Bingo, search, selfie finder) | Yes (`modules/clip-embedder`) | **No**: the native module has no iOS side, so `ClipEmbedder` is `null` | The CLIP/ONNX engine and model packs were built for Android only | `MODELS.md`, `src/services/selfie.ts` (`Platform.OS !== 'android'`) |
| Tidy (scan, piles, Move to Trash) | Android 11+ | **No**: Tidy shows "Needs Android 11 or newer" | Trash uses `MediaStore.createTrashRequest`; the scan needs the index | `src/services/tidy/scan.ts` (`tidySupported`), `src/app/(tabs)/tidy.tsx` |
| Search in other languages | Translated on the phone (ML Kit, about 30 MB per language) | English only, section hidden | ML Kit translation module is Android-only | `src/services/index/queryLang.ts`, `MODELS.md` |
| Model downloads | Play asset packs, on demand | none (no models) | as above | `MODELS.md` |
| Background indexing | Foreground service (`dataSync`) with a notification | none | no index on iOS | `modules/clip-embedder/android/src/main/AndroidManifest.xml` |
| Purchases | Google Play Billing via RevenueCat (`picdump_weekly:weekly-plan`, `picdump_yearly:yearly-plan`) | StoreKit via RevenueCat (`picdump_weekly`, `picdump_yearly`) | store products differ in id, same entitlement `daydump_pro` | `src/services/revenuecat.ts` |
| Free trial | 7-day offer `trial-7d` on the yearly plan | 1-week free trial on the yearly plan | configured per store; both read through the RevenueCat offering | Play Console, App Store Connect |
| Toasts | `ToastAndroid` | `console.log` only (no visible toast) | no iOS equivalent was built | `profile.tsx`, `preview/[id].tsx`, `PaywallModal.tsx` |
| Notification permission text | "Notifications are off for PicDump in Settings" wording differs by platform | | | `src/app/profile.tsx` |
| Manage subscription link | Play subscriptions page | App Store subscriptions page | | `src/services/subscription.ts` |

Same on both: manual Create, Edit (crop, looks, layouts, Adjust), Library and drafts, export and share to Instagram/TikTok, profile and settings, recap notifications, paywall and restore.

## Open decision (blocks the iOS release)

The Pro paywall and the store listings mention search and "Clear repeats and clutter". Neither works on iOS. Before iOS goes to App Review, do one of: build an iOS engine, reword the paywall and hide those features on iOS, or ship iOS without them. App Review guidelines 2.3.1 and 3.1.2 are the risk. The current App Store listing already avoids promising them; the paywall copy and `PaywallModal` feature rows do not.

## Not parity issues but worth knowing

- iOS has no visible toast, so errors that Android shows as toasts are silent on iOS (purchase errors, "No mail app found").
- The in-app privacy text describes on-device features that the iOS app does not have yet. Nothing is uploaded on either platform.
