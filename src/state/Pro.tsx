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
  // `at`: when the sheet opened, so its text is computed outside render
  const [asking, setAsking] = useState<{ story: Story; at: number } | null>(null);

  const refresh = useCallback(async () => { setSub(await getSubscription()); }, []);
  useEffect(() => {
    loadUnlocks().then(setU);
    getSubscription().then(setSub);
    // renewals, cancellations and purchases made elsewhere (another device, the store's own page)
    return RevenueCatService.addCustomerInfoListener(() => { getSubscription().then(setSub); });
  }, []);

  const isPro = !PAYWALLS_ENABLED || sub != null;
  const setUnlocks = useCallback(async (u: Unlocks) => { setU(u); await saveUnlocks(u); }, []);
  const openPaywall = useCallback((source: PaywallSource, found?: string[]) => {
    setPaywall({ source, found });
    RevenueCatService.setPaywallSource(source);
  }, []);

  const value = useMemo<ProValue>(() => ({
    isPro, sub, unlocks, refresh, setUnlocks, openPaywall,
    accessOf: (s) => access(s, isPro, unlocks),
    askUnlock: (s) => setAsking({ story: s, at: Date.now() }),
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
      <UnlockSheet story={asking?.story ?? null} now={asking?.at ?? 0} unlocks={unlocks} onUse={spendUnlock} onPro={() => { setAsking(null); openPaywall('locked-dump'); }} onClose={() => setAsking(null)} />
      <PaywallModal visible={!!paywall} source={paywall?.source ?? 'profile'} found={paywall?.found} onClose={() => setPaywall(null)} onPurchased={refresh} />
    </Ctx.Provider>
  );
}

export function usePro(): ProValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePro outside ProProvider');
  return v;
}

function UnlockSheet({ story, now, unlocks, onUse, onPro, onClose }: {
  story: Story | null; now: number; unlocks: Unlocks; onUse: (s: Story) => void; onPro: () => void; onClose: () => void;
}) {
  const { t } = useTheme();
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
