# DayDump Production Release & Signing Guide

This document contains the signing credentials and release artifacts for **DayDump** (`com.daydump.app`).

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

* **Keystore File Location:** `android/app/daydump-release.keystore`
* **Keystore Type:** PKCS12 (2048-bit RSA)
* **Key Alias:** `daydump-key-alias`
* **Store Password:** `daydump2026`
* **Key Password:** `daydump2026`
* **Validity:** 10,000 days (~27 years)

> [!CAUTION]
> Keep `daydump-release.keystore` safe! If you lose this keystore file, Google Play will not allow you to publish updates to your existing app without contacting Google Developer Support.

---

## 3. How to Build New Releases in the Future

Whenever you make code updates and want to build a new release bundle:

1. Update the `versionCode` (e.g., from `1` to `2`) and `versionName` (e.g., `"1.0.1"`) in `android/app/build.gradle`.
2. Bundle the latest JS:
   ```bash
   npx expo export:embed --platform android --dev false --entry-file index.ts --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/
   ```
3. Run Gradle release bundle:
   ```bash
   cd android && ./gradlew bundleRelease
   ```
4. Upload `android/app/build/outputs/bundle/release/app-release.aab` to Google Play Console.
