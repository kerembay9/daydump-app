# Key screens: where each is designed

P4.3 asks for onboarding, home, the core flow, the paywall and settings to be designed. This maps each to its design source and says where there is none. Checked 2026-10-30. The code wins over a mock if they disagree (BRAND_GUIDELINES.md).

| Screen | Code | Design source | Status |
| :--- | :--- | :--- | :--- |
| Onboarding (hook, privacy, notify, profile) | `src/components/OnboardingModal.tsx`, `ProfileStep.tsx` | `design/onboarding-motion.html`, `profile-step-preview.html`, `profile-step-selfie.html` | Mocked and built. Does not use the new logo yet. |
| Home (Discover) | `src/app/(tabs)/index.tsx` | none in `design/`; the mock lives in the original spec (`spec.json`, referred to in `src/theme/tokens.ts`) | Built; no mock in this repo. |
| Today and Bingo | `src/app/today.tsx` | `design/today-album.html`, `today-layout.html`, `today-options.html` | Mocked and built. |
| Core flow: Create | `src/app/(tabs)/create.tsx` | `design/basket-throws.html` | Mocked and built. |
| Core flow: Edit | `src/app/edit/[id].tsx`, `src/components/edit/` | `design/edit-layout.html`, `edit-photo.html`, `edit-steppers.html`, `edit-review.md` | Mocked and built. |
| Core flow: Preview, Library | `src/app/preview/[id].tsx`, `src/app/(tabs)/library.tsx` | none | Built; no mock. |
| Tidy | `src/app/(tabs)/tidy.tsx`, `src/app/tidy/` | none | Built; no mock. |
| Paywall | `src/components/PaywallModal.tsx` | rules in `docs/superpowers/specs/2026-10-28-monetization-design.md`, no visual mock | Built; no mock. |
| Settings (Profile) | `src/app/profile.tsx` | none | Built; no mock. |

## Gaps

- No mock exists for Home, Preview, Library, Tidy, the paywall or Settings; they were built straight in code from the shared theme and components.
- The new logo appears nowhere inside the app yet (only as launcher icon and splash). Onboarding's first page, Profile's about row and the paywall header are the natural places; that is a design decision.
- `screenshots/` holds four older marketing cards (hook, frames, privacy, captions) made before the logo; they should be remade for the stores (P8.2).

Whether the built screens count as "designed" is the owner's call at P4.6 (design approval); the honest evidence is screenshots of the running app, which need a device or emulator.
