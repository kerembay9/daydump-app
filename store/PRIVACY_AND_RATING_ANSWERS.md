# Store declarations: proposed answers

Draft 2026-10-29 for P8.5 (App Privacy, Data safety) and P8.6 (age and content rating). Source: `PRIVACY.md`. Nothing here has been entered in a console yet; the owner approves each table first. Update this file and `PRIVACY.md` together.

## P8.5 Apple: App Privacy

Photos, GPS tags from photos, the photo index, face data, profile, dumps and search text are processed on the device and never sent to us or a third party, so none of them is "collected" in Apple's sense.

| Apple data type | Collected? | Linked to user? | Used for tracking? | Purposes | Source |
|---|---|---|---|---|---|
| Purchases → Purchase History | Yes | Yes (see note) | No | App Functionality, Analytics | RevenueCat receives receipts and purchase status |
| Identifiers → User ID | Yes | Yes | No | App Functionality | RevenueCat anonymous app user ID |
| Photos or Videos | No | | | | On-device only |
| Location (including photo GPS tags) | No | | | | Read from photo metadata on the device only |
| Contact Info, Health, Financial Info, Sensitive Info, Contacts, User Content, Browsing, Search History | No | | | | Search text and typed text stay on the device |
| Usage Data, Diagnostics | No | | | | No analytics or crash SDK today. Revisit when P6.6 and P6.7 add them. |

Note on "linked": RevenueCat's own guidance says Purchase History can be declared "not linked" when only anonymous IDs are used. The anonymous ID is stable per install and is attached to the purchase history, so I propose the conservative answer (linked, with User ID declared). Over-declaring is safe; under-declaring risks a mismatch with what the SDK sends. Tracking is "No" for everything: no advertising SDK, no data brokers, no IDFA.

## P8.5 Google Play: Data safety

| Question | Answer |
|---|---|
| Does the app collect or share any user data? | Yes (purchase data only) |
| Data types collected | Financial info → Purchase history; Device or other IDs (RevenueCat anonymous app user ID) |
| Data shared with third parties? | No. RevenueCat processes it on our behalf as a service provider, which Play does not count as sharing. |
| Purposes | App functionality (entitlement and receipt validation), Analytics (RevenueCat dashboard) |
| Is collection required or optional? | Required for the subscription feature |
| Photos and videos, Files, Location | Not collected. The app reads them, but processing stays on the device. |
| Encrypted in transit? | Yes (HTTPS) |
| Can users request deletion? | Yes, by email to info@horizonzeta.com. Local data is removed by clearing app storage or uninstalling. |
| Independent security review? | No |

Play requires the privacy policy URL on this form: `https://www.horizonzeta.com/privacy-policy/PicDump`.

## P8.6 Apple: age rating

All content questions answered None or No: violence, sexual content or nudity, profanity, horror, alcohol or drugs, gambling, medical or health information, contests. Unrestricted web access: No. User-generated content: No (a user's photos are not shared inside the app). Messaging or chat between users: No. Advertising: No. Expected rating: 4+.

PicDump's own terms say 16 and over; Apple's rating is separate and does not need to match.

## P8.6 Google Play: content rating (IARC) and audience

| Question | Answer |
|---|---|
| Category | Utility, Productivity, Communication or Other |
| Violence, sexual content, profanity, controlled substances, gambling | No |
| Users can interact or share content with each other inside the app | No (sharing goes to other apps through the system share sheet) |
| Shares the user's location with others | No |
| Allows digital purchases | Yes (subscriptions) |
| Expected result | Everyone / PEGI 3, with a digital purchases note |
| Target audience | 16 and over (age groups 16-17 and 18+). Not for children, so Families policy does not apply. |
| Contains ads | No |
| App access | No login needed; all features reachable without credentials |

## Entry log and corrections (2026-10-29)

Entered:
- Play en-US listing (title, short and full description) via the API, from `store/listing/en-US.md`.
- Play Privacy policy URL and "Contains ads: No" in App content, staged in Publishing overview (not sent for review).

Found already done, left alone:
- Apple age rating: every answer was already None / No and the computed rating is 4+, as proposed above.
- Apple en-US listing, support URL, marketing URL and privacy URL: already entered, with iOS-specific copy (it does not promise Tidy, search or Bingo, which iOS lacks, and it mentions a 7-day trial on the yearly plan). `store/listing/en-US.md` is the **Play** copy. Do not paste it over the App Store listing.

Corrections to the answers above:
- **Play "Sign in details" (formerly App access) must be "Yes", not "No".** The form says an app with payments, subscriptions or access tiers counts as restricted, and Google reviewers cannot buy anything. It needs instructions for the reviewer (P8.7, human). Target audience stays blocked until this is done.

Not yet covered by the answers above (Play App content also asks):
- Advertising ID, government app, financial features, health features: expected No / None / None / None. Confirm the advertising ID answer against the merged manifest first (an SDK can add `AD_ID`).
- Foreground service permission declaration (`dataSync`, used for background indexing) needs a description and a short video or explanation.
- Photo and video permissions declaration (`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`) asks for the app's core functionality. Google may push an app like this toward the system photo picker, so this one can fail review; it needs a deliberate answer.
- Apple App Privacy and Play Data safety forms are not entered yet.

## Play reviewer access (2026-10-29)

- Sign in details answered **Yes** (the form counts subscriptions as restricted content) and saved in App content, staged and not sent for review. Instructions: no login needed, free features work, Pro can be reviewed by redeeming a promo code. Ticked "provides full access including premium content".
- To make that possible, `picdump_yearly`'s base plan `yearly-plan` was marked backwards compatible ("Use for deprecated billing methods"). Verified through the Play API: `legacyCompatible: true`. Nothing else on the plan changed. Play promo codes only work for a backwards-compatible subscription.
- Promotion "App review access" (ID 131615938): 5 one-time codes, 30-day free trial on `picdump_yearly`, Nov 3, 2026 to Feb 3, 2027. A custom code was not used because Play requires at least 2,000 redemptions for those.
- The five codes are in the Play Console promotion (Download codes) and in the saved Sign in details text. They are not stored in this repo.
- Google's form says reviewers cannot use free trials. These codes grant a free trial, so Google may still ask for another way to see Pro features. If so, reply with a walkthrough or give a code for a full-price entitlement.

## Play App content entries (2026-10-29), all staged in Publishing overview, none sent for review

Saved: Privacy policy URL, Ads (No), Sign in details (Yes, with promo codes), Target audience (16-17 and 18 and over), Data safety, Advertising ID (No), Government apps (No), Financial features (none), Health apps (none).

Data safety as entered:
- Collects or shares required data types: Yes. Encrypted in transit: Yes. Account creation: "My app does not allow users to create an account"; login with outside accounts: No.
- Data types: Financial info > Purchase history; Device or other IDs. Both collected, not shared, not ephemeral, required, purposes App functionality and Analytics. Preview shows "No data shared with third parties".
- Deviation from the proposal above: the "users can request deletion" question is left unanswered. Answering Yes requires a web "Delete account URL" or "Delete data URL", and PicDump has only an email contact. Add a deletion page to the support site if you want to answer it.
- Advertising ID answered No on the strength of the source manifest and dependency list; the release AAB's merged manifest was not inspected.

Still open in Play App content:
- **Content ratings**: starting the IARC questionnaire means agreeing to IARC's Terms of Service. Answers are ready (all No, digital purchases Yes).
- **Foreground service permissions** (`dataSync`, background indexing): needs a description and a demonstration.
- **Photo and video permissions** (`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`): Google asks whether photo access is core functionality and may steer the app to the system photo picker. Needs a deliberate answer.

## Content rating and the two declarations left (2026-10-29)

Content rating saved (staged): category All Other App Types, contact info@horizonzeta.com, IARC terms accepted by the owner. Results: ESRB Everyone, PEGI 3, USK all ages, Brazil 14+, 3+ elsewhere, "In-App Purchases" noted. Answers: downloaded content No, user interaction No, online content No, age-restricted products No, location sharing No, digital purchases Yes (loot boxes No), rewards No, browser No, news or education No.

Left in Play App content:
- **Foreground service permissions** (`FOREGROUND_SERVICE_DATA_SYNC`). The form asks which task needs it (proposed: Local processing > Other), a **video link** demonstrating the feature, and a description. A short screen recording is needed (indexing keeps running with the screen off, visible through the notification); it must be hosted at a link (for example an unlisted YouTube video). Not something I can produce.
- **Photo and video permissions.** Two 250-character boxes, one per permission.
  - `READ_MEDIA_IMAGES` draft (about 235 characters): "PicDump suggests photo dumps by indexing the whole camera roll on the device (dates, places, similar shots). A one-time picker cannot give this library-wide access, and nothing is uploaded. Without it Discover, Tidy and Bingo cannot work."
  - `READ_MEDIA_VIDEO`: the PRD says photos only, so there is no honest reason for this permission. Better to remove `READ_MEDIA_VIDEO` (and the unused `READ_MEDIA_AUDIO`) from `app.json` and from the duplicate Android permission list, then rebuild, instead of justifying them. Then this form only covers images.

## iOS and TestFlight state (2026-10-29)

- Build 4 (version 0.0.6) is processed (VALID) and in internal TestFlight testing; group "Internal" has access to all builds, tester kerembay9@gmail.com has it INSTALLED. No external group, no beta review submitted. Encryption declared as no non-exempt encryption.
- Version 1.0 in App Store Connect (PREPARE_FOR_SUBMISSION) has no build attached yet; APP_STATE.md says to set `expo.version` 1.0.0, rebuild iOS (build 5), rename the record and attach it at release time.
- TestFlight beta details saved via API: contact Kerem Bayramoglu, info@horizonzeta.com, +905369124960 (public company phone), no demo account needed, reviewer notes (no account, photo access, optional sandbox subscription). en-US TestFlight description, feedback email, marketing and privacy URLs entered.
- **App Store review information (version 1.0) is NOT set.** `app_versions_set_review_details` fails with a parsing error on this app (likely the version has no review-detail record yet). Enter it in the App Store Connect web UI under App Review Information: same contact, "Sign-in required" off, and these notes: "No account or sign-in exists in PicDump, so no demo account is needed. Everything is available on first launch; the app asks for photo library access during onboarding and works on the photos on the device. Photos are not uploaded anywhere. PicDump Pro is an optional auto-renewing subscription (weekly or yearly, 7-day free trial on the yearly plan) sold through the App Store with RevenueCat. Free features work without buying anything. To test Pro, open the paywall from any locked dump or from Profile and use a sandbox account; Restore Purchases is on the paywall. Terms of Service and Privacy Policy are linked on the paywall and in Profile."
- **Apple App Privacy is NOT entered**: App Store Connect in the built-in browser is signed out. Answers are in the App Privacy section above.
