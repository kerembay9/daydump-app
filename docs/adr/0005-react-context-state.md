# 0005. React context for state, no state library

- **Status:** accepted
- **Date:** 2026-10-29 (recorded)
- **Deciders:** Kerem Bayramoglu

## Context
Global state is small: index progress and stories, onboarding, profile, and subscription/paywall/unlock status. Most data lives in SQLite and AsyncStorage behind services.

## Options
1. **React context + hooks** — no dependency, fits the few global stores.
2. **Redux Toolkit, Zustand or Jotai** — useful for many shared stores; here, added weight for little gain.

## Decision
Context providers in `src/state/` (`AppState.tsx`, `Pro.tsx`) with progress split into its own context so frequent indexing updates do not re-render everything. Services in `src/services/` own persistence.

## Consequences
- Easier: nothing to learn or upgrade; plain tests.
- Harder: provider re-render discipline as the app grows.
- Revisit if shared state grows past a few providers or re-render cost shows up in profiling.
