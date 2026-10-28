# Monetization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the free / Pro split from `docs/superpowers/specs/2026-10-28-monetization-design.md`: Discover picks locked for free users except the daily recap and one unlock per rolling 7 days; Pro (RevenueCat, offering-driven paywall) opens everything, search, all film looks, and drops the export end card.

**Architecture:** Two pure services (`unlocks.ts`, `access.ts`) hold the rules and are unit tested. A `ProProvider` context (`src/state/Pro.tsx`) owns Pro status, the weekly unlock, the one root `PaywallModal` and the `UnlockSheet`; screens call `usePro()`. Unlocking makes the story's Library draft right away (`draftForStory`), so the draft is the snapshot Preview / Edit already prefer over the story's current picks.

**Tech Stack:** Expo SDK 57, React Native 0.86, Expo Router, `react-native-purchases` 10 (RevenueCat), `@shopify/react-native-skia` (export end card), `expo-image` (`blurRadius` for locked tiles), Jest with `jest-expo` and `expo-router/testing-library` (scenario tests boot the real app on the fake phone in `jest/world.ts`).

**Conventions (read once):**
- Commits: one line `Area: what changed` (see `git log`), then a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit with a heredoc: `git commit -q -F - <<'EOF' ... EOF`.
- Every task ends green on: `npx tsc --noEmit`, `npx expo lint`, `npx jest`.
- Unit tests live in `__tests__/*.test.ts`, app scenarios in `__tests__/scenarios/*.test.tsx`.
- Comments: short, say why, match the file around them. No prices or plan names in code.

**Deviations from the spec (fold into the spec in Task 13):**
- Snapshot = the Library draft made at unlock time (no photo ids in AsyncStorage). `unlocks.ts` stores `{ lastAt, ids }`.
- Pro state lives in its own `ProProvider`, not in `AppState` (AppState is already 230 lines and re-renders on every indexing batch).
- Locked tiles blur with `expo-image`'s `blurRadius`, not Skia.
- Premium looks: everything except Original and Warm 35mm.
- Photos per dump: the Profile control is Pro-only; a lapsed user keeps the range they last set.

**Already done:** Developer tools → "Onboarding every launch" (commit `586d1de`).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/services/unlocks.ts` | create | Weekly unlock rules (pure) + AsyncStorage load/save |
| `src/services/access.ts` | create | `access(story, isPro, unlocks)` |
| `src/services/paywallPlans.ts` | create | Offering packages → rows (title, price, trial text) |
| `src/state/Pro.tsx` | create | `ProProvider`, `usePro()`, root paywall + unlock sheet |
| `src/components/LockedDump.tsx` | create | `LockBadge`, `LockedStub` |
| `src/services/filters.ts` | modify | `isProLook`, `usesProLook`, `withoutProLooks` |
| `src/services/slides.tsx` | modify | `endCard` export option, `EndCard` drawing |
| `src/services/revenuecat.ts` | modify | Drop daily counter, simulated Pro, `purchasePlan`; add `setPaywallSource` |
| `src/components/PaywallModal.tsx` | rewrite | Offering-driven plans, `source`, `found` |
| `src/components/ui/Print.tsx`, `PhotoStack.tsx` | modify | `blur` prop |
| `src/components/ui/Icons.tsx` | modify | `lock` icon |
| `src/components/edit/FilterCard.tsx` | modify | "(Pro)" on premium looks |
| `src/app/_layout.tsx` | modify | Mount `ProProvider` |
| `src/app/(tabs)/index.tsx` | modify | Locked tiles, first-full-Discover paywall |
| `src/app/(tabs)/create.tsx` | modify | Search gate |
| `src/app/preview/[id].tsx` | modify | Locked guard, finish gate, end card |
| `src/app/edit/[id].tsx` | modify | Locked guard, `proLocked` looks |
| `src/app/profile.tsx` | modify | `usePro()`, photos-per-dump gate, dev rows |
| `src/constants/plans.ts` | delete | Old tiers and features that don't exist |
| `src/constants/flags.ts` | modify | `PAYWALLS_ENABLED = true` |
| `src/types/index.ts` | modify | Drop subscription types |
| `src/state/AppState.tsx` | modify | Drop stale paywall comment |
| `jest/world.ts`, `jest/setup.ts` | modify | `world.pro`, RevenueCat mock follows it |

---

### Task 1: Weekly unlock rules

**Files:**
- Create: `src/services/unlocks.ts`
- Test: `__tests__/unlocks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/unlocks.test.ts
import { canUnlock, daysLeft, isUnlocked, NO_UNLOCKS, unlock, UNLOCK_EVERY } from '../src/services/unlocks';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 28, 12);

test('a new user has one free unlock now', () => {
  expect(canUnlock(NO_UNLOCKS, T0)).toBe(true);
  expect(daysLeft(NO_UNLOCKS, T0)).toBe(0);
});

test('unlocking spends the week: the next one is free 7 days later, to the millisecond', () => {
  const u = unlock(NO_UNLOCKS, 'trip:Seattle:1', T0);
  expect(isUnlocked(u, 'trip:Seattle:1')).toBe(true);
  expect(canUnlock(u, T0 + UNLOCK_EVERY - 1)).toBe(false);
  expect(canUnlock(u, T0 + UNLOCK_EVERY)).toBe(true);
  expect(daysLeft(u, T0)).toBe(7);
  expect(daysLeft(u, T0 + 6 * DAY + 1)).toBe(1);
  expect(daysLeft(u, T0 + 7 * DAY)).toBe(0);
});

test('a second unlock in the same week throws; re-unlocking the same story is free', () => {
  const u = unlock(NO_UNLOCKS, 'a', T0);
  expect(() => unlock(u, 'b', T0 + DAY)).toThrow('no free unlock');
  expect(unlock(u, 'a', T0 + DAY)).toBe(u);
});

test('unused weeks do not bank: a month idle still gives one unlock', () => {
  const u = unlock(NO_UNLOCKS, 'a', T0);
  const later = T0 + 30 * DAY;
  const v = unlock(u, 'b', later);
  expect(() => unlock(v, 'c', later)).toThrow('no free unlock');
  expect(v.ids).toEqual(['a', 'b']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/unlocks.test.ts`
Expected: FAIL, `Cannot find module '../src/services/unlocks'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/services/unlocks.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Free tier: one Discover dump unlocked per rolling 7 days (docs/superpowers/specs/2026-10-28-monetization-design.md).
 * lastAt = when the last one was spent; ids = every story unlocked so far (they stay open). Unused weeks don't bank.
 * The picks themselves are the story's Library draft, made when it's unlocked (Pro.tsx), so a re-index can't change them.
 */
export type Unlocks = { lastAt: number | null; ids: string[] };
export const NO_UNLOCKS: Unlocks = { lastAt: null, ids: [] };
export const UNLOCK_EVERY = 7 * 86_400_000;

export const nextUnlockAt = (u: Unlocks) => (u.lastAt == null ? 0 : u.lastAt + UNLOCK_EVERY);
export const canUnlock = (u: Unlocks, now: number) => now >= nextUnlockAt(u);
export const isUnlocked = (u: Unlocks, storyId: string) => u.ids.includes(storyId);
/** Whole days until the next free unlock, rounded up; 0 = one is free now. */
export const daysLeft = (u: Unlocks, now: number) => Math.max(0, Math.ceil((nextUnlockAt(u) - now) / 86_400_000));

/** Spends this week's unlock on storyId. Throws when none is free; a story already unlocked costs nothing. */
export function unlock(u: Unlocks, storyId: string, now: number): Unlocks {
  if (isUnlocked(u, storyId)) return u;
  if (!canUnlock(u, now)) throw new Error('no free unlock');
  return { lastAt: now, ids: [...u.ids, storyId] };
}

const KEY = '@picdump_unlocks';
export async function loadUnlocks(): Promise<Unlocks> {
  try {
    return { ...NO_UNLOCKS, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') };
  } catch {
    return NO_UNLOCKS;
  }
}
export const saveUnlocks = (u: Unlocks) => AsyncStorage.setItem(KEY, JSON.stringify(u));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/unlocks.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/unlocks.ts __tests__/unlocks.test.ts
git commit -q -F - <<'EOF'
Monetization: weekly unlock rules (one per rolling 7 days, no banking)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Access rule

**Files:**
- Create: `src/services/access.ts`
- Test: `__tests__/access.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/access.test.ts
import { access } from '../src/services/access';
import { NO_UNLOCKS } from '../src/services/unlocks';

const trip = { id: 'trip:Seattle:1', kind: 'trip' as const };
const today = { id: 'today:2026-10-28', kind: 'today' as const };
const unlocked = { lastAt: 1, ids: [trip.id] };

test('the daily recap is always open, Pro or not', () => {
  expect(access(today, false, NO_UNLOCKS)).toBe('open');
});

test('Pro opens everything', () => {
  expect(access(trip, true, NO_UNLOCKS)).toBe('open');
});

test('free: an unlocked story is open, any other is locked', () => {
  expect(access(trip, false, unlocked)).toBe('open');
  expect(access({ id: 'topic:7:1', kind: 'topic' }, false, unlocked)).toBe('locked');
  expect(access(trip, false, NO_UNLOCKS)).toBe('locked');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/access.test.ts`
Expected: FAIL, `Cannot find module '../src/services/access'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/services/access.ts
import type { Story } from './stories';
import { isUnlocked, Unlocks } from './unlocks';

export type Access = 'open' | 'locked';

/** Whether a Discover story's picks show. First match wins: the 8 PM recap, Pro, this story's free unlock. */
export function access(story: Pick<Story, 'id' | 'kind'>, isPro: boolean, unlocks: Unlocks): Access {
  if (story.kind === 'today') return 'open';
  if (isPro) return 'open';
  return isUnlocked(unlocks, story.id) ? 'open' : 'locked';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/access.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/access.ts __tests__/access.test.ts
git commit -q -F - <<'EOF'
Monetization: access rule (recap open, Pro open, free unlocks open, rest locked)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Remove dead monetization code

The old daily counter, the 3-tier plan list and features that don't exist go. `purchasePlan` also has to go: with no offering it set "simulated Pro", which would give Pro away for free whenever the store is unreachable.

**Files:**
- Delete: `src/constants/plans.ts`
- Modify: `src/services/revenuecat.ts`, `src/types/index.ts`, `src/components/PaywallModal.tsx:55-61`

- [ ] **Step 1: Delete the plan constants**

```bash
git rm -q src/constants/plans.ts
```

- [ ] **Step 2: Trim `src/services/revenuecat.ts`**

1. Replace the imports block's last two lines:

```ts
import { SubscriptionPlanId, UserSubscriptionState } from '../types';
import { MAX_FREE_DAILY_DUMPS } from '../constants/plans';
```

with nothing (delete both lines).

2. Replace `STORAGE_KEYS`:

```ts
// Storage keys for offline / tracking state
const STORAGE_KEYS = {
  DAILY_DUMPS_COUNT: '@daydump_daily_dumps_count',
  LAST_DUMP_DATE: '@daydump_last_dump_date',
  SIMULATED_PRO: '@daydump_simulated_pro',
  API_KEY: '@daydump_revenuecat_api_key',
};
```

with:

```ts
const STORAGE_KEYS = {
  API_KEY: '@daydump_revenuecat_api_key',
};
```

3. Delete these whole methods (doc comment included): `getUserSubscriptionState` (section "4."), `purchasePlan` (section "5."), `recordDumpGenerated`, `setSimulatedPro`.

4. Remove `LIFETIME: 'lifetime',` and the whole `PRODUCTS` block from `REVENUECAT_CONFIG` (packages come from the offering now):

```ts
  // Product Identifiers
  PRODUCTS: {
    WEEKLY: 'weekly',
    YEARLY: 'yearly',
    LIFETIME: 'lifetime',
  },
```

→ delete.

5. Add this method after `restorePurchases`:

```ts
  /** Which paywall the user saw last (first-discover, locked-dump, search…), as a subscriber attribute: no photo data. */
  static async setPaywallSource(source: string): Promise<void> {
    if (!this.isConfigured) await this.init();
    try {
      await Purchases.setAttributes({ paywall_source: source });
    } catch (err) {
      console.warn('[RevenueCat] setAttributes failed:', err);
    }
  }
```

- [ ] **Step 3: Trim `src/types/index.ts`**

Delete `SubscriptionPlanId`, `SubscriptionPlan` and `UserSubscriptionState` (lines 15-33). Keep `PhotoAsset`.

- [ ] **Step 4: Paywall buys packages only**

In `src/components/PaywallModal.tsx` replace:

```ts
      let res;
      if (targetPkg) {
        res = await RevenueCatService.purchasePackage(targetPkg);
      } else {
        res = await RevenueCatService.purchasePlan(selected);
      }
```

with:

```ts
      if (!targetPkg) {
        toast('Plans couldn’t load. Check your connection and try again.');
        return;
      }
      const res = await RevenueCatService.purchasePackage(targetPkg);
```

(The modal is rewritten in Task 5; this keeps it compiling and safe until then.)

- [ ] **Step 5: Add `setAttributes` to the RevenueCat mock**

In `jest/setup.ts`, inside the `react-native-purchases` mock's `default` object, after `restorePurchases`, add:

```ts
    setAttributes: jest.fn(async () => {}),
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx expo lint && npx jest`
Expected: tsc and lint exit 0; all tests pass (81 + 7 new from Tasks 1-2).

- [ ] **Step 7: Commit**

```bash
git add -A src/constants src/services/revenuecat.ts src/types/index.ts src/components/PaywallModal.tsx jest/setup.ts
git commit -q -F - <<'EOF'
Monetization: drop the daily dump counter, old plan tiers and simulated-Pro fallback (no offering no longer grants Pro)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Pro state (`ProProvider`), paywalls on

**Files:**
- Create: `src/state/Pro.tsx`
- Modify: `src/app/_layout.tsx`, `src/app/profile.tsx`, `src/constants/flags.ts`, `src/state/AppState.tsx:207`, `jest/world.ts`, `jest/setup.ts`, `__tests__/scenarios/profile.test.tsx`

- [ ] **Step 1: Test world gets a Pro switch (default Pro, so existing scenarios keep their behaviour)**

In `jest/world.ts`, add to `world` after `lang`:

```ts
  /** RevenueCat says the user has PicDump Pro (default: yes, so scenarios not about monetization see no locks) */
  pro: true,
```

and in `seedWorld` add `world.pro = true;`.

In `jest/setup.ts` replace the mock's `getCustomerInfo` line:

```ts
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
```

with:

```ts
    getCustomerInfo: jest.fn(async () => ({
      entitlements: { active: require('./world').world.pro ? { daydump_pro: { productIdentifier: 'picdump_yearly', willRenew: true, expirationDateMillis: Date.now() + 365 * 86400000 } } : {} },
    })),
```

- [ ] **Step 2: Write `src/state/Pro.tsx`**

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { PAYWALLS_ENABLED } from '../constants/flags';
import { access, Access } from '../services/access';
import { draftForStory } from '../services/dumps';
import { RevenueCatService } from '../services/revenuecat';
import type { Story } from '../services/stories';
import { getSubscription, Sub } from '../services/subscription';
import { canUnlock, daysLeft, loadUnlocks, NO_UNLOCKS, saveUnlocks, unlock, Unlocks } from '../services/unlocks';
import { PaywallModal } from '../components/PaywallModal';
import { Sheet } from '../components/ui/Sheet';
import { FrameCard } from '../components/ui/FrameCard';
import { Tap } from '../components/ui/Tap';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';

/** What opened the paywall (RevenueCat attribute, and the paywall's heading for first-discover). */
export type PaywallSource = 'first-discover' | 'locked-dump' | 'search' | 'finish' | 'slides-per-dump' | 'profile';

type ProValue = {
  /** PicDump Pro, or paywalls off (PAYWALLS_ENABLED = false: everyone is Pro) */
  isPro: boolean;
  /** the subscription as Profile shows it; null = none */
  sub: Sub | null;
  unlocks: Unlocks;
  accessOf: (s: Pick<Story, 'id' | 'kind'>) => Access;
  /** The unlock sheet for a locked story: spend the free unlock, or go Pro. */
  askUnlock: (s: Story) => void;
  /** found: the titles of the dumps Discover found (first-discover only) */
  openPaywall: (source: PaywallSource, found?: string[]) => void;
  /** Re-reads the subscription (after the dev Fake Pro switch). */
  refresh: () => Promise<void>;
  /** Developer tools: reset or age the weekly unlock. */
  setUnlocks: (u: Unlocks) => Promise<void>;
};

const Ctx = createContext<ProValue | null>(null);

export function ProProvider({ children }: { children: React.ReactNode }) {
  const [sub, setSub] = useState<Sub | null>(null);
  const [unlocks, setU] = useState<Unlocks>(NO_UNLOCKS);
  const [paywall, setPaywall] = useState<{ source: PaywallSource; found?: string[] } | null>(null);
  const [asking, setAsking] = useState<Story | null>(null);

  const refresh = useCallback(async () => { setSub(await getSubscription()); }, []);
  useEffect(() => {
    loadUnlocks().then(setU);
    refresh();
    // renewals, cancellations and purchases made elsewhere (another device, the store's own page)
    return RevenueCatService.addCustomerInfoListener(() => { refresh(); });
  }, [refresh]);

  const isPro = !PAYWALLS_ENABLED || sub != null;
  const setUnlocks = useCallback(async (u: Unlocks) => { setU(u); await saveUnlocks(u); }, []);
  const openPaywall = useCallback((source: PaywallSource, found?: string[]) => {
    setPaywall({ source, found });
    RevenueCatService.setPaywallSource(source);
  }, []);

  const value = useMemo<ProValue>(() => ({
    isPro, sub, unlocks, refresh, setUnlocks, openPaywall,
    accessOf: (s) => access(s, isPro, unlocks),
    askUnlock: setAsking,
  }), [isPro, sub, unlocks, refresh, setUnlocks, openPaywall]);

  /** Spends the week's unlock and makes the story's draft now: the draft is the snapshot Preview and Edit open. */
  const spendUnlock = async (s: Story) => {
    const next = unlock(unlocks, s.id, Date.now());
    await setUnlocks(next);
    await draftForStory(s).catch((e) => console.warn('[pro] unlock draft failed:', e));
    setAsking(null);
    router.push({ pathname: '/preview/[id]', params: { id: s.id } });
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <UnlockSheet story={asking} unlocks={unlocks} onUse={spendUnlock} onPro={() => { setAsking(null); openPaywall('locked-dump'); }} onClose={() => setAsking(null)} />
      <PaywallModal visible={!!paywall} source={paywall?.source ?? 'profile'} found={paywall?.found} onClose={() => setPaywall(null)} onPurchased={refresh} />
    </Ctx.Provider>
  );
}

export function usePro(): ProValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePro outside ProProvider');
  return v;
}

function UnlockSheet({ story, unlocks, onUse, onPro, onClose }: {
  story: Story | null; unlocks: Unlocks; onUse: (s: Story) => void; onPro: () => void; onClose: () => void;
}) {
  const { t } = useTheme();
  const now = Date.now();
  const free = canUnlock(unlocks, now);
  const days = daysLeft(unlocks, now);
  return (
    <Sheet visible={!!story} onClose={onClose}>
      <Text style={[display(20, 1.15), { color: t.ink }]}>{story?.title}</Text>
      <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17, marginBottom: 4 }]}>
        {free
          ? `${story?.subtitle}. You get one free dump a week: use it on this one?`
          : `${story?.subtitle}. Your next free dump is in ${days} day${days === 1 ? '' : 's'}.`}
      </Text>
      {free && (
        <Tap onPress={() => story && onUse(story)} accessibilityRole="button" style={{ height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.bgScreen }]}>Use free unlock</Text>
        </Tap>
      )}
      <FrameCard radius={22} onPress={onPro} label="Unlock all with Pro" style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[ui(13, 600), { color: t.ink }]}>Unlock all with Pro</Text>
      </FrameCard>
    </Sheet>
  );
}
```

Note: `PaywallModal` gets `source` and `found` props in Task 5. Until then add them to its props type so this compiles: in `src/components/PaywallModal.tsx` change the props type to:

```ts
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased?: () => void;
  source?: string;
  found?: string[];
}) {
```

- [ ] **Step 3: Mount it**

In `src/app/_layout.tsx` add `import { ProProvider } from '../state/Pro';` and replace:

```tsx
          <AppStateProvider>
            <Root />
          </AppStateProvider>
```

with:

```tsx
          <AppStateProvider>
            <ProProvider>
              <Root />
            </ProProvider>
          </AppStateProvider>
```

- [ ] **Step 4: Profile reads Pro from the provider**

In `src/app/profile.tsx`:

1. Replace the import `import { PaywallModal } from '../components/PaywallModal';` with `import { usePro } from '../state/Pro';`.
2. Replace `import { cycleFakeSubscription, getSubscription, MANAGE_URL, Sub } from '../services/subscription';` with `import { cycleFakeSubscription, MANAGE_URL, Sub } from '../services/subscription';`.
3. Delete the two state lines

```ts
  const [sub, setSub] = useState<Sub | null>(null);
  const [paywall, setPaywall] = useState(false);
```

and right after `const app = useApp();` add (early, so `setSlides` in Task 10 can use it):

```ts
  const pro = usePro();
  const sub = pro.sub;
```

4. In the `useFocusEffect` body delete the line `getSubscription().then(setSub);`.
5. Replace `<SubCard sub={sub} onGoPro={() => setPaywall(true)} />` with `<SubCard sub={sub} onGoPro={() => pro.openPaywall('profile')} />`.
6. Replace the Fake Pro row's `onPress={() => cycleFakeSubscription(sub).then(setSub)}` with `onPress={() => cycleFakeSubscription(sub).then(pro.refresh)}`.
7. Delete the line `<PaywallModal visible={paywall} onClose={() => setPaywall(false)} onPurchased={() => { getSubscription().then(setSub); }} />`.
8. If `Sub` is now unused in this file, drop it from the import (tsc/lint will say).

- [ ] **Step 5: Paywalls on**

Replace the whole of `src/constants/flags.ts` with:

```ts
/**
 * Paywalls: free users see every Discover dump's title but only the 8 PM recap and one dump a week unlocked; Pro opens
 * everything (docs/superpowers/specs/2026-10-28-monetization-design.md). false = kill switch: everyone gets Pro.
 */
export const PAYWALLS_ENABLED = true;
```

In `src/state/AppState.tsx` delete the line `    // The onboarding paywall hook is gone (PAYWALLS_ENABLED = false).`

- [ ] **Step 6: Profile tests follow the Pro switch**

In `__tests__/scenarios/profile.test.tsx`:

1. Change the import to `import { seedWorld, world } from '../../jest/world';` if `world` isn't imported (it is).
2. In `test('Profile: Go Pro opens paywall; no Done, no bio', ...)` add `world.pro = false;` as the first line and `world.pro = true;` as the last line.
3. In `test('a renewing subscription shows its renewal date and Manage', ...)` add `world.pro = false;` as the first line and `world.pro = true;` as the last line (the dev fake sub is what it reads).

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx expo lint && npx jest`
Expected: all green. If `no paywall or crown anywhere` fails on `/profile`-only text, check the URL list (it excludes `/profile`).

- [ ] **Step 8: Commit**

```bash
git add src/state/Pro.tsx src/app/_layout.tsx src/app/profile.tsx src/constants/flags.ts src/state/AppState.tsx src/components/PaywallModal.tsx jest/world.ts jest/setup.ts __tests__/scenarios/profile.test.tsx
git commit -q -F - <<'EOF'
Monetization: ProProvider (Pro status, weekly unlock, one root paywall and unlock sheet); paywalls on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Offering-driven paywall

**Files:**
- Create: `src/services/paywallPlans.ts`
- Rewrite: `src/components/PaywallModal.tsx`
- Modify: `jest/setup.ts` (offering mock), `__tests__/scenarios/profile.test.tsx` (heading)
- Test: `__tests__/paywall-plans.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/paywall-plans.test.ts
import { paywallPlans, trialText } from '../src/services/paywallPlans';

const pkg = (packageType: string, priceString: string, extra: object = {}) =>
  ({ identifier: `$rc_${packageType.toLowerCase()}`, packageType, product: { title: 'x', priceString, introPrice: null, defaultOption: null, ...extra } }) as never;

test('Play free phase reads as days', () => {
  expect(trialText(pkg('ANNUAL', '$29.99', { defaultOption: { freePhase: { billingPeriod: { iso8601: 'P1W' } } } }))).toBe('7-day free trial');
  expect(trialText(pkg('ANNUAL', '$29.99', { defaultOption: { freePhase: { billingPeriod: { iso8601: 'P3D' } } } }))).toBe('3-day free trial');
  expect(trialText(pkg('ANNUAL', '$29.99', { defaultOption: { freePhase: { billingPeriod: { iso8601: 'P1M' } } } }))).toBe('1-month free trial');
});

test('App Store intro price at 0 is a trial; a paid intro is not', () => {
  expect(trialText(pkg('ANNUAL', '$29.99', { introPrice: { price: 0, periodNumberOfUnits: 7, periodUnit: 'DAY' } }))).toBe('7-day free trial');
  expect(trialText(pkg('ANNUAL', '$29.99', { introPrice: { price: 0.99, periodNumberOfUnits: 1, periodUnit: 'WEEK' } }))).toBeNull();
});

test('rows keep the offering order and say the period', () => {
  const rows = paywallPlans([pkg('WEEKLY', '$3.99'), pkg('ANNUAL', '$29.99'), pkg('LIFETIME', '$49.99')]);
  expect(rows.map((r) => [r.title, r.price, r.trial])).toEqual([
    ['Weekly', '$3.99 / week', null],
    ['Annual', '$29.99 / year', null],
    ['Lifetime', '$49.99 once', null],
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/paywall-plans.test.ts`
Expected: FAIL, `Cannot find module '../src/services/paywallPlans'`.

- [ ] **Step 3: Write `src/services/paywallPlans.ts`**

```ts
import type { PurchasesPackage } from './revenuecat';

/** One plan on the paywall, all from the store offering: prices and trials change in Play Console / RevenueCat, not here. */
export type PlanRow = { pkg: PurchasesPackage; id: string; title: string; price: string; trial: string | null };

const TITLE: Record<string, string> = { WEEKLY: 'Weekly', MONTHLY: 'Monthly', TWO_MONTH: '2 months', THREE_MONTH: '3 months', SIX_MONTH: '6 months', ANNUAL: 'Annual', LIFETIME: 'Lifetime' };
const PER: Record<string, string> = { WEEKLY: '/ week', MONTHLY: '/ month', ANNUAL: '/ year', LIFETIME: 'once' };
const UNIT: Record<string, string> = { D: 'day', W: 'week', M: 'month', Y: 'year', DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' };

const trial = (n: number, unit: string | undefined) => (!unit ? null : unit === 'week' ? `${n * 7}-day free trial` : `${n}-${unit} free trial`);

/** "7-day free trial" from Play's free phase (P1W) or the App Store's free intro price; null = no trial. */
export function trialText(p: PurchasesPackage): string | null {
  const iso = p.product.defaultOption?.freePhase?.billingPeriod?.iso8601;
  const m = iso ? /^P(\d+)([DWMY])$/.exec(iso) : null;
  if (m) return trial(+m[1], UNIT[m[2]]);
  const intro = p.product.introPrice;
  if (intro && intro.price === 0) return trial(intro.periodNumberOfUnits, UNIT[intro.periodUnit]);
  return null;
}

export const paywallPlans = (pkgs: PurchasesPackage[]): PlanRow[] => pkgs.map((p) => ({
  pkg: p,
  id: p.identifier,
  title: TITLE[p.packageType] ?? p.product.title,
  price: `${p.product.priceString} ${PER[p.packageType] ?? ''}`.trim(),
  trial: trialText(p),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/paywall-plans.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Rewrite `src/components/PaywallModal.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, Text, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { Icons } from './ui/Icons';
import { FrameCard } from './ui/FrameCard';
import { Tap } from './ui/Tap';
import { RevenueCatService } from '../services/revenuecat';
import { paywallPlans, PlanRow } from '../services/paywallPlans';
import { LegalModal, type LegalDocType } from './LegalModal';

const toast = (m: string) => (Platform.OS === 'android' ? ToastAndroid.show(m, ToastAndroid.SHORT) : console.log('[paywall]', m));

/**
 * PicDump Pro. Plans, prices and trials are the current RevenueCat offering's packages, in its order; the first with a
 * trial starts selected. found: the dump titles Discover just found (the first-full-Discover paywall).
 */
export function PaywallModal({ visible, onClose, onPurchased, found }: {
  visible: boolean;
  onClose: () => void;
  onPurchased?: () => void;
  source?: string;
  found?: string[];
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [legal, setLegal] = useState<LegalDocType | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    RevenueCatService.getOfferings().then((o) => {
      if (!active) return;
      const rows = paywallPlans(o?.current?.availablePackages ?? []);
      setPlans(rows);
      setSelected((s) => s ?? (rows.find((r) => r.trial) ?? rows[0])?.id ?? null);
    }).catch(() => { if (active) setPlans([]); });
    return () => { active = false; };
  }, [visible]);

  const plan = useMemo(() => plans?.find((p) => p.id === selected) ?? null, [plans, selected]);

  const subscribe = async () => {
    if (!plan) return toast('Plans couldn’t load. Check your connection and try again.');
    setPurchasing(true);
    try {
      const res = await RevenueCatService.purchasePackage(plan.pkg);
      if (res.success) {
        toast('Welcome to PicDump Pro!');
        onPurchased?.();
        onClose();
      } else if (res.error && res.error !== 'User cancelled') toast(res.error);
    } finally {
      setPurchasing(false);
    }
  };

  const restore = async () => {
    setPurchasing(true);
    try {
      const res = await RevenueCatService.restorePurchases();
      if (res.isPro) {
        toast('Purchases restored. Welcome back to Pro!');
        onPurchased?.();
        onClose();
      } else toast(res.error ?? 'No active PicDump Pro subscription found.');
    } finally {
      setPurchasing(false);
    }
  };

  const n = found?.length ?? 0;
  const heading = n ? `We found ${n} dump${n === 1 ? '' : 's'} in your roll.` : 'Every dump in your roll.';
  const sub = n ? `${found!.slice(0, 3).join(', ')}${n > 3 ? ' and more' : ''}. Pro opens all of them.`
    : 'Free gets one dump a week and your daily recap. Pro opens all of them.';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.bgScreen, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}>
        <View style={{ paddingHorizontal: 20, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.accentFab, alignItems: 'center', justifyContent: 'center' }}>
              <Icons.sparkle size={14} color={t.accentFabText} />
            </View>
            <Text style={[display(18), { color: t.ink }]}>PicDump Pro</Text>
          </View>
          <Tap onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close paywall"
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
            <Icons.close size={16} color={t.ink} />
          </Tap>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Text style={[display(26, 1.1), { color: t.ink }]}>{heading}</Text>
            <Text style={[ui(13), { color: t.inkMuted, lineHeight: 18 }]}>{sub}</Text>
          </View>

          <FrameCard radius={18} padding={14} style={{ gap: 12 }}>
            <FeatureRow icon={Icons.carousel} title="Every dump, unlocked" sub="Every trip and story Discover finds, not one a week." />
            <FeatureRow icon={Icons.search} title="Search your camera roll" sub="Find a place, a month or a thing in words." />
            <FeatureRow icon={Icons.sparkle} title="All film looks" sub="Cashmere, Soft Film, Sunfade and B&W Roll." />
            <FeatureRow icon={Icons.crop} title="Your dump, your way" sub="No PicDump end slide, and 4 to 20 photos per dump." />
          </FrameCard>

          <View style={{ gap: 10, marginTop: 4 }}>
            {plans == null ? <ActivityIndicator color={t.ink} /> : plans.length === 0 ? (
              <Text style={[ui(12), { color: t.inkMuted, textAlign: 'center' }]}>Plans couldn’t load. Check your connection and try again.</Text>
            ) : plans.map((p) => {
              const on = p.id === selected;
              return (
                <Tap key={p.id} onPress={() => setSelected(p.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${p.title}, ${p.price}${p.trial ? `, ${p.trial}` : ''}`}
                  style={{ borderWidth: on ? 2 : 1, borderColor: on ? t.ink : t.borderSubtle, borderRadius: 16, padding: 14, backgroundColor: t.bgCard }}>
                  {p.trial && (
                    <View style={{ position: 'absolute', top: -10, right: 16, backgroundColor: t.accentFab, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                      <Text style={[ui(10, 700), { color: t.accentFabText }]}>{p.trial.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ gap: 2 }}>
                      <Text style={[ui(15, 600), { color: t.ink }]}>{p.title}</Text>
                      <Text style={[ui(11.5), { color: t.inkMuted }]}>{p.price}</Text>
                    </View>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? t.ink : t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                      {on && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.ink }} />}
                    </View>
                  </View>
                </Tap>
              );
            })}
          </View>

          <Tap onPress={subscribe} disabled={purchasing || !plan} accessibilityRole="button"
            style={{ height: 48, borderRadius: 24, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4, opacity: plan ? 1 : 0.5 }}>
            {purchasing ? <ActivityIndicator color={t.bgScreen} size="small" />
              : <Text style={[ui(14, 600), { color: t.bgScreen }]}>{plan?.trial ? `Start ${plan.trial}` : 'Continue'}</Text>}
          </Tap>

          <View style={{ alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Tap onPress={restore} disabled={purchasing} hitSlop={8}>
              <Text style={[ui(12, 500), { color: t.inkMuted, textDecorationLine: 'underline' }]}>Restore purchases</Text>
            </Tap>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Tap onPress={() => setLegal('terms')} hitSlop={6}><Text style={[ui(10.5), { color: t.inkMuted }]}>Terms of Service</Text></Tap>
              <Text style={[ui(10.5), { color: t.inkMuted }]}>·</Text>
              <Tap onPress={() => setLegal('privacy')} hitSlop={6}><Text style={[ui(10.5), { color: t.inkMuted }]}>Privacy Policy</Text></Tap>
            </View>
            <Text style={[ui(10), { color: t.inkMuted, textAlign: 'center', lineHeight: 14 }]}>
              {plan?.trial ? `Free for the trial, then ${plan.price}. ` : ''}Payment is charged to your store account. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period.
            </Text>
          </View>
        </ScrollView>

        <LegalModal visible={legal != null} type={legal ?? 'terms'} onClose={() => setLegal(null)} />
      </View>
    </Modal>
  );
}

function FeatureRow({ icon: Icon, title, sub }: { icon: typeof Icons.sparkle; title: string; sub: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={t.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[ui(13, 600), { color: t.ink }]}>{title}</Text>
        <Text style={[ui(11), { color: t.inkMuted }]}>{sub}</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 6: Offering mock looks like the launch setup**

In `jest/setup.ts` replace the mock's `availablePackages` array with:

```ts
        availablePackages: [
          { identifier: '$rc_weekly', packageType: 'WEEKLY', product: { identifier: 'picdump_weekly', title: 'Weekly', priceString: '$3.99', introPrice: null, defaultOption: null } },
          { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'picdump_yearly', title: 'Annual', priceString: '$29.99', introPrice: null, defaultOption: { freePhase: { billingPeriod: { iso8601: 'P1W' } } } } },
        ],
```

- [ ] **Step 7: Profile test checks the new paywall**

In `__tests__/scenarios/profile.test.tsx`, test `Profile: Go Pro opens paywall; no Done, no bio`, replace

```ts
  expect(await screen.findByText('Curate and export without limits.')).toBeTruthy();
```

with:

```ts
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
  // the annual plan has the trial, so it starts selected and the button says so
  expect(await screen.findByRole('radio', { name: 'Annual, $29.99 / year, 7-day free trial', selected: true })).toBeTruthy();
  expect(screen.getByText('Start 7-day free trial')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Weekly, $3.99 / week' })).toBeTruthy();
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npx expo lint && npx jest`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/services/paywallPlans.ts src/components/PaywallModal.tsx jest/setup.ts __tests__/paywall-plans.test.ts __tests__/scenarios/profile.test.tsx
git commit -q -F - <<'EOF'
Paywall: plans, prices and trial wording from the RevenueCat offering; copy matches what Pro actually opens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Locked dumps in Discover, Preview and Edit

**Files:**
- Create: `src/components/LockedDump.tsx`
- Modify: `src/components/ui/Icons.tsx`, `src/components/ui/Print.tsx`, `src/components/ui/PhotoStack.tsx`, `src/app/(tabs)/index.tsx`, `src/app/preview/[id].tsx`, `src/app/edit/[id].tsx`
- Test: `__tests__/scenarios/monetization.test.tsx`

- [ ] **Step 1: Write the failing scenario**

```tsx
// __tests__/scenarios/monetization.test.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';
const META = '6 photos · Sep 22–Oct 22, 2025';

beforeEach(async () => {
  seedWorld();
  world.pro = false;
  await AsyncStorage.removeItem('@picdump_unlocks');
  // the first-full-Discover paywall has its own test
  await AsyncStorage.setItem('@picdump_first_paywall_shown', '1');
});
afterAll(() => { world.pro = true; });

test('free: dumps are locked; the free unlock opens one, the next asks for Pro', async () => {
  await bootApp('/');
  const tile = await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 });
  expect(screen.getByLabelText('Unlock A week in Seattle')).toBeTruthy();

  await fireEvent.press(tile);
  await fireEvent.press(await screen.findByText('Use free unlock'));
  // the unlocked dump opens in Preview
  expect(await screen.findByLabelText('Post on Instagram or TikTok')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Back'));

  // it stays open; the next locked one says when the next free unlock is, and offers Pro
  expect(await screen.findByLabelText(`${LONG}, ${META}`)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Unlock A week in Seattle'));
  expect(await screen.findByText(/Your next free dump is in 7 days\.$/)).toBeTruthy();
  expect(screen.queryByText('Use free unlock')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Unlock all with Pro'));
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
}, 30000);

test('Pro: nothing is locked', async () => {
  world.pro = true;
  await bootApp('/');
  expect(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByLabelText('Preview A week in Seattle')).toBeTruthy();
  expect(screen.queryByText('Unlock')).toBeNull();
}, 30000);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/scenarios/monetization.test.tsx`
Expected: FAIL, unable to find label `…, locked`.

- [ ] **Step 3: Lock icon**

In `src/components/ui/Icons.tsx` add `import Lock from 'lucide-react-native/icons/lock';` after the `Heart` import, and `lock: lucide(Lock),` after `clock: lucide(Clock),` in `Icons`.

- [ ] **Step 4: Blur for prints**

In `src/components/ui/Print.tsx`:
- add to `Props`: `/** blur radius for a locked dump's photos (Discover); none = sharp */ blur?: number;`
- destructure `blur` in `Print({ ... })`
- in the `<Image ... />` add `blurRadius={blur}`.

In `src/components/ui/PhotoStack.tsx`:
- change `type Props` to add `/** locked dump: photos blurred past recognising */ blur?: number;`
- change the signature to `export function PhotoStack({ kind, uris, width, style, blur }: Props) {`
- in `<Print ... />` add `blur={blur}`.

- [ ] **Step 5: `src/components/LockedDump.tsx`**

```tsx
import React from 'react';
import { Text, View } from 'react-native';
import type { Story } from '../services/stories';
import { usePro } from '../state/Pro';
import { useTheme } from '../theme/ThemeProvider';
import { ui } from '../theme/type';
import { Icons } from './ui/Icons';
import { Stub } from './ui/Stub';
import { Tap } from './ui/Tap';

/** How hard a locked dump's photos blur: the scene's colours show, which photos were picked doesn't. */
export const LOCKED_BLUR = 40;

/** Lock in a locked dump's top-right corner. Place inside a positioned card. */
export function LockBadge() {
  const { t } = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Icons.lock size={12} color={t.bgScreen} />
    </View>
  );
}

/** Preview / Edit of a locked story (a deep link, or Back after Pro lapsed): no picks, just the way in. */
export function LockedStub({ story }: { story: Story }) {
  const { t } = useTheme();
  const { askUnlock } = usePro();
  return (
    <Stub back title={story.title} note={`${story.subtitle}. This dump is locked.`}>
      <Tap onPress={() => askUnlock(story)} accessibilityRole="button" style={{ height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[ui(13, 600), { color: t.bgScreen }]}>Unlock</Text>
      </Tap>
    </Stub>
  );
}
```

- [ ] **Step 6: Discover**

In `src/app/(tabs)/index.tsx`:

1. Imports: add `import { usePro } from '../../state/Pro';` and `import { LockBadge, LOCKED_BLUR } from '../../components/LockedDump';`.

2. Replace the `Tile` function with:

```tsx
/** One "other dump" tile of the bento: stacked prints, then the title and meta. Stretches to its row's height. more: scrapbook (bigger tilt, tape). locked: blurred, with a lock. */
function Tile({ s, kind, rotate, onPress, style, more, locked }: { s: Story; kind: StackKind; rotate: number; onPress: () => void; style?: ViewStyle; more?: boolean; locked: boolean }) {
  const wide = kind === 'wide';
  return (
    <FrameCard radius={14} padding={8} rotate={more ? rotate * 2.6 : rotate} onPress={onPress} label={`${s.title}, ${s.subtitle}${locked ? ', locked' : ''}`} style={style}>
      <PhotoStack kind={kind} uris={uris(s)} blur={locked ? LOCKED_BLUR : undefined} style={{ marginBottom: kind === 'tall' ? 8 : 6 }} />
      {wide ? (
        <View style={{ paddingHorizontal: 4, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <View style={{ flex: 1 }}><Title text={s.title} style={display(16)} /></View>
          <Meta s={s} />
        </View>
      ) : (
        <View style={{ paddingHorizontal: 2 }}>
          <Title text={s.title} style={display(kind === 'tall' ? 16 : 15.5)} />
          <Meta s={s} />
        </View>
      )}
      {locked && <LockBadge />}
      {more && <TileTape id={s.id} />}
    </FrameCard>
  );
}
```

3. Replace the `Bento` component's first lines

```tsx
const Bento = React.memo(function Bento({ block, more }: { block: Story[]; more: boolean }) {
  const [a, b, c, d] = block;
  const tile = (s: Story, kind: StackKind, rotate: number, style?: ViewStyle) => <Tile key={s.id} s={s} kind={kind} rotate={rotate} onPress={() => preview(s.id)} style={style} more={more} />;
```

with:

```tsx
const Bento = React.memo(function Bento({ block, more, isLocked, open }: { block: Story[]; more: boolean; isLocked: (s: Story) => boolean; open: (s: Story) => void }) {
  const [a, b, c, d] = block;
  const tile = (s: Story, kind: StackKind, rotate: number, style?: ViewStyle) => <Tile key={s.id} s={s} kind={kind} rotate={rotate} onPress={() => open(s)} style={style} more={more} locked={isLocked(s)} />;
```

4. Replace the `Hero` function with:

```tsx
function Hero({ s, more, locked, onOpen }: { s: Story; more: boolean; locked: boolean; onOpen: () => void }) {
  const { t } = useTheme();
  const verb = locked ? 'Unlock' : 'Preview';
  return (
    <View style={{ paddingTop: 8, paddingBottom: more ? 10 : 4 }}>
      <FrameCard radius={16} padding={10} rotate={more ? -1.8 : -1}>
        <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${verb} ${s.title}`}>
          <PhotoStack kind="hero" uris={uris(s)} blur={locked ? LOCKED_BLUR : undefined} />
        </Tap>
        <View style={{ paddingTop: 8, paddingBottom: 2, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Title text={s.title} style={display(19.5)} />
            <Meta s={s} size={10.5} />
          </View>
          <Tap onPress={onOpen} accessibilityRole="button" style={{ height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {locked && <Icons.lock size={12} color={t.bgScreen} />}
            <Text style={[ui(11, 600), { color: t.bgScreen }]}>{verb}</Text>
          </Tap>
        </View>
        {more && <><CornerTape seed={`${s.id}:l`} side="left" /><CornerTape seed={`${s.id}:r`} side="right" /></>}
      </FrameCard>
      {!more && <Tape />}
    </View>
  );
}
```

and add `import { Icons } from '../../components/ui/Icons';` to the imports.

5. In `Discover()`, after `const paper = useProfile().paper;` add:

```tsx
  const pro = usePro();
  const isLocked = useCallback((s: Story) => pro.accessOf(s) === 'locked', [pro]);
  const open = useCallback((s: Story) => (isLocked(s) ? pro.askUnlock(s) : preview(s.id)), [isLocked, pro]);
```

6. Replace `const renderBento = useCallback(({ item }: { item: Story[] }) => <Bento block={item} more={more} />, [more]);` with:

```tsx
  const renderBento = useCallback(({ item }: { item: Story[] }) => <Bento block={item} more={more} isLocked={isLocked} open={open} />, [more, isLocked, open]);
```

7. Replace `<Hero s={hero} more={more} />` with `<Hero s={hero} more={more} locked={isLocked(hero)} onOpen={() => open(hero)} />`.

8. Replace `extraData={more}` with `extraData={[more, isLocked]}`.

- [ ] **Step 7: Preview guard**

In `src/app/preview/[id].tsx`:
- add imports `import { usePro } from '../../state/Pro';` and `import { LockedStub } from '../../components/LockedDump';`
- in `Preview()`, after `const story = ...;` add `const { accessOf } = usePro();`
- in the effect, change `else if (story) getProfile()...` to `else if (story && accessOf(story) === 'open') getProfile()...` and add `accessOf` to the effect's deps: `}, [id, story, accessOf]);`
- right before `if (dump === undefined) return null;` add:

```tsx
  // a locked story's picks never load (deep link, or back here after Pro lapsed)
  if (story && accessOf(story) === 'locked') return <LockedStub story={story} />;
```

- [ ] **Step 8: Edit guard (Edit would otherwise make the draft, which is the unlock)**

In `src/app/edit/[id].tsx`:
- add the same two imports as Step 7
- in `Edit()` after `const ready = isDumpId(id) || loaded;` add:

```tsx
  const { accessOf } = usePro();
  const locked = !!story && accessOf(story) === 'locked';
```

- change the effect's first line to `if (!id || !ready || dump !== undefined || locked) return;` and its deps to `}, [id, ready, story, dump, locked]);`
- right before `if (dump === null) return <Stub ...` add `if (locked) return <LockedStub story={story!} />;`

- [ ] **Step 9: Run the scenario**

Run: `npx jest __tests__/scenarios/monetization.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 10: Verify everything**

Run: `npx tsc --noEmit && npx expo lint && npx jest`
Expected: all green (world.pro defaults to true, so other scenarios see no locks).

- [ ] **Step 11: Commit**

```bash
git add src/components/LockedDump.tsx src/components/ui/Icons.tsx src/components/ui/Print.tsx src/components/ui/PhotoStack.tsx "src/app/(tabs)/index.tsx" "src/app/preview/[id].tsx" "src/app/edit/[id].tsx" __tests__/scenarios/monetization.test.tsx
git commit -q -F - <<'EOF'
Discover: free users see locked dumps (blurred, lock) and spend one free unlock a week; Preview and Edit keep locked picks closed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: First full Discover paywall

**Files:**
- Modify: `src/app/(tabs)/index.tsx`
- Test: `__tests__/scenarios/monetization.test.tsx`

- [ ] **Step 1: Write the failing test** (append to `monetization.test.tsx`)

```tsx
test('the first time Discover is full of locked dumps, the paywall names them, once', async () => {
  await AsyncStorage.removeItem('@picdump_first_paywall_shown');
  await bootApp('/');
  expect(await screen.findByText('We found 3 dumps in your roll.', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText(/^A week in Seattle, .*\. Pro opens all of them\.$/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Close paywall'));
  screen.unmount();

  await bootApp('/');
  await screen.findByLabelText('Unlock A week in Seattle', {}, { timeout: 10000 });
  expect(screen.queryByText(/We found \d+ dumps/)).toBeNull();
}, 30000);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/scenarios/monetization.test.tsx -t "first time"`
Expected: FAIL, unable to find `We found 3 dumps in your roll.`

- [ ] **Step 3: Implement**

In `src/app/(tabs)/index.tsx`:
- change the React import to `import React, { useCallback, useEffect, useMemo, useState } from 'react';`
- add `import AsyncStorage from '@react-native-async-storage/async-storage';`
- above `export default function Discover()` add:

```tsx
const FIRST_PAYWALL = '@picdump_first_paywall_shown';

/**
 * Once ever: when indexing is done and Discover shows locked dumps, the paywall lists what it found. Most trials start
 * on day one, and this is the first moment the user can see what Pro opens.
 */
function useFirstPaywall(stories: Story[], settled: boolean, isLocked: (s: Story) => boolean, openPaywall: (source: 'first-discover', found: string[]) => void) {
  const locked = useMemo(() => stories.filter(isLocked).map((s) => s.title), [stories, isLocked]);
  useEffect(() => {
    if (!settled || !locked.length) return;
    let live = true;
    AsyncStorage.getItem(FIRST_PAYWALL).then(async (seen) => {
      if (seen || !live) return;
      await AsyncStorage.setItem(FIRST_PAYWALL, '1');
      openPaywall('first-discover', locked);
    }).catch(() => {});
    return () => { live = false; };
  }, [settled, locked, openPaywall]);
}
```

- in `Discover()`, after the `open` callback from Task 6, add:

```tsx
  useFirstPaywall(stories, loaded && !progress && !paused, isLocked, pro.openPaywall);
```

- [ ] **Step 4: Run it**

Run: `npx jest __tests__/scenarios/monetization.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npx expo lint && npx jest`

```bash
git add "src/app/(tabs)/index.tsx" __tests__/scenarios/monetization.test.tsx
git commit -q -F - <<'EOF'
Discover: once indexing is done, a one-time paywall lists the locked dumps it found

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Search is Pro

**Files:**
- Modify: `src/app/(tabs)/create.tsx`
- Test: `__tests__/scenarios/monetization.test.tsx`

- [ ] **Step 1: Write the failing test** (append)

```tsx
test('free: tapping search opens the paywall instead of the field', async () => {
  await bootApp('/create');
  const field = await screen.findByPlaceholderText('Search keyword, place, date...', {}, { timeout: 10000 });
  await fireEvent(field, 'focus');
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
  expect(screen.queryByText('Last searches')).toBeNull();
  expect(screen.queryByText('Try')).toBeNull();
}, 30000);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/scenarios/monetization.test.tsx -t "search"`
Expected: FAIL, paywall heading not found.

- [ ] **Step 3: Implement**

In `src/app/(tabs)/create.tsx`:

1. Add `import { usePro } from '../../state/Pro';`.
2. `SearchBar`'s props: add `locked: boolean; onLocked: () => void;` to both the destructuring and the type:

```tsx
function SearchBar({ query, searching, onQuery, onCommit, recents, suggestions, onRemoveRecent, locked, onLocked }: {
  query: string; searching: boolean; onQuery: (q: string) => void; onCommit: (q: string) => void;
  recents: string[]; suggestions: string[]; onRemoveRecent: (q: string) => void;
  /** search is Pro: focusing the field opens the paywall instead */
  locked: boolean; onLocked: () => void;
}) {
```

3. Replace `onFocus={() => setFocused(true)}` with:

```tsx
            onFocus={() => { if (locked) { input.current?.blur(); onLocked(); return; } setFocused(true); }}
```

4. In `Create()`, after `const { library, permission } = useApp();` add `const pro = usePro();`.
5. In the `<SearchBar ... />` element add `locked={!pro.isPro} onLocked={() => pro.openPaywall('search')}`.

- [ ] **Step 4: Run, verify, commit**

Run: `npx jest __tests__/scenarios/monetization.test.tsx && npx tsc --noEmit && npx expo lint && npx jest`
Expected: all green.

```bash
git add "src/app/(tabs)/create.tsx" __tests__/scenarios/monetization.test.tsx
git commit -q -F - <<'EOF'
Create: search is Pro; a free user's tap on the field opens the paywall

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Premium film looks

Free: Original and Warm 35mm. Everything else previews freely, and exporting with it asks for Pro or exports without it.

**Files:**
- Modify: `src/services/filters.ts`, `src/components/edit/FilterCard.tsx`, `src/app/edit/[id].tsx`, `src/app/preview/[id].tsx`
- Test: `__tests__/pro-looks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/pro-looks.test.ts
import { DEFAULT_FILTER, FilterState, isProLook, usesProLook, withoutProLooks } from '../src/services/filters';

const f = (x: Partial<FilterState>): FilterState => ({ ...DEFAULT_FILTER, ...x });

test('Original and Warm 35mm are free, the rest are Pro', () => {
  expect(isProLook('none')).toBe(false);
  expect(isProLook('warm35')).toBe(false);
  for (const k of ['cashmere', 'grain', 'sunfade', 'noir'] as const) expect(isProLook(k)).toBe(true);
});

test('a dump uses a Pro look only when one actually shows', () => {
  expect(usesProLook(f({ key: 'cashmere', pct: 68 }))).toBe(true);
  expect(usesProLook(f({ key: 'cashmere', pct: 0 }))).toBe(false);
  // apply-to-all: per-photo looks don't show
  expect(usesProLook(f({ key: 'warm35', all: true, per: { a: { key: 'noir', pct: 50 } } }))).toBe(false);
  expect(usesProLook(f({ key: 'warm35', all: false, per: { a: { key: 'noir', pct: 50 } } }))).toBe(true);
});

test('without Pro looks: Pro ones become Original, free ones stay', () => {
  const out = withoutProLooks(f({ key: 'noir', pct: 40, all: false, per: { a: { key: 'sunfade', pct: 50 }, b: { key: 'warm35', pct: 30 } } }));
  expect(out).toEqual(f({ key: 'none', pct: 40, all: false, per: { a: { key: 'none', pct: 50 }, b: { key: 'warm35', pct: 30 } } }));
  expect(usesProLook(out)).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/pro-looks.test.ts`
Expected: FAIL, `isProLook is not a function`.

- [ ] **Step 3: Implement in `src/services/filters.ts`** (append at the end)

```ts
/** Looks a free user can export (Pro previews the rest freely, docs/superpowers/specs/2026-10-28-monetization-design.md). */
const FREE_LOOKS: FilterKey[] = ['none', 'warm35'];
export const isProLook = (k: FilterKey) => !FREE_LOOKS.includes(k);

/** Looks that actually show on some photo: apply-to-all hides the per-photo ones; 0% is untouched. */
const shown = (f: FilterState): Look[] => (f.all ? [f] : [f, ...Object.values(f.per)]).filter((l) => l.key !== 'none' && l.pct > 0);
export const usesProLook = (f: FilterState) => shown(f).some((l) => isProLook(l.key));

/** "Export without finish": every Pro look back to Original, strengths kept. */
export function withoutProLooks(f: FilterState): FilterState {
  const free = (l: Look): Look => (isProLook(l.key) ? { ...l, key: 'none' } : l);
  return { ...f, ...free(f), per: Object.fromEntries(Object.entries(f.per).map(([id, l]) => [id, free(l)])) };
}
```

- [ ] **Step 4: Run it**

Run: `npx jest __tests__/pro-looks.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: FilterCard marks Pro looks**

In `src/components/edit/FilterCard.tsx`:
- change the filters import to `import { FilterKey, isProLook, Look, PRESETS } from '../../services/filters';`
- change `type Props` to `type Props = { look: Look; all: boolean; onLook: (l: Look) => void; onAll: (on: boolean) => void; /** free user: Pro looks say so (they still preview) */ proLocked?: boolean };`
- change the signature to `export function FilterCard({ look, all, onLook, onAll, proLocked }: Props) {`
- change the Pill's `label={p.label}` to `label={proLocked && isProLook(p.key) ? `${p.label} (Pro)` : p.label}`

In `src/app/edit/[id].tsx`, `Studio` component: add `const { isPro } = usePro();` at its top (import added in Task 6) and change `<FilterCard look={look} all={filter.all} onLook={setLook} onAll={setAll} />` to `<FilterCard look={look} all={filter.all} onLook={setLook} onAll={setAll} proLocked={!isPro} />`.

- [ ] **Step 6: Preview asks before exporting a Pro look**

In `src/app/preview/[id].tsx`:

1. Change the filters import to `import { filterOf, usesProLook, withoutProLooks } from '../../services/filters';`
2. Add `import { Sheet } from '../../components/ui/Sheet';`
3. In `PostedPreview`, after `const [picking, setPicking] = useState(false);` add:

```tsx
  const { isPro, openPaywall } = usePro();
  /** set while the "Pro look" sheet is up: what to do once the user picks */
  const [finishAsk, setFinishAsk] = useState<((strip: boolean) => void) | null>(null);
  /** the PostSheet path: whether the pending post drops the Pro looks */
  const strip = useRef(false);
  const gated = (go: (strip: boolean) => void) => (!isPro && usesProLook(filter) ? setFinishAsk(() => go) : go(false));
  const plain = (d: Dump) => ({ ...d, filter: withoutProLooks(filterOf(d.filter)) as unknown as Dump['filter'] });
```

4. Replace

```tsx
  const post = () => (targets.length ? setPicking(true) : run('post', platform === 'tiktok' ? 'tiktok' : 'instagram'));
  const run = async (what: 'post' | 'save', target: ShareTarget = 'instagram') => {
```

with:

```tsx
  const post = () => gated((s) => {
    strip.current = s;
    if (targets.length) setPicking(true);
    else run('post', platform === 'tiktok' ? 'tiktok' : 'instagram');
  });
  const run = async (what: 'post' | 'save', target: ShareTarget = 'instagram') => {
    const out = strip.current ? plain(dump) : dump;
    strip.current = false;
```

5. Inside `run`, replace `await postDump(deps, dump, target, hd, ...)` with `await postDump(deps, out, target, hd, ...)` and `await saveOnly(deps, dump, hd)` with `await saveOnly(deps, out, hd)`.
6. Change the Save only `onPress={() => run('save')}` to `onPress={() => gated((s) => { strip.current = s; run('save'); })}`, and the PostSheet's `onClose={() => setPicking(false)}` to `onClose={() => { strip.current = false; setPicking(false); }}` (closing without picking must not carry "without finish" to a later post).
7. Before `<PostSheet ...` add:

```tsx
      <Sheet visible={!!finishAsk} onClose={() => setFinishAsk(null)}>
        <Text style={[display(20, 1.15), { color: t.ink }]}>This film look is Pro</Text>
        <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17, marginBottom: 4 }]}>Get Pro to export it, or export these slides with the free looks instead.</Text>
        <Tap onPress={() => { setFinishAsk(null); openPaywall('finish'); }} accessibilityRole="button" style={{ height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.bgScreen }]}>Get Pro</Text>
        </Tap>
        <FrameCard radius={22} onPress={() => { const go = finishAsk; setFinishAsk(null); go?.(true); }} label="Export without finish" style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.ink }]}>Export without finish</Text>
        </FrameCard>
      </Sheet>
```

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npx expo lint && npx jest`
Expected: all green.

```bash
git add src/services/filters.ts src/components/edit/FilterCard.tsx "src/app/edit/[id].tsx" "src/app/preview/[id].tsx" __tests__/pro-looks.test.ts
git commit -q -F - <<'EOF'
Edit/Preview: Pro film looks preview freely; a free export asks for Pro or exports with the free looks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Photos per dump is Pro

**Files:**
- Modify: `src/app/profile.tsx:124-127`

- [ ] **Step 1: Implement**

Replace:

```ts
  // Discover's photos per dump: min 4..max, max min..20
  const setSlides = (k: 'slidesMin' | 'slidesMax', v: number) => {
    setP((x) => ({ ...x, [k]: v }));
```

with:

```ts
  // Discover's photos per dump: min 4..max, max min..20. Pro; a lapsed user keeps the range they set.
  const setSlides = (k: 'slidesMin' | 'slidesMax', v: number) => {
    if (!pro.isPro) return pro.openPaywall('slides-per-dump');
    setP((x) => ({ ...x, [k]: v }));
```

(`pro` is declared right after `const app = useApp();` since Task 4.)

- [ ] **Step 2: Test** (append to `__tests__/scenarios/monetization.test.tsx`)

```tsx
test('free: changing photos per dump opens the paywall and keeps the range', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  await fireEvent.press(screen.getByLabelText('Raise most photos'));
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
  expect((await getProfile()).slidesMax).toBe(10);
}, 30000);
```

Add `import { getProfile } from '../../src/services/profile';` to the test file's imports. (`Stepper` labels its buttons `Lower …` / `Raise …` with the label lower-cased.)

- [ ] **Step 3: Verify and commit**

Run: `npx jest __tests__/scenarios/monetization.test.tsx && npx tsc --noEmit && npx expo lint && npx jest`

```bash
git add src/app/profile.tsx __tests__/scenarios/monetization.test.tsx
git commit -q -F - <<'EOF'
Profile: photos per dump is Pro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: "made with PicDump" end slide on free exports

**Files:**
- Modify: `src/services/slides.tsx`, `src/app/preview/[id].tsx`, `jest/setup.ts`
- Test: `__tests__/scenarios/monetization.test.tsx`

- [ ] **Step 1: Write the failing test** (append)

```tsx
test('free exports end with the PicDump slide; Pro exports do not', async () => {
  const draw = jest.requireMock('@shopify/react-native-skia').drawAsImage as jest.Mock;
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 }));
  draw.mockClear();
  await fireEvent.press(await screen.findByText('Use free unlock'));
  // 6 photo slides + the end slide, rendered ahead in the background
  await waitFor(() => expect(draw).toHaveBeenCalledTimes(7));
}, 30000);
```

Add `waitFor` to the test file's `expo-router/testing-library` import. (The Pro side is covered by `preview-library.test.tsx`'s existing "exactly 6 draws" check, since `world.pro` defaults to true.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/scenarios/monetization.test.tsx -t "end with"`
Expected: FAIL, called 6 times.

- [ ] **Step 3: Skia mock knows text**

In `jest/setup.ts`'s Skia mock: add `Text: Null,` to the components line, and add to the returned object:

```ts
    matchFont: () => ({ getTextWidth: (s: string) => s.length * 10 }),
```

- [ ] **Step 4: Draw the end slide in `src/services/slides.tsx`**

1. Add `matchFont, Text` to the `@shopify/react-native-skia` import.
2. After `const EMPTY = ...;` add:

```tsx
const END_INK = '#3A2A20';

/** Free exports' last slide: "made with" over "PicDump" on the matte. Fonts are the phone's serif / sans. */
function EndCard({ width, height }: { width: number; height: number }) {
  const u = width / UNIT;
  const small = matchFont({ fontFamily: 'sans-serif', fontSize: 9 * u });
  const big = matchFont({ fontFamily: 'serif', fontSize: 24 * u, fontWeight: '600' });
  const line = 'made with', name = 'PicDump';
  return (
    <Group>
      <Rect x={0} y={0} width={width} height={height} color={MATTE} />
      <Text x={(width - small.getTextWidth(line)) / 2} y={height / 2 - 12 * u} text={line} font={small} color={END_INK} />
      <Text x={(width - big.getTextWidth(name)) / 2} y={height / 2 + 16 * u} text={name} font={big} color={END_INK} />
    </Group>
  );
}
```

3. Change the `exportSlides` signature and doc:

```tsx
/**
 * Renders every slide of a dump to JPGs in the cache (1080 px wide, q0.92; 2160 px at q0.95 with High-Res), with its
 * layout, Border/Bleed and filters baked in, plus the PicDump end slide when endCard (free exports). Returns file://
 * uris in slide order. Each call replaces the last export.
 */
export async function exportSlides(d: Dump, opts: { highRes?: boolean; endCard?: boolean } = {}): Promise<string[]> {
```

4. Replace the in-loop write lines

```tsx
      // topic ids hold ':' (topic:2740:…), and MediaLibrary can't tell the MIME type of such a name
      const file = new File(dir, `${d.id.replace(/[^\w-]/g, '_')}-${stamp}-${i + 1}.jpg`);
      file.write(img.encodeToBytes(ImageFormat.JPEG, highRes ? 95 : 92));
      out.push(file.uri);
      img.dispose();
```

with `write(img, i + 1);` and define, right after `const out: string[] = [];`:

```tsx
  const write = (img: SkImage, n: number) => {
    // topic ids hold ':' (topic:2740:…), and MediaLibrary can't tell the MIME type of such a name
    const file = new File(dir, `${d.id.replace(/[^\w-]/g, '_')}-${stamp}-${n}.jpg`);
    file.write(img.encodeToBytes(ImageFormat.JPEG, highRes ? 95 : 92));
    out.push(file.uri);
    img.dispose();
  };
```

5. After the `for` loop (inside the `try`, after the loop's closing brace) add:

```tsx
    if (opts.endCard) {
      const img = await drawAsImage(<EndCard width={width} height={height} />, { width, height });
      if (!img) throw new Error('end slide did not render');
      write(img, slides.length + 1);
    }
```

- [ ] **Step 5: Preview passes `endCard`**

In `src/app/preview/[id].tsx`:

1. Change `exporter()` to take it:

```tsx
function exporter() {
  let cur: { key: string; p: Promise<string[]> } | null = null;
  return (d: Dump, highRes?: boolean, endCard?: boolean) => {
    const key = JSON.stringify([d.photos.map((p) => [p.id, p.uri, p.crop]), d.layout, d.ratio, d.fit, d.filter, !!highRes, !!endCard]);
    if (cur?.key === key) return cur.p;
    const prev = cur?.p.catch(() => {});
    const p: Promise<string[]> = Promise.resolve(prev).then(() => {
      if (cur?.p !== p) throw new Error('superseded');
      return exportSlides(d, { highRes, endCard });
    });
    p.catch(() => { if (cur?.p === p) cur = null; });
    cur = { key, p };
    return p;
  };
}
```

2. In `PostedPreview`, the `usePro()` line from Task 9 is above; replace

```tsx
  useEffect(() => { exportFor(dump, hd).catch((e) => e.message === 'superseded' || console.warn('[preview] export failed:', e)); }, [dump, hd, exportFor]);
  const deps = useMemo(() => ({ ...postDeps(stories), exportSlides: exportFor }), [stories, exportFor]);
```

with:

```tsx
  useEffect(() => { exportFor(dump, hd, !isPro).catch((e) => e.message === 'superseded' || console.warn('[preview] export failed:', e)); }, [dump, hd, exportFor, isPro]);
  const deps = useMemo(() => ({ ...postDeps(stories), exportSlides: (d: Dump, h?: boolean) => exportFor(d, h, !isPro) }), [stories, exportFor, isPro]);
```

3. Move the `const { isPro, openPaywall } = usePro();` line (Task 9) above this `useEffect` if it isn't already.

Note: the slide counts in the done sheet ("6 slides saved") now count the end slide for free users (7). That is accurate (7 files are saved).

- [ ] **Step 6: Verify and commit**

Run: `npx jest __tests__/scenarios/monetization.test.tsx && npx tsc --noEmit && npx expo lint && npx jest`
Expected: all green.

```bash
git add src/services/slides.tsx "src/app/preview/[id].tsx" jest/setup.ts __tests__/scenarios/monetization.test.tsx
git commit -q -F - <<'EOF'
Export: free dumps end with a "made with PicDump" slide; Pro exports don't

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 12: Developer tools for the weekly unlock

**Files:**
- Modify: `src/app/profile.tsx` (Developer tools section)

- [ ] **Step 1: Implement**

Add `import { daysLeft, NO_UNLOCKS, UNLOCK_EVERY } from '../services/unlocks';` and, in the Developer tools section right after the "Fake Pro subscription" row, add:

```tsx
          <Row label="Free unlock" sub={`${pro.unlocks.ids.length} unlocked · ${daysLeft(pro.unlocks, Date.now()) ? `next in ${daysLeft(pro.unlocks, Date.now())} days` : 'one free now'}. Tap to reset`}
            onPress={() => pro.setUnlocks(NO_UNLOCKS)} />
          <Row label="Pretend 7 days passed" sub="Moves the last free unlock a week back." onPress={() => pro.setUnlocks({ ...pro.unlocks, lastAt: pro.unlocks.lastAt == null ? null : pro.unlocks.lastAt - UNLOCK_EVERY })} />
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit && npx expo lint && npx jest`

```bash
git add src/app/profile.tsx
git commit -q -F - <<'EOF'
Developer tools: Free unlock (reset) and Pretend 7 days passed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 13: Docs and the old "no paywall" test

**Files:**
- Modify: `__tests__/scenarios/profile.test.tsx`, `README.md`, `docs/superpowers/specs/2026-10-28-monetization-design.md`

- [ ] **Step 1: Replace the "no paywall or crown anywhere" test**

It asserted the old paywalls-off world. Replace the whole test with:

```tsx
// Pro sees no locks or upsells outside Profile's Pro card; no screen talks to the store SDK directly
test('Pro: no lock or upsell anywhere', async () => {
  for (const url of ['/', '/create', '/library']) {
    await bootApp(url);
    await screen.findAllByLabelText('Profile and settings', {}, { timeout: 10000 }).catch(() => screen.findByText('Profile & Settings'));
    expect(dump().filter((s) => PAYWALL.test(s))).toEqual([]);
    screen.unmount();
  }
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : []));
  for (const f of files(path.resolve(__dirname, '../../src'))) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect([f, /\bCrown\b|react-native-purchases|presentPaywall/.test(code)]).toEqual([f, false]);
  }
}, 30000);
```

- [ ] **Step 2: README**

Replace the README line starting `- **Pro:**` with:

```markdown
- **Pro:** RevenueCat subscription (`react-native-purchases`, entitlement `daydump_pro`). Free users see every Discover dump's title but only the 8 PM recap and one dump a week unlocked; Pro opens all of them, search, every film look, 4-20 photos per dump, and drops the "made with PicDump" end slide. Plans, prices and trials come from the store offering. `PAYWALLS_ENABLED` in `src/constants/flags.ts` is the kill switch. Design: `docs/superpowers/specs/2026-10-28-monetization-design.md`.
```

and in "Developer tools" add `Free unlock reset, Pretend 7 days passed, Onboarding every launch` to the list.

- [ ] **Step 3: Fold the deviations into the spec**

In the spec:
- "Weekly unlock" → state is `{ lastAt, ids }`; the snapshot is the story's Library draft made at unlock time.
- "Components" → `src/state/Pro.tsx` (`ProProvider`, `usePro()`) instead of AppState; `LockedDumpCard` is the existing Discover `Tile`/`Hero` with `locked` (expo-image `blurRadius`).
- "Free vs Pro" → premium looks = all but Original and Warm 35mm; photos per dump: a lapsed user keeps their range.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npx expo lint && npx jest`

```bash
git add __tests__/scenarios/profile.test.tsx README.md docs/superpowers/specs/2026-10-28-monetization-design.md
git commit -q -F - <<'EOF'
Docs: README and spec describe the shipped free / Pro split; Pro-sees-no-upsell test replaces the paywalls-off one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 14: Store setup and device check (manual, not code)

- [ ] Play Console: subscription `picdump_weekly` (base plan weekly, $3.99, no offer) and `picdump_yearly` (base plan yearly, $29.99, free-trial offer P1W, new customers only). Apply a regional price template.
- [ ] Play Console → Monetization setup: grace period on (7 days weekly is capped by period; 14 days yearly), account hold on.
- [ ] RevenueCat: both products attached to entitlement `daydump_pro`; current offering = `$rc_weekly` then `$rc_annual` (offering order is paywall order).
- [ ] Play internal track build (`versionCode` +1 in `app.json`, `npx expo prebuild -p android`), license tester account:
  - fresh install → onboarding → index finishes → "We found N dumps" paywall once
  - locked tile → Use free unlock → Preview → Save only: last slide is "made with PicDump"
  - second locked tile → "next free dump in 7 days" → Unlock all with Pro → annual trial → everything opens, no end slide
  - Create search as free → paywall
  - cancel in Play → after expiry, locks return; the unlocked draft stays in Library
  - Restore purchases on a reinstall
- [ ] `npx expo-doctor`
```
