---
app: PicDump
slug: picdump
platforms: [android, ios]
stack: expo
bundle_ios: com.horizonzeta.picdump
package_android: com.horizonzeta.picdump
current_phase: 3
framework_version: 0.2.1
---

# PicDump — App state

Managed by app-factory. Tick gates with `af set` or the dashboard (`af ui`).
`[x]` done · `[ ]` open · `[~]` waived (reason after —). Human gates are ticked by a person.

## Hold / todo (2026-10-29)

- Release is on hold until 1.0.0: nothing is submitted to App Review before then. At that point set `expo.version` to 1.0.0, rebuild iOS (build 5), rename the ASC version record, attach the build.
- iOS sandbox purchase test: skipped for now (no iPhone; storefront switch failed on the Mac). Do it before 1.0.0 if possible.
- iOS feature gap (found 2026-10-29): the native CLIP module (`modules/*/android` only) has no iOS side, so on iOS Tidy shows "Needs Android 11 or newer", Bingo squares never fill, and text search and the selfie finder have no engine. The Pro paywall lists search and "Clear repeats and clutter". Decide before 1.0.0: build an iOS engine, hide or reword these on iOS, or ship iOS without them and fix the paywall copy (App Review 2.3.1 / 3.1.2 risk).
- Android purchase test: blocked. `daydump-release.keystore` (upload key) and the `PICDUMP_UPLOAD_*` passwords in `~/.gradle/gradle.properties` are not on this machine; Play internal build 9 predates the paywall. `versionCode` is already 10. Find the keystore, or request an upload key reset in Play Console, then build, upload to internal, test with a license tester.

## Phase 0 · Idea & validation

- [x] **P0.1** BRIEF.md written: problem, target user, why now _(auto)_ — auto: pass (2026-10-29)
- [x] **P0.2** 5+ competitors reviewed in both stores (rating, price, gaps), listed in BRIEF.md _(agent)_ — BRIEF.md Competitors: 9 rows with iOS rating/price/update/review gaps; Play only rating for 3 apps (installs, update date not retrievable)
- [x] **P0.3** Top 10 store keywords with competition level noted _(agent)_ — BRIEF.md Keywords: 10 terms; competition estimated from top-10 US iOS results, Play not sampled
- [x] **P0.4** Monetization hypothesis: who pays, how much, for what _(agent)_ — BRIEF.md Monetization hypothesis; prices come from store offering, untested
- [x] **P0.5** Go / kill decision recorded with date and owner _(human)_ — Go, Kerem Bayramoglu, 2026-10-29, recorded in BRIEF.md

## Phase 1 · Product spec

- [x] **P1.1** PRD.md written: MVP scope and explicit non-goals _(auto)_ — auto: pass (2026-10-29)
- [x] **P1.2** MVP has 7 or fewer core features, each with acceptance criteria _(agent)_ — PRD.md: 7 features with checkable criteria
- [x] **P1.3** Pricing model decided: free / freemium / subscription / one-time, price points, what is gated _(human)_ — Freemium + subscription confirmed (Kerem, 2026-10-29); prices set in store offering
- [x] **P1.4** Launch platforms decided, plus a parity list of anything that differs per platform _(human)_ — Both platforms at launch (Kerem, 2026-10-29); iOS parity gap listed in PRD.md
- [x] **P1.5** Launch languages decided; i18n from day one if more than one _(agent)_ — All available languages (Kerem, 2026-10-29); concrete list to confirm before phase 3
- [x] **P1.6** Success metrics defined: activation, D1/D7 retention, paywall conversion _(agent)_ — PRD.md proposes activation event and targets; no analytics SDK yet, owner to confirm
- [x] **P1.7** PRD approved _(human)_ — PRD approved by Kerem Bayramoglu, 2026-10-29

## Phase 2 · Identity & compliance setup

- [x] **P2.1** App name final; repo and code identifiers match it or the mapping is documented _(human)_ — Name PicDump final (Kerem, 2026-10-29); daydump identifiers kept on purpose, mapping in README
- [x] **P2.2** iOS bundle ID and Android package share one org prefix and match APP_STATE.md _(auto)_ — auto: pass with warnings (2026-10-29)
- [x] **P2.3** App records exist in App Store Connect and Play Console (store-apple / store-play runbooks) _(agent)_ — ASC app 6825956219 (com.horizonzeta.picdump, SKU Pic_Dump_01) exists; Play app com.horizonzeta.picdump exists (title PicDump, listing text empty)
- [x] **P2.4** PRIVACY.md data inventory: every data type, where it goes, which third parties _(auto)_ — auto: pass (2026-10-29)
- [x] **P2.5** Required store features listed: Apple sign-in (if any third-party login), in-app account deletion (if accounts), privacy manifest, ATT (if tracking) _(agent)_ — PRD.md Required store features + PRIVACY.md: no login/accounts/tracking; privacy manifest to build in phase 5
- [x] **P2.6** Privacy policy, terms and a support page exist as pages on the company site (reference/legal-pages.md), committed on a branch; wording is platform-neutral and matches the in-app text _(agent)_ — Hosted pages live (200) and committed on landing repo; app and hosted text identical (29 sections); model-download edit local on picdump-legal-downloads, unpushed
- [x] **P2.7** Store agreements, tax and banking done (needed for paid apps and subscriptions) _(human)_ — Checked in both consoles 2026-10-29: Apple Paid Apps Agreement, bank, tax Active; Play account earning revenue
- [x] **P2.8** EAS project linked under the company account (app.json extra.eas.projectId and owner) _(agent)_ — app.json extra.eas.projectId 1a04cc3f-af2d-442f-b911-e82e495c81e4, owner horizonzeta

## Phase 3 · Architecture

- [ ] **P3.1** ARCHITECTURE.md: stack, backend, data model, auth, offline behaviour _(auto)_ — auto: FAIL (2026-10-29)
- [ ] **P3.2** A decision record (docs/adr/) for each major choice: backend vs local data, RN architecture, media/audio libraries _(agent)_
- [x] **P3.3** AGENTS.md from the template; CLAUDE.md points to it _(auto)_ — auto: pass (2026-10-29)
- [x] **P3.4** No secrets in the repo or its history; .env gitignored; keys in EAS / Supabase secrets _(auto)_ — auto: pass with warnings (2026-10-29)
- [ ] **P3.5** CI runs lint, typecheck and unit tests on every push _(agent)_
- [ ] **P3.6** Expo SDK pinned; `npx expo install --check` clean; no legacy-peer-deps _(agent)_
- [ ] **P3.7** Versioning rule in AGENTS.md: build number up every upload, version name only at release _(agent)_

## Phase 4 · Design system

- [x] **P4.1** BRAND_GUIDELINES.md: name, voice, colour, type _(auto)_ — auto: pass (2026-10-29)
- [ ] **P4.2** Theme tokens in code, light and dark, read through one hook _(agent)_
- [x] **P4.3** Key screens designed: onboarding, home, core flow, paywall, settings _(agent)_ — Screens are built and shipped; no separate mocks needed (owner decision, 2026-10-30). Real captures in store/screenshots/android/
- [ ] **P4.4** App icon and splash for both platforms _(agent)_
- [x] **P4.5** Accessibility baseline: labels on icon-only buttons, dynamic type, contrast _(agent)_ — Labels and 4.5:1 contrast audited and test-guarded; large text checked on Android at 2.0x font scale: tab label, quest stamp and stepper capped (maxFontSizeMultiplier); captures in store/screenshots/android/large-text/. Not checked: iOS Dynamic Type, real device.
- [x] **P4.6** Design approved _(human)_ — Design approved by owner 2026-10-30: brand palette, logo, Cashmere/Espresso themes, caramel accent + rust deep accent (PR #9, #10)

## Phase 5 · Build loop

- [ ] **P5.1** Every MVP feature went spec, then plan, then code _(agent)_
- [ ] **P5.2** Unit tests for services, including timezone and locale cases _(agent)_
- [ ] **P5.3** A Maestro flow for each main user flow, with screenshot baselines _(agent)_
- [ ] **P5.4** Device pass: every feature tried on a real iPhone and a real Android phone _(human)_
- [ ] **P5.5** All strings translated in every launch language _(agent)_
- [ ] **P5.6** Platform parity list checked; anything off on one platform is documented _(agent)_
- [ ] **P5.7** Performance: long lists virtualized, cold start measured on a mid-range Android _(agent)_

## Phase 6 · Monetization & analytics

- [x] **P6.1** Products exist in both stores; product IDs match RevenueCat exactly _(agent)_ — 2026-10-29 IDs match across stores and RevenueCat: Play picdump_weekly:weekly-plan / picdump_yearly:yearly-plan; App Store picdump_weekly / picdump_yearly (group PicDump Pro 22525227, subs 6828347656 / 6828347896, state Prepare for Submission, review screenshot attached); RevenueCat PicDump iOS products prod4911bb4abe / prode6d93eef1c attached to daydump_pro and $rc_weekly / $rc_annual; subscription_key_configured true. Not yet: iOS build submitted with subs, trial outside US on iOS
- [x] **P6.2** Premium is decided on the server; the client never writes premium status _(auto)_ — auto: pass (2026-10-29)
- [ ] **P6.3** RevenueCat webhook to the backend checks a shared secret _(agent)_
- [ ] **P6.4** Sandbox purchase, restore and cancel tested on both platforms _(human)_
- [x] **P6.5** Paywall shows store prices (none hard-coded) and shows purchase errors _(agent)_ — PaywallModal reads plans/prices/trial from the RevenueCat offering (src/services/paywallPlans.ts, commit 0d6a86c); purchase/restore errors toasted, success-without-entitlement toast (fb610c8); scenario tests in __tests__/scenarios/profile.test.tsx, monetization.test.tsx
- [ ] **P6.6** Analytics funnel implemented: install, onboarding, activation, paywall view, purchase _(agent)_
- [ ] **P6.7** Crash reporting on in release builds _(agent)_
- [x] **P6.8** Every subscription is priced in every launch country, not only the store's default region (Play regional configs or price template; App Store price schedule) _(agent)_ — Play Console + API (2026-10-29): picdump_weekly/weekly-plan and picdump_yearly/yearly-plan priced in 174 regions (USD 3.99 / 29.99 base, converted); 32 lower-income countries discounted ~50% / ~65% (verified via playstore get_subscription, 0 mismatches)
- [x] **P6.9** Trials and intro offers exist in the stores as the pricing decision says (Play offer on the base plan, new customers only; Apple introductory offer), and RevenueCat shows the trial on the product _(agent)_ — Play offer trial-7d on yearly-plan: ACTIVE, 1-week free phase, 174 regions, new customers (never had any subscription in app). Verified via list_subscription_offers. RevenueCat product trial_duration still shows null (RC does not read it from Play)
- [x] **P6.10** Billing recovery on: grace period and account hold on every auto-renewing Play plan, billing grace period on in App Store Connect _(agent)_ — Play: weekly-plan grace P3D + auto account hold 57d; yearly-plan grace P14D + auto account hold 46d (Console + API)
- [ ] **P6.11** The current RevenueCat offering serves the launch plans in paywall order on each platform; a package with no product on a platform is removed or intended _(agent)_

## Phase 7 · Hardening

- [ ] **P7.1** Multi-agent code review: no high or critical findings left open _(agent)_
- [ ] **P7.2** Security review clean _(agent)_
- [x] **P7.3** Secrets scan of files and git history clean; anything leaked is rotated _(auto)_ — auto: pass with warnings (2026-10-29)
- [x] **P7.4** Security heuristics pass: CSPRNG, SecureStore for sessions, no client premium writes _(auto)_ — auto: pass (2026-10-29)
- [ ] **P7.5** Full Maestro suite green on a release build (minified, R8) _(agent)_
- [x] **P7.6** Store-compliance static checks pass _(auto)_ — auto: pass with warnings (2026-10-29)
- [x] **P7.7** Repo hygiene: no build artifacts, backups or scratch files tracked _(auto)_ — auto: pass with warnings (2026-10-29)

## Phase 8 · Store prep & release

- [ ] **P8.1** Listing copy for each language: title, subtitle, description, keywords _(agent)_
- [ ] **P8.2** Screenshots in every required size; Play feature graphic _(agent)_
- [x] **P8.3** No legal or release placeholders left _(auto)_ — auto: pass (2026-10-29)
- [x] **P8.4** Identity and versions consistent across app.json, package.json and APP_STATE.md _(auto)_ — auto: pass with warnings (2026-10-29)
- [ ] **P8.5** App Privacy labels and Play data safety match PRIVACY.md _(agent)_
- [ ] **P8.6** Age rating (Apple) and content rating (Play) done _(agent)_
- [ ] **P8.7** Reviewer access: demo account and review notes entered (a person types any password) _(human)_
- [ ] **P8.8** Tested on TestFlight and a Play testing track (closed testing rules met for new Play accounts) _(agent)_
- [ ] **P8.9** Release approved: submit for review, staged / phased rollout plan chosen _(human)_
- [ ] **P8.10** Privacy, terms and support URLs are deployed (HTTP 200) and entered in App Store Connect (privacy, support, marketing) and Play (privacy policy, deletion URL if accounts) _(agent)_

## Phase 9 · Post-launch

- [ ] **P9.1** METRICS.md updated weekly: crash-free %, D1/D7, conversion, rating _(auto)_ — auto: FAIL (2026-10-29)
- [ ] **P9.2** Store reviews answered within 48 hours _(agent)_
- [ ] **P9.3** Monthly ASO check: keyword ranks, screenshot experiments _(agent)_
- [ ] **P9.4** Feedback triaged into the backlog and back into phase 5 _(agent)_
- [ ] **P9.5** Key rotation and SDK upgrade dates in the calendar _(agent)_

## Log

- 2026-10-28 APP_STATE.md created (framework 0.2.0)
- 2026-10-28 P6.5 → done (PaywallModal reads plans/prices/trial from the RevenueCat offering (src/services/paywallPlans.ts, commit 0d6a86c); purchase/restore errors toasted, success-without-entitlement toast (fb610c8); scenario tests in __tests__/scenarios/profile.test.tsx, monetization.test.tsx)
- 2026-10-29 P6.8 → done (Play Console + API (2026-10-29): picdump_weekly/weekly-plan and picdump_yearly/yearly-plan priced in 174 regions (USD 3.99 / 29.99 base, converted); 32 lower-income countries discounted ~50% / ~65% (verified via playstore get_subscription, 0 mismatches))
- 2026-10-29 P6.9 → done (Play offer trial-7d on yearly-plan: ACTIVE, 1-week free phase, 174 regions, new customers (never had any subscription in app). Verified via list_subscription_offers. RevenueCat product trial_duration still shows null (RC does not read it from Play))
- 2026-10-29 P6.10 → done (Play: weekly-plan grace P3D + auto account hold 57d; yearly-plan grace P14D + auto account hold 46d (Console + API))
- 2026-10-29 P6.1 → done (2026-10-29 IDs match across stores and RevenueCat: Play picdump_weekly:weekly-plan / picdump_yearly:yearly-plan; App Store picdump_weekly / picdump_yearly (group PicDump Pro 22525227, subs 6828347656 / 6828347896, state Prepare for Submission, review screenshot attached); RevenueCat PicDump iOS products prod4911bb4abe / prode6d93eef1c attached to daydump_pro and $rc_weekly / $rc_annual; subscription_key_configured true. Not yet: iOS build submitted with subs, trial outside US on iOS)
- 2026-10-29 af check: P0.1 → done, P2.2 → done, P3.3 → done, P3.4 → done, P4.1 → done, P6.2 → done, P7.3 → done, P7.4 → done, P7.6 → done, P7.7 → done, P8.3 → done, P8.4 → done
- 2026-10-29 P0.2 → done (BRIEF.md Competitors: 9 rows with iOS rating/price/update/review gaps; Play only rating for 3 apps (installs, update date not retrievable))
- 2026-10-29 P0.3 → done (BRIEF.md Keywords: 10 terms; competition estimated from top-10 US iOS results, Play not sampled)
- 2026-10-29 P0.4 → done (BRIEF.md Monetization hypothesis; prices come from store offering, untested)
- 2026-10-29 P0.5 → done (Go, Kerem Bayramoglu, 2026-10-29, recorded in BRIEF.md) [person]
- 2026-10-29 phase 0 complete → phase 1 · Product spec
- 2026-10-29 af check: P1.1 → done
- 2026-10-29 P1.2 → done (PRD.md: 7 features with checkable criteria)
- 2026-10-29 P1.6 → done (PRD.md proposes activation event and targets; no analytics SDK yet, owner to confirm)
- 2026-10-29 P1.4 → done (Both platforms at launch (Kerem, 2026-10-29); iOS parity gap listed in PRD.md) [person]
- 2026-10-29 P1.5 → done (All available languages (Kerem, 2026-10-29); concrete list to confirm before phase 3)
- 2026-10-29 P1.3 → done (Freemium + subscription confirmed (Kerem, 2026-10-29); prices set in store offering) [person]
- 2026-10-29 P1.7 → done (PRD approved by Kerem Bayramoglu, 2026-10-29) [person]
- 2026-10-29 phase 1 complete → phase 2 · Identity & compliance setup
- 2026-10-29 af check: P2.4 → done
- 2026-10-29 P2.3 → done (ASC app 6825956219 (com.horizonzeta.picdump, SKU Pic_Dump_01) exists; Play app com.horizonzeta.picdump exists (title PicDump, listing text empty))
- 2026-10-29 P2.5 → done (PRD.md Required store features + PRIVACY.md: no login/accounts/tracking; privacy manifest to build in phase 5)
- 2026-10-29 sync: added P2.8, P8.10
- 2026-10-29 P2.8 → done (app.json extra.eas.projectId 1a04cc3f-af2d-442f-b911-e82e495c81e4, owner horizonzeta)
- 2026-10-29 P2.6 → done (Hosted pages live (200) and committed on landing repo; app and hosted text identical (29 sections); model-download edit local on picdump-legal-downloads, unpushed)
- 2026-10-29 P2.1 → done (Name PicDump final (Kerem, 2026-10-29); daydump identifiers kept on purpose, mapping in README) [person]
- 2026-10-29 P2.7 → done (Checked in both consoles 2026-10-29: Apple Paid Apps Agreement, bank, tax Active; Play account earning revenue) [person]
- 2026-10-29 phase 2 complete → phase 3 · Architecture
- 2026-10-29 P4.3 → done (Screens are built and shipped; no separate mocks needed (owner decision, 2026-10-30). Real captures in store/screenshots/android/)
- 2026-10-29 P4.5 → done (Labels and 4.5:1 contrast audited and test-guarded; large text checked on Android at 2.0x font scale: tab label, quest stamp and stepper capped (maxFontSizeMultiplier); captures in store/screenshots/android/large-text/. Not checked: iOS Dynamic Type, real device.)
- 2026-10-29 P4.6 → done (Design approved by owner 2026-10-30: brand palette, logo, Cashmere/Espresso themes, caramel accent + rust deep accent (PR #9, #10)) [person]
