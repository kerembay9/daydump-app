# 0006. Expo with generated native projects, built on EAS

- **Status:** accepted
- **Date:** 2026-10-29 (recorded)
- **Deciders:** Kerem Bayramoglu

## Context
One codebase targets iOS and Android, with one custom native module (`clip-embedder`), config plugins for icons and release signing, and Play asset packs.

## Options
1. **Expo with Continuous Native Generation (CNG)** — `ios/` and `android/` generated from `app.json` and plugins, gitignored. Builds on EAS.
2. **Bare React Native** — hand-edited native folders. More control, more upgrade pain.

## Decision
Expo SDK 57 (React Native 0.86, new architecture only), CNG, config plugins (`plugins/withReleaseSigning.js`, `withAppIcons.js`, `modules/clip-embedder/app.plugin.js`), EAS project `horizonzeta/picdump`. Expo Router for navigation. Dependencies change only through `npx expo install`.

## Consequences
- Easier: SDK upgrades, reproducible native projects, cloud iOS builds without local Xcode.
- Harder: native changes must be expressed as plugins; the Android release key is built into the generated Gradle by a plugin and the keystore must be present locally or Play signing must be reset.
- Revisit if a native need cannot be written as a config plugin.
