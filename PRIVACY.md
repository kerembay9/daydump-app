# PicDump — Data inventory

Source for App Privacy labels (Apple), Data safety (Play) and the privacy policy. Update in the same change as any new network call, SDK or permission.

Audited 2026-10-29 against `package.json`, `app.json`, the Android manifest, `modules/clip-embedder`, and a search of `src/` and `modules/` for network calls. Release builds only; debug-only tools are listed at the end.

## Data collected
| Data type | Purpose | Stored where | Leaves the device? | Third party | Linked to user? | Optional? |
|---|---|---|---|---|---|---|
| Photos and videos in the gallery | Index, suggestions, search, Tidy, editing | Read in place; not copied | No | — | No | No (core feature) |
| Photo metadata (date, GPS location from EXIF, album) | Group photos into trips and days; city names come from an offline list | On device (index) | No | — | No | No |
| Photo index (tags, embeddings, face data for the selfie finder) | Suggestions, search, Tidy, sensitive-photo hiding | On device (SQLite, private app storage) | No | — | No | No |
| Profile (name, handle, optional profile photo, selfie) | Personalise dumps, selfie finder | On device | No | — | No | Yes |
| Dumps, drafts, Library, settings, unlock state | The product | On device (private storage, AsyncStorage) | No | — | No | No |
| Exported slides | Posting | "PicDump" album in the gallery | Only when the user shares them | The app the user picks (Instagram, TikTok, WhatsApp, system share sheet) | n/a | Yes |
| Search text typed by the user | Natural-language search | Memory only | No. Translation to English runs on device (ML Kit). | — | No | Yes |
| Anonymous app user ID, purchase and receipt data (product, date, status) | Check and restore the Pro subscription | RevenueCat | Yes | RevenueCat | Yes (to the anonymous ID) | Yes (only if the user buys) |
| IP address, device and OS info seen by the purchase SDK | Delivered with the purchase and entitlement requests | RevenueCat | Yes | RevenueCat | Yes | Yes (only on paywall and subscription checks) |
| Model files (not user data) | Download of on-device model packs and per-language translation models | Private app storage | Download only: the request reaches Google, which sees the device and IP. No user data is sent. | Google Play (Play Feature Delivery) and Google ML Kit | No | Language models: yes, on first non-English search |

No account, no analytics, no crash reporting, no ads and no advertising ID. Store-side crash and vitals data that Google Play and Apple collect on their own are outside the app.

## SDKs and services
| SDK / service | Data it receives | Policy URL |
|---|---|---|
| RevenueCat (`react-native-purchases`) | Anonymous app user ID, receipts, purchase status, IP, device info | https://www.revenuecat.com/privacy/ |
| Google Play Billing / Apple StoreKit (via RevenueCat) | Payment handled by the store; the app never sees card details | https://policies.google.com/privacy , https://www.apple.com/legal/privacy/ |
| Google Play Feature Delivery (`com.google.android.play:feature-delivery`) | Downloads model packs and the translate module on demand | https://policies.google.com/privacy |
| Google ML Kit translate and language-id (release: on demand; debug: compiled in) | Downloads a translation model per search language. Language ID and translation run on device. | https://developers.google.com/ml-kit/android-data-disclosure |
| ONNX Runtime / LiteRT (`modules/clip-embedder`) | Nothing; local inference only | — |
| Expo modules (`expo-media-library`, `expo-notifications`, `expo-sharing`, `expo-image-picker`, `expo-sqlite`) | Nothing leaves the device | — |

## Permissions
| Permission | Why | Usage string (iOS) |
|---|---|---|
| Photos / `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_VISUAL_USER_SELECTED` (Android), legacy `READ_EXTERNAL_STORAGE` | Read the gallery for the index and suggestions | "Allow PicDump to access your photos to curate daily aesthetic carousels." |
| `WRITE_EXTERNAL_STORAGE` (legacy) | Save exported slides to the PicDump album | "Allow PicDump to save curated posts to your gallery." |
| `ACCESS_MEDIA_LOCATION` | Read photo GPS tags to group trips | (iOS reads location from photo metadata under the photos permission) |
| `POST_NOTIFICATIONS` | Optional 8 PM recap and Sunday week recap, scheduled on the phone | — |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` (Android) | Keep indexing running while the screen is off | — |
| `READ_MEDIA_AUDIO` | Listed in `app.json` but nothing in the app plays or reads audio. Likely unnecessary; Play may question it. | — |
| Package visibility `<queries>`: Instagram, TikTok, WhatsApp | Show which posting apps are installed | — |

## Tracking
- Tracks across other companies' apps or sites? **No.** No ATT prompt needed. Re-check if an analytics or attribution SDK is ever added.

## Accounts
- Users can create accounts? **No.** No sign-in, no Apple sign-in requirement, no account-deletion requirement.
- Deletion path in the app: not applicable. All data is on the device; clearing app storage or uninstalling removes it.
- Web deletion URL (Play requires one): not required without accounts.

## Gaps found in this audit
1. **Model downloads were missing from the policy.** Fixed 2026-10-29: the privacy text now says model packs come through Google Play and non-English search downloads about 30 MB per language from Google, with no photos, tags or search words sent. Edited in `src/components/LegalModal.tsx` and `lib/picdump-legal.ts` (landing repo branch `picdump-legal-downloads`, local, not pushed).
2. **App text was Android-worded while the hosted text was neutral.** Fixed 2026-10-29: the in-app text now equals the hosted text word for word (29 sections checked). Still open: the policy describes on-device features that the iOS app does not have yet (see the iOS gap in `APP_STATE.md`); nothing is uploaded either way, but revisit once the iOS decision is made.
3. **Stale `PRIVACY_POLICY.md` at the repo root.** It describes the old DayDump app: Gemma via MediaPipe, an optional Gemini API key, "diagnostic logs", `support@daydump.app`. None of that matches the app. It contradicts the in-app policy ("no analytics, no crash-reporting"). Delete it or replace it with the hosted text. `TERMS_OF_SERVICE.md` at the root probably has the same problem; not yet checked.
4. **`allowBackup="true"` on Android.** Device backup can copy the app's private data, including the photo index, to the user's Google account. The in-app policy covers backups generally; confirm that matches what you want, or set `allowBackup` to false.
5. **iOS privacy manifest missing** (`ios.privacyManifests` not in `app.json`). Needed for the required-reason APIs the React Native and Expo modules use.
6. **Duplicate and extra Android permissions** in `app.json` (`READ_MEDIA_AUDIO` is unused).

Debug-only, not in release builds: Model bench downloads a Gemma model from `huggingface.co` (gated by `__DEV__` in Profile). It does not run in a store build.

## Public URLs
- Privacy policy: `https://www.horizonzeta.com/privacy-policy/PicDump` (returns 200 on 2026-10-29; effective 29 October 2026). Not yet entered in the stores (P8.10).
- Terms: `https://www.horizonzeta.com/terms-of-service/PicDump` (200).
- Support page (a web page, not a mailto): `https://www.horizonzeta.com/picdump/support` (200).
- Marketing URL: `https://www.horizonzeta.com`.

## Provider
HORIZON ZETA ARAŞTIRMA GELİŞTİRME TEKNOLOJİ BİLİŞİM DANIŞMANLIK VE SAĞLIK SANAYİ TİCARET A.Ş., Üniversite Mah. İpekyolu Cad. Ata Teknokent AŞ A Blok No: 22 İç Kapı No: 118, Yakutiye/Erzurum, Türkiye. Contact: info@horizonzeta.com (as in the in-app policy).
