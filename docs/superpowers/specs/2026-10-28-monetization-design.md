# Monetization: locked picks + one free unlock a week

Date: 2026-10-28 · Status: implemented on fix/polish, not yet released · Platform: Android first

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
| Edit: premium film looks (all but Original and Warm 35mm) | preview only | yes |
| Export | unlocked, recap and manual dumps, with end slide; a premium look asks for Pro or exports without it | no end slide |
| Natural-language search | no (results reveal picks) | yes |
| Photos per dump setting (4-20) | default only (a lapsed user keeps the range they last set) | yes |

Premium film looks are every look except Original and Warm 35mm. Borders and layouts stay free.

## Access rules

`access(story, isPro, unlocks) → 'open' | 'locked'`, first match wins:

1. `story.kind === 'today'` (the 8 PM daily recap) → open
2. `isPro` → open
3. the story's id is in `unlocks.ids` → open, showing the Library draft made at unlock time
4. otherwise → locked

`PAYWALLS_ENABLED = false` (`src/constants/flags.ts`) keeps today's behaviour: everyone is treated as Pro. It stays as a kill switch.

## Weekly unlock

- State in AsyncStorage (`@picdump_unlocks`): `{ lastAt: number | null, ids: string[], spans: Record<id, [start, end]> }` (saves without `spans` load with `{}` and match by exact id only).
- `canUnlock(now)`: `lastAt` is null or `now - lastAt >= 7 days` (rolling, not calendar). Unused unlocks do not bank.
- `unlock(story, now)`: requires `canUnlock`; adds the story id and its `[start, end]`, and sets `lastAt = now`. Unlocking also makes the story's Library draft (`draftForStory`). A story already unlocked costs nothing.
- Matching (`unlockedAs`): story ids carry the earliest photo's time, so indexing, a settings change or a deleted photo can re-id the same story. A story is unlocked if its id is in `ids`, or an unlocked id has the same series (the id without its last `:segment`, e.g. `trip:Seattle`, `topic:7`) and a span that overlaps the story's; a second Seattle trip months later stays locked. Preview and Edit open the matched (older) id's draft, not a second one.
- The snapshot is that Library draft. Preview and Edit prefer a draft over the story's current picks, so the dump keeps its picks even if a re-index changes them. No photo ids are kept in the unlock state. Swaps inside an unlocked dump draw only from that story's own photos: for free users Edit passes the story's photo ids as the pool to `suggestSwaps`, so "Swap for a similar photo" and the add sheet's "Similar photos" never rank the rest of the library. A free dump with no story (Create basket, shared-in photos) has no swap action and the add sheet says similar photos are Pro. A draft made under an older unlocked id finds its story through `unlockedIdOf`.
- Local only. Clearing app data resets it; accepted, since that also wipes the index. No server: "nothing leaves the phone" stays true.

## Paywall moments

1. **First full Discover**: the first time the index has finished and Discover shows at least one locked dump, one dismissible paywall: "We found N dumps in your roll" with their titles. Remembered with `@picdump_first_paywall_shown`; never shown again automatically. It waits until Discover is the focused screen (not under onboarding, Edit, Create or a Post) and RevenueCat has answered this session, so a subscriber on a slow cold start never sees it.
2. **Tap a locked dump**: `UnlockSheet`. With an unlock available: "Use free unlock" (primary) and "Unlock all with Pro". Without one: "Next free unlock in N days" and "Unlock all with Pro".
3. **Search in Create** when not Pro: tapping the field opens the paywall.
4. **Export with a premium film look** when not Pro: a sheet with "Get Pro" or "Export without finish". Pro looks preview freely in Edit.
5. **Photos per dump** in Profile when not Pro.
6. **Profile Pro card** (exists).

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
- `src/state/Pro.tsx`: `ProProvider` and `usePro()` give `isPro`, `known` / `checked` (see Errors), the unlocks, `accessOf(story)`, `unlockedIdOf(story)`, `askUnlock(story)` and `openPaywall(source)`. It is fed by `RevenueCatService`'s customer-info listener and the dev fake subscription. It is a separate provider, not part of `AppState`, which re-renders on every indexing batch. One `PaywallModal` is mounted there at the root; screens call `openPaywall` instead of mounting their own.
- `UnlockSheet`, also in `Pro.tsx`.
- `src/services/paywallPlans.ts`: turns the current offering into the paywall's plans.
- Locked dumps are the existing Discover `Tile` / `Hero` with a `locked` prop: expo-image `blurRadius` 25 (its Android cap; strong enough that picks cannot be identified) and a lock badge. There is no separate `LockedDumpCard`. `LockedStub` guards Preview and Edit for locked story ids.

Changed:

- Discover (`src/app/(tabs)/index.tsx`): blurs and badges locked stories (`Tile` / `Hero` `locked`), opens unlocked ones with snapshot picks, triggers the first-full-Discover paywall.
- Preview's "IG Profile Grid" mock: covers come only from open stories (a locked story's cover is one of its picks).
- Search (Create): gated, opens the paywall for free users.
- Profile photos per dump: Pro only.
- Film looks / export: premium look check; free export with a premium look asks first.
- `src/services/slides.tsx`: appends a "made with PicDump" end slide (Skia `matchFont` + `Text`) to exports when not Pro. Free users cannot remove it. Not added when the dump already has 20 slides (Instagram's carousel limit). Preview's "Saving N slides" and the Post sheet count it.
- `PaywallModal`: offering-driven prices and trial text (no hardcoded fallbacks); feature list rewritten to the Pro column above; `source` prop, also set as a RevenueCat subscriber attribute `paywall_source` (no photo data).
- Profile: uses `isPro` from `usePro()`; Pro card copy matches the Pro column.

Removed:

- `src/constants/plans.ts`: the old price tiers and features that do not exist (custom prompts, AI captions, audio).
- `src/services/revenuecat.ts`: the daily dump counter (`MAX_FREE_DAILY_DUMPS`, `DAILY_DUMPS_COUNT`, `LAST_DUMP_DATE`).

## Errors and edge cases

- **Pro is three-state**: unknown, free or Pro. `getSubscription()` returns a `Sub` (Pro), `null` (no entitlement) or `undefined` (RevenueCat couldn't tell: an SDK error with no cached customer info, and no dev fake sub).
- **Cache**: every definite answer is saved to `@picdump_pro_known` as `{ sub: Sub | null }`, and `ProProvider` starts from it: the app renders nothing until that read is done, so a subscriber's first frame is Pro (no locked tiles, paywalls on Search or the steppers, finish sheet or end slide while RevenueCat answers). A cancelled cached sub past its `until` loads as free. A new install has no cache and starts free, so a free user's picks never flash.
- **Offline / RevenueCat unreachable**: the SDK's cached customer info decides; when it can't (`undefined`), the last known state stays. Never known → free. Recap and unlocked dumps keep working. `usePro().known` is true once RevenueCat answered this session or the cache had an answer; `checked` only once RevenueCat answered this session (the first-Discover paywall waits for it).
- **Purchase without entitlement** (paid, but the customer info has no Pro yet): the paywall says so and points at Restore purchases.
- **Pending purchase or grace period**: entitlement stays active during Play grace period. Turn on grace period and account hold in Play Console.
- **Pro lapses**: Library drafts stay viewable and exportable (with the end slide); dumps that were never unlocked lock again. The photos-per-dump range they last set stays.
- **Re-index**: unlocked snapshots are unaffected; a story whose id disappears simply no longer shows in Discover, its Library draft (if any) remains.
- **Index not ready / no locked dumps**: no first-Discover paywall yet; it waits.

## Out of scope

- iOS: no on-device index, so no Discover or search to lock. Only film looks and the end slide would apply. Android launches first.
- Lifetime plan (can be added later as an offering package).
- Server-side unlock ledger, analytics SDK.

## Testing

- Jest: `unlocks.ts` (rolling window boundary, no banking, refuses second unlock), `access.ts` (rule order, `today` always open; `PAYWALLS_ENABLED` is applied in `Pro.tsx`, not covered there), `paywallPlans.ts` (periods, trials), and app scenarios for the locked Discover, unlock sheet, first paywall (once, not before RevenueCat answers, not while Discover is off screen), search, photos per dump, export (end slide for free only, the stripped look on "Export without finish"), a slow or failing RevenueCat with a cached Pro answer, and Edit's swap pool.
- Developer tools (debug only): existing Fake Pro switch, plus "Free unlock (reset)", "Pretend 7 days passed" and "Onboarding every launch".
- Manual: Play internal track with license testers: buy weekly, start annual trial, cancel, restore, lapse.
