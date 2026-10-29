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
