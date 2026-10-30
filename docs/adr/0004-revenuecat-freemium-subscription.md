# 0004. RevenueCat subscription with a locked-picks free tier

- **Status:** accepted
- **Date:** 2026-10-29 (spec dated 2026-10-28; owner confirmed pricing 2026-10-29)
- **Deciders:** Kerem Bayramoglu

## Context
PicDump needs revenue from the first public release without asking for money before users see what it found. Details and sources: `docs/superpowers/specs/2026-10-28-monetization-design.md`. Lesson from earlier apps: building paywalls and then switching them off wastes weeks.

## Options
1. **RevenueCat + subscription, picks locked, one free unlock a week** — gate the curation, not export.
2. **Hard paywall at launch** — higher conversion per the spec's sources, but users pay before seeing value.
3. **One-time purchase** — simple, but the category's revenue is weekly plans; one-time purchases led to complaints elsewhere ("charged again after an update").
4. **Own receipt validation backend** — rejected by ADR 0001.

## Decision
Option 1. RevenueCat (`react-native-purchases`) with entitlement `daydump_pro`; products `picdump_weekly` and `picdump_yearly` on both stores. Free: titles, recaps, one unlock per rolling 7 days, manual Create and Edit basics. Pro: all picks, search, premium looks and textures, Tidy trash, 4 to 20 photos per dump, no end slide. A user's photos are never held hostage after Pro lapses. `PAYWALLS_ENABLED` is a kill switch.

## Consequences
- Easier: no backend, store-native billing, RevenueCat charts.
- Harder: client-side gating; the entitlement id keeps the old `daydump` name; the iOS paywall must not list features iOS lacks (ADR 0002).
- Revisit after real purchase data. No sandbox purchase test has run yet on either platform.
