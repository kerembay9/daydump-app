# Monetization: locked picks + one free unlock a week

Date: 2026-10-28 · Status: approved in brainstorming, not yet planned · Platform: Android first

## Goal

Revenue from the first public Play release, without asking for money before the user has seen what PicDump found in their own roll.

## Why this model

- A photo's owner can always post it from the gallery. Gating export alone charges only for finishes; the thing worth paying for is the **curation** (which photos make "A week in Seattle"). So the gate sits on the picks, not on export.
- RevenueCat State of Subscription Apps 2026: hard paywalls convert 10.7% trial-to-paid at D35 vs 2.1% for freemium, 8x revenue per install at D60, same year-1 retention. 55% of 3-day trial cancellations happen on Day 0; 17-32 day trials convert 42.5% vs 25.5% for under 4 days. 31% of Google Play cancellations are billing failures.
- Adapty Photo & Video: weekly plans are 51% of category revenue, 91% of trials start on Day 0, an early (onboarding-time) paywall gets 52% more install-to-paid than an in-app one.
- PicDump's "aha" needs the index to finish, so the first paywall waits for Discover to fill instead of sitting at the end of onboarding.
- Everything runs on the phone: no per-user cost, so a free tier is cheap to carry.

## Free vs Pro

| | Free | Pro |
|---|---|---|
| Discover: titles, dates, photo counts of every dump | yes | yes |
| Discover: a dump's picks | today's recap + 1 unlock per 7 days | all |
| Create: manual basket | yes | yes |
| Edit: crop, basic borders | yes | yes |
| Edit: premium finishes | preview only | yes |
| Export | unlocked, recap and manual dumps, with end card | no end card |
| Natural-language search | no (results reveal picks) | yes |
| Photos per dump setting (4-20) | default only | yes |

Which finishes and borders are "premium" is decided in the implementation plan from the current `filters.ts` / `layouts.ts` list; at least the basic set stays free.

## Access rules

`access(story, isPro, unlocks) → 'open' | 'locked'`, first match wins:

1. `story.kind === 'today'` (the 8 PM daily recap) → open
2. `isPro` → open
3. `unlocks.unlocked[story.id]` exists → open, showing the snapshot picks
4. otherwise → locked

`PAYWALLS_ENABLED = false` (`src/constants/flags.ts`) keeps today's behaviour: everyone is treated as Pro. It stays as a kill switch.

## Weekly unlock

- State in AsyncStorage: `{ lastUnlockAt: number | null, unlocked: { [storyId]: string[] /* photo ids */ } }`.
- `canUnlock(now)`: `lastUnlockAt` is null or `now - lastUnlockAt >= 7 days` (rolling, not calendar). Unused unlocks do not bank.
- `unlock(story, now)`: requires `canUnlock`; stores the story's current pick ids as a snapshot and sets `lastUnlockAt = now`.
- The snapshot is what the unlocked dump shows forever, even if a re-index changes that story's picks. Swaps inside an unlocked dump draw only from that story's own photos.
- Local only. Clearing app data resets it; accepted, since that also wipes the index. No server: "nothing leaves the phone" stays true.

## Paywall moments

1. **First full Discover**: the first time the index has finished and Discover shows at least one locked dump, one dismissible paywall: "We found N dumps in your roll" with their titles. Remembered with `@picdump_first_paywall_shown`; never shown again automatically.
2. **Tap a locked dump**: `UnlockSheet`. With an unlock available: "Use free unlock" (primary) and "Unlock all with Pro". Without one: "Next free unlock in N days" and "Unlock all with Pro".
3. **Search bar** when not Pro.
4. **Export with a premium finish** when not Pro: "Get Pro" or "Export without finish".
5. **Profile Pro card** (exists).

No launch paywall, no timed or repeated nags. Onboarding is unchanged.

## Plans and pricing

Launch setup (configured in Play Console + RevenueCat, not in code):

- Weekly $3.99, no trial
- Annual $29.99, 7-day free trial
- Play regional price templates for other countries

Pricing is not final. The app hardcodes no price, trial length or plan list: `PaywallModal` renders the current offering's packages, prices and intro offers. Price changes, a lifetime plan or RevenueCat Experiments need no app update.

## Components

New:

- `src/services/unlocks.ts`: weekly unlock state and rules above. Pure functions over a state object plus a thin AsyncStorage load/save.
- `src/services/access.ts`: the `access()` rule. No dependencies.
- `isPro` and `openPaywall(source)` in `AppState`, fed by `RevenueCatService`'s customer-info listener and the dev fake subscription. One `PaywallModal` mounted at the root; screens call `openPaywall` instead of mounting their own.
- `LockedDumpCard` (Discover): title, subtitle, Skia-blurred grid strong enough that picks cannot be identified.
- `UnlockSheet`.

Changed:

- Discover (`src/app/(tabs)/index.tsx`): renders `LockedDumpCard` for locked stories, opens unlocked ones with snapshot picks, triggers the first-full-Discover paywall.
- Search: gated.
- Finishes / export: premium finish check.
- `src/services/slides.tsx`: appends a "made with PicDump" end slide to exports when not Pro. Free users cannot remove it.
- `PaywallModal`: offering-driven prices and trial text (no hardcoded fallbacks); feature list rewritten to the Pro column above; `source` prop, also set as a RevenueCat subscriber attribute (no photo data).
- Profile: uses `isPro` from `AppState`; Pro card copy matches the Pro column.

Removed:

- `src/constants/plans.ts`: the old price tiers and features that do not exist (custom prompts, AI captions, audio).
- `src/services/revenuecat.ts`: the daily dump counter (`MAX_FREE_DAILY_DUMPS`, `DAILY_DUMPS_COUNT`, `LAST_DUMP_DATE`).

## Errors and edge cases

- **Offline / RevenueCat unreachable**: the SDK's cached customer info decides. Never known → free. Recap and unlocked dumps keep working.
- **Pending purchase or grace period**: entitlement stays active during Play grace period. Turn on grace period and account hold in Play Console.
- **Pro lapses**: Library drafts stay viewable and exportable (with end card); dumps that were never unlocked lock again.
- **Re-index**: unlocked snapshots are unaffected; a story whose id disappears simply no longer shows in Discover, its Library draft (if any) remains.
- **Index not ready / no locked dumps**: no first-Discover paywall yet; it waits.

## Out of scope

- iOS: no on-device index, so no Discover or search to lock. Only finishes and the end card would apply. Android launches first.
- Lifetime plan (can be added later as an offering package).
- Server-side unlock ledger, analytics SDK.

## Testing

- Jest: `unlocks.ts` (rolling window boundary, no banking, snapshot survives changed picks, refuses second unlock), `access.ts` (rule order, `today` always open, kill switch).
- Developer tools (debug only): existing Fake Pro switch, plus "Reset free unlock" and "Pretend 7 days passed".
- Manual: Play internal track with license testers: buy weekly, start annual trial, cancel, restore, lapse.
