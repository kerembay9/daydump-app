# PicDump Production Release & Signing Guide

This document contains the signing credentials and release artifacts for **PicDump** (`com.horizonzeta.picdump`).

---

## 1. Production Signed Artifact

The production-ready **Android App Bundle (`.aab`)** is compiled and signed at:
```
android/app/build/outputs/bundle/release/app-release.aab
```
* **Size:** ~62 MB (optimized split APKs delivered by Google Play Store will be ~25-35 MB per user device).
* **Format:** Google Play Store App Bundle (`.aab`) — ready for direct upload to **Google Play Console** (Internal, Closed, or Production track).

---

## 2. Keystore Signing Details

* **Keystore File Location:** `daydump-release.keystore` at the repo root (gitignored). `plugins/withReleaseSigning.js` points the release build at it, so `expo prebuild` keeps signing
* **Keystore Type:** PKCS12 (2048-bit RSA)
* **Key Alias:** `daydump-key-alias`
* **Passwords:** not stored in the repo. Put them in `~/.gradle/gradle.properties` as `PICDUMP_UPLOAD_STORE_PASSWORD` and `PICDUMP_UPLOAD_KEY_PASSWORD` (the names `plugins/withReleaseSigning.js` reads), and keep a copy in the password manager. An earlier version of this file listed them in plain text and that version is in the public git history, so treat the old passwords as burned: the next upload key (for example after an upload key reset in Play Console) gets new ones.
* **Validity:** 10,000 days (~27 years)

> [!CAUTION]
> Keep `daydump-release.keystore` safe! If you lose this keystore file, Google Play will not allow you to publish updates to your existing app without contacting Google Developer Support.

---

## 3. How to Build New Releases in the Future

Whenever you make code updates and want to build a new release bundle:

1. Bump `expo.android.versionCode` in `app.json` by 1 (every upload), then run `npx expo prebuild -p android` to sync it into `android/app/build.gradle`. Only change `expo.version` when preparing a release (see AGENTS.md → Versioning).
2. Bundle the latest JS:
   ```bash
   npx expo export:embed --platform android --dev false --entry-file index.ts --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/
   ```
3. Run Gradle release bundle:
   ```bash
   cd android && ./gradlew bundleRelease
   ```
4. Upload `android/app/build/outputs/bundle/release/app-release.aab` to Google Play Console.
