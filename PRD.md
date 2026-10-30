# PicDump — PRD

**Status:** approved (2026-10-29, Kerem Bayramoglu). Drafted from the README, `docs/superpowers/specs/2026-10-28-monetization-design.md` and the code. Metric targets are unvalidated proposals; the concrete language list is still to confirm before phase 3.

## Summary
PicDump finds the dump-worthy photos in your camera roll and turns them into ready-to-post photo dumps for Instagram and TikTok. The photo index, suggestions and search run on the phone; nothing leaves the device.

## MVP features (7 max)
| # | Feature | Acceptance criteria | Platforms |
|---|---|---|---|
| 1 | **Discover**: dump suggestions built from the user's own photos | After the index finishes, Discover lists suggested dumps with title, date and photo count. Each dump holds 4 to 10 photos. Recaps for today (8 PM), week, month and year always open. Free users see every title; a locked dump shows a lock instead of its picks. | Android (iOS: see parity) |
| 2 | **Create**: build a dump by hand | User adds photos to a basket and sees a pacing preview. "Similar" strip and sets suggest matching photos. Natural-language search returns matching photos for Pro users; for free users the field opens the paywall. | iOS, Android (search: Android) |
| 3 | **Edit**: crop, looks, layout | Per-slide crop by drag and pinch. Layout tab changes arrangement, frame and ratio. Adjust (Light, Contrast, Shadows, Warmth, Saturation, Sharpen) works for all users. Premium film looks and Texture preview for free users and export only for Pro. | iOS, Android |
| 4 | **Library**: drafts and posted dumps | Saving or exporting adds the dump to Library. A posted dump opens a read-only preview. "Reuse" makes an editable copy. | iOS, Android |
| 5 | **Share**: export and post | Slides save to a "PicDump" album and open Instagram or TikTok, or the system share sheet. "Open with PicDump" accepts shared photos. Free exports end with a "made with PicDump" slide; Pro removes it. | iOS, Android |
| 6 | **Tidy**: find clutter | Scan groups screenshots, receipts and near-duplicates into piles with counts. Pro users move a pile's picks to Trash. Undo, restore and Trash history work for everyone. A pile can start a dump from its keepers. | Android (iOS: see parity) |
| 7 | **Today and Bingo**: daily hook | A daily 8 PM notification opens the Today recap. Bingo fills squares from the user's photos and offers "Make a dump from what I have". Free for everyone. | Android (iOS: see parity) |

Settings (Profile): name and handle, selfie finder, photos per dump (4 to 20, Pro), recap notification time, "Hide sensitive photos". Not counted as a feature.

## Non-goals (not in v1)
- No accounts, sign-in or cloud sync. Everything is local.
- No server-side photo processing or upload of any user photo.
- No video dumps; photos only.
- No in-app social feed or sharing between PicDump users.
- No ads.
- No tablet-specific layouts (`supportsTablet` is on, but nothing is designed for it).

## Later
- iOS on-device index (native CLIP engine) so Discover, Tidy, Bingo, search and the selfie finder work on iOS.
- More languages.
- Video clips inside dumps.
- Cloud backup of Library drafts, if users ask.

## Pricing
- **Model:** freemium with a subscription (RevenueCat, entitlement `daydump_pro`). Implemented, not released.
- **Price points:** not in the code. Plans, prices and trial lengths come from the store offering (RevenueCat). Model confirmed by owner 2026-10-29; the actual price points are set in the stores.
- **Gated:** Pro opens every Discover dump (free: recaps plus one unlock per rolling 7 days), natural-language search, premium film looks and Texture on export, Tidy's Move to Trash, 4 to 20 photos per dump, and removes the end slide. Full table in the monetization spec.
- **No paywall in v1?** No. The paywall is built and on; `PAYWALLS_ENABLED` in `src/constants/flags.ts` is the kill switch. A user's photos are never held hostage: Undo, restore and Trash history stay free after Pro lapses.

## Platforms
- **At launch:** iOS and Android (owner decision, 2026-10-29). The monetization spec's "Android first" is superseded. Before the iOS release the paywall copy and iOS-only UI must match what works on iOS (see parity list).
- **Parity list** (anything that differs per platform, and why):
  - The on-device index (`modules/clip-embedder`) has only an Android side. On iOS and in Expo Go: Tidy shows "Needs Android 11 or newer", Bingo squares never fill, and text search and the selfie finder have no engine.
  - The Pro paywall lists search and "Clear repeats and clutter", which do not work on iOS. Resolve before an iOS release (App Review 2.3.1 / 3.1.2 risk): build the engine, hide or reword on iOS, or ship iOS without them.
  - Manual Create, Edit, Library and Share work on both.

## Languages
- **Decision (owner, 2026-10-29):** launch in all available languages. i18n is therefore set up in phase 3, not retrofitted.
- **Today:** English only. The code has no i18n setup (no localization library, strings inline).
- **"All available" needs a concrete list before phase 3.** Proposal: every language Google's ML Kit offline translation supports (about 59), since the app already uses it for non-English search on Android (`MODELS.md`), plus the store's own localizations for listing text. Confirm or trim that list; it sets translation cost and QA scope.
- **Search:** on Android, searching in another language already works by translating the query to English on the phone (about 30 MB download per language). On iOS and in Expo Go search is English only, as the index is Android-only (see parity list).
- **Also to handle:** right-to-left layouts (Arabic, Hebrew, Persian, Urdu), plural and date/number formats, longer strings in buttons and the paywall, and per-language store listings and screenshots.

## Required store features (from PRIVACY.md / phase 2)
- [x] Sign in with Apple: not needed, no third-party login.
- [x] In-app account deletion: not needed, no accounts.
- [ ] Privacy manifest: `ios.privacyManifests` not declared in `app.json`; the iOS build needs it.
- [x] App Tracking Transparency: not needed if no tracking. Confirm once an analytics SDK is chosen (none installed today).

## Success metrics
There is no analytics SDK in the app yet, so none of these can be measured today. Targets are proposals to confirm.
- **Activation event:** first dump exported or posted (saved to the PicDump album or shared).
- **D1 / D7 retention target:** proposed D1 35%, D7 15%. Unvalidated; set after a first cohort.
- **Paywall conversion target:** proposed 3 to 5% of installs start a trial or subscription. Reference points in the monetization spec: hard paywall 10.7% trial-to-paid at D35 versus 2.1% freemium.
