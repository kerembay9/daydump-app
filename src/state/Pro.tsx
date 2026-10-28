import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { PAYWALLS_ENABLED } from '../constants/flags';
import { access, Access } from '../services/access';
import { draftForStory } from '../services/dumps';
import { RevenueCatService } from '../services/revenuecat';
import type { Story } from '../services/stories';
import { getSubscription, Sub } from '../services/subscription';
import { canUnlock, daysLeft, loadUnlocks, NO_UNLOCKS, saveUnlocks, StorySpan, unlock, unlockedAs, Unlocks } from '../services/unlocks';
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
  /** the subscription as Profile shows it; null = none (or not known yet) */
  sub: Sub | null;
  /** Pro or free is known: RevenueCat answered this session, or the last answer was cached. False = assumed free. */
  known: boolean;
  /** RevenueCat answered this session (a cached answer may be stale) */
  checked: boolean;
  unlocks: Unlocks;
  accessOf: (s: Pick<Story, 'id' | 'kind' | 'start' | 'end'>) => Access;
  /** The id this story was unlocked under (a re-index can re-id it since); its draft is the snapshot. Null = never unlocked. */
  unlockedIdOf: (s: StorySpan) => string | null;
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

/** RevenueCat's last answer, so a subscriber starts Pro on a cold start (offline too) instead of free until it answers. */
const KNOWN = '@picdump_pro_known';
type Known = { sub: Sub | null; known: boolean; checked: boolean };

async function loadKnown(now: number): Promise<Sub | null | undefined> {
  try {
    const raw = await AsyncStorage.getItem(KNOWN);
    if (!raw) return undefined;
    const { sub } = JSON.parse(raw) as { sub: Sub | null };
    // a cancelled sub past its end is over, whatever RevenueCat says later
    return sub && !sub.renews && sub.until < now ? null : sub;
  } catch {
    return undefined;
  }
}

export function ProProvider({ children }: { children: React.ReactNode }) {
  // until the cache is read, nothing renders: a subscriber's first frame would show locked dumps
  const [ready, setReady] = useState(false);
  const [pro, setPro] = useState<Known>({ sub: null, known: false, checked: false });
  const [unlocks, setU] = useState<Unlocks>(NO_UNLOCKS);
  // until the stored unlocks are in, spending would overwrite them with NO_UNLOCKS
  const [unlocksLoaded, setUnlocksLoaded] = useState(false);
  const [paywall, setPaywall] = useState<{ source: PaywallSource; found?: string[] } | null>(null);
  // `at`: when the sheet opened, so its text is computed outside render
  const [asking, setAsking] = useState<{ story: Story; at: number } | null>(null);

  // undefined: RevenueCat couldn't tell (offline with nothing cached, an SDK error): keep what we knew
  const apply = useCallback((sub: Sub | null | undefined) => {
    if (sub === undefined) return;
    setPro({ sub, known: true, checked: true });
    AsyncStorage.setItem(KNOWN, JSON.stringify({ sub })).catch((e) => console.warn('[pro] cache failed:', e));
  }, []);
  const refresh = useCallback(async () => { apply(await getSubscription()); }, [apply]);
  useEffect(() => {
    loadKnown(Date.now()).then((sub) => {
      // RevenueCat may have answered first: its answer wins
      if (sub !== undefined) setPro((cur) => (cur.checked ? cur : { sub, known: true, checked: false }));
      setReady(true);
    });
    loadUnlocks().then((u) => { setU(u); setUnlocksLoaded(true); });
    getSubscription().then(apply);
    // renewals, cancellations and purchases made elsewhere (another device, the store's own page)
    return RevenueCatService.addCustomerInfoListener(() => { getSubscription().then(apply); });
  }, [apply]);

  const { sub, known, checked } = pro;
  const isPro = !PAYWALLS_ENABLED || sub != null;
  const setUnlocks = useCallback(async (u: Unlocks) => { setU(u); await saveUnlocks(u); }, []);
  const openPaywall = useCallback((source: PaywallSource, found?: string[]) => {
    setPaywall({ source, found });
    RevenueCatService.setPaywallSource(source);
  }, []);

  const value = useMemo<ProValue>(() => ({
    isPro, sub, known, checked, unlocks, refresh, setUnlocks, openPaywall,
    accessOf: (s) => access(s, isPro, unlocks),
    unlockedIdOf: (s) => unlockedAs(unlocks, s),
    askUnlock: (s) => setAsking({ story: s, at: Date.now() }),
  }), [isPro, sub, known, checked, unlocks, refresh, setUnlocks, openPaywall]);

  /**
   * Spends the week's unlock and makes the story's draft now: the draft is the snapshot Preview and Edit open.
   * `spending` keeps the sheet saying "use it on this one?" (not "next in 7 days") until it closes, and blocks a double tap.
   */
  const spending = useRef(false);
  const [spendingNow, setSpendingNow] = useState(false);
  const spendUnlock = async (s: Story) => {
    if (!unlocksLoaded || spending.current) return;
    spending.current = true;
    setSpendingNow(true);
    let ok = false;
    try {
      // throws on a stale state (spent elsewhere) or a clock moved back
      const next = unlock(unlocks, s, Date.now());
      await setUnlocks(next);
      await draftForStory(s, unlockedAs(next, s)).catch((e) => console.warn('[pro] unlock draft failed:', e));
      ok = true;
    } catch (e) {
      console.warn('[pro] unlock failed:', e);
    }
    spending.current = false;
    setSpendingNow(false);
    setAsking(null);
    if (ok) router.push({ pathname: '/preview/[id]', params: { id: s.id } });
  };

  return (
    <Ctx.Provider value={value}>
      {ready && children}
      <UnlockSheet story={asking?.story ?? null} now={asking?.at ?? 0} unlocks={unlocks} ready={unlocksLoaded} spending={spendingNow} onUse={spendUnlock} onPro={() => { setAsking(null); openPaywall('locked-dump'); }} onClose={() => setAsking(null)} />
      <PaywallModal visible={!!paywall} source={paywall?.source ?? 'profile'} found={paywall?.found} onClose={() => setPaywall(null)} onPurchased={refresh} />
    </Ctx.Provider>
  );
}

export function usePro(): ProValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePro outside ProProvider');
  return v;
}

function UnlockSheet({ story, now, unlocks, ready, spending, onUse, onPro, onClose }: {
  story: Story | null; now: number; unlocks: Unlocks; ready: boolean; spending: boolean; onUse: (s: Story) => void; onPro: () => void; onClose: () => void;
}) {
  const { t } = useTheme();
  // while spending, the unlocks already say "used": keep the offer up until the sheet closes
  const free = spending || canUnlock(unlocks, now);
  const days = daysLeft(unlocks, now);
  return (
    <Sheet visible={!!story} onClose={onClose}>
      <Text style={[display(20, 1.15), { color: t.ink }]}>{story?.title}</Text>
      <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17, marginBottom: 4 }]}>
        {!ready ? `${story?.subtitle}.`
          : free ? `${story?.subtitle}. You get one free dump a week: use it on this one?`
          : `${story?.subtitle}. Your next free dump is in ${days} day${days === 1 ? '' : 's'}.`}
      </Text>
      {ready && free && (
        <Tap onPress={() => story && onUse(story)} disabled={spending} accessibilityRole="button" style={{ height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.bgScreen }]}>Use free unlock</Text>
        </Tap>
      )}
      <FrameCard radius={22} onPress={onPro} label="Unlock all with Pro" style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[ui(13, 600), { color: t.ink }]}>Unlock all with Pro</Text>
      </FrameCard>
    </Sheet>
  );
}
