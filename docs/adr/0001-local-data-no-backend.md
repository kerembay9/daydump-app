# 0001. All data stays on the device; no backend or accounts

- **Status:** accepted
- **Date:** 2026-10-29 (recorded; the choice predates this file)
- **Deciders:** Kerem Bayramoglu

## Context
PicDump reads a user's whole camera roll. Photos are personal, and "nothing leaves your phone" is the main selling point against cloud memory apps and ad-heavy cleaners (BRIEF.md). A server would add cost per user, a privacy burden, an account system and store requirements (account deletion, Apple sign-in).

## Options
1. **Local only** — index, dumps and settings on the device; no accounts. Pros: strongest privacy story, no server cost, no account rules. Cons: no sync or backup, Pro status relies on the store and RevenueCat, clearing app data resets local state (unlock history, drafts).
2. **Supabase or own API** — accounts, sync, server-held entitlement. Pros: cross-device, server-side entitlement. Cons: photos or embeddings would be near the server, privacy policy and store labels get heavier, ongoing cost.

## Decision
Local only. SQLite (`expo-sqlite`) holds the photo index, AsyncStorage holds profile, drafts and flags. No sign-in. RevenueCat identifies a user with an anonymous ID.

## Consequences
- Easier: privacy policy ("no account, no upload, no analytics"), no account-deletion or sign-in obligations, no backend to run.
- Harder: Pro gating is client-side only; no cross-device restore except through the store; no server metrics.
- Revisit if users ask for sync or backup, or if abuse of client-side gating becomes real. Any server data would need a new privacy review first.
