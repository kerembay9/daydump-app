# 0003. Skia draws photos and filters

- **Status:** accepted
- **Date:** 2026-10-29 (recorded)
- **Deciders:** Kerem Bayramoglu

## Context
The Edit screen applies film looks, textures, borders and per-slide crop to photos and exports slides as images. It needs GPU-speed filters, live preview and pinch/drag crop at 60 fps.

## Options
1. **`@shopify/react-native-skia`** — shaders and color filters on the UI thread, offscreen export, works with Reanimated gestures. Cons: a large native dependency.
2. **`expo-image-manipulator` only** — simple, but no live shader effects; used today for resizing and cropping only.
3. **Native Android and iOS image code** — fast but doubles the work.

## Decision
Skia (`@shopify/react-native-skia` 2.6.2) for rendering and filters, `react-native-reanimated` and `react-native-gesture-handler` for gestures. `expo-image-manipulator` stays for plain transforms.

## Consequences
- Easier: one cross-platform render path for preview and export; Pro looks and textures are shaders.
- Harder: Skia and Reanimated upgrades must move with the Expo SDK; larger app size.
- Revisit if Skia blocks an SDK upgrade or export memory becomes a problem.
