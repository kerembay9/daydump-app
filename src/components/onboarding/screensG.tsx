import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, ToastAndroid, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { PAINS } from '../../services/onboardingFlow';
import { paywallPlans, type PlanRow } from '../../services/paywallPlans';
import { RevenueCatService } from '../../services/revenuecat';
import { useApp } from '../../state/AppState';
import { useOnboardingFlow } from '../../state/OnboardingFlow';
import { usePro } from '../../state/Pro';
import { tr } from '../../i18n';
import { Icons } from '../ui/Icons';
import { Tap } from '../ui/Tap';
import { Card, Shell } from './Shell';
import { PrintSpec, PrintStack, usePic } from './Prints';
import { Nav, Note, RowsCard } from './parts';

/** Phase G · Conversion (screens 28-30): the recap, the paywall, and done. */

const toast = (m: string) => (Platform.OS === 'android' ? ToastAndroid.show(m, ToastAndroid.SHORT) : Alert.alert(m));

/** 28 · Here's what you set up */
export function RecapScreen({ nav }: { nav: Nav }) {
  const { answers, access, index } = useOnboardingFlow();
  const app = useApp();
  const n = app.stories.length + app.moreStories;
  const no = access !== 'full';
  const style = [tr(`onboarding.flow.opt.look.${answers.look}`), answers.ratio, tr(`onboarding.flow.opt.layout.${answers.layout}`), tr('onboarding.flow.style.photos', { count: answers.size })].join(' · ');
  const found = no ? tr('onboarding.flow.recap.foundNone') : index && n ? tr('onboarding.flow.recap.found', { count: n }) : tr('onboarding.flow.recap.foundFirst');
  const reminders = answers.notif === true ? `${tr('onboarding.flow.recap.daily', { time: answers.time })}${answers.weekly ? ` · ${tr('onboarding.flow.recap.sunday')}` : ''}` : tr('onboarding.flow.recap.off');
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr('onboarding.flow.recap.title')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <RowsCard style={{ marginTop: 8 }} rows={[
        { k: tr('onboarding.flow.recap.style'), v: style }, { k: tr('onboarding.flow.recap.foundLabel'), v: found }, { k: tr('onboarding.flow.recap.reminders'), v: reminders },
      ]} />
      <Note>{tr('onboarding.flow.recap.note')}</Note>
    </Shell>
  );
}

// the Pro features, in the order the pains they fix were picked (design: Features)
const FEATURES = [
  { id: 'dumps', icon: Icons.carousel, pains: ['many', 'choose'] },
  { id: 'search', icon: Icons.search, pains: ['many', 'forget'] },
  { id: 'looks', icon: Icons.sparkle, pains: ['edit'] },
  { id: 'tidy', icon: Icons.trash, pains: ['dupes'] },
  { id: 'yours', icon: Icons.crop, pains: ['choose', 'caption'] },
] as const;

const trialDays = (p: PlanRow | null) => { const m = p?.trial ? /(\d+)-day/.exec(p.trial) : null; return m ? +m[1] : null; };

/** The line under a plan with no trial: how often it bills (the weekly plan said "monthly"). */
const BILLED: Record<string, string> = { WEEKLY: 'billedWeekly', MONTHLY: 'billedMonthly', ANNUAL: 'billedYearly' };

/**
 * 29 · Paywall: the store's own plans (prices, trial, order from RevenueCat), the features ordered by what they said stops them, a trial
 * timeline when the plan has one. Search and clutter rows only show where the phone can do them. Close or "Continue free" ends at the free tier.
 */
export function PaywallScreen({ onPurchased, onFree }: { onPurchased: () => void; onFree: () => void }) {
  const { t } = useTheme();
  const { answers, set, index, tidy, access } = useOnboardingFlow();
  const app = useApp();
  const { refresh } = usePro();
  const pic = usePic();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    RevenueCatService.getOfferings().then((o) => {
      if (!live) return;
      const rows = paywallPlans(o?.current?.availablePackages ?? []);
      setPlans(rows);
      setSelected((s) => s ?? (rows.find((r) => r.trial) ?? rows[0])?.id ?? null);
    }).catch(() => { if (live) setPlans([]); });
    return () => { live = false; };
  }, [attempt]);
  const plan = useMemo(() => plans?.find((p) => p.id === selected) ?? null, [plans, selected]);
  const days = trialDays(plan);
  const n = app.stories.length + app.moreStories;
  const found = access === 'full' && index && n > 0;
  const features = FEATURES.filter((f) => (f.id !== 'search' || index) && (f.id !== 'tidy' || tidy))
    .map((f, i) => { const r = f.pains.map((p) => answers.pains.indexOf(p)).filter((x) => x >= 0); return { ...f, rank: r.length ? Math.min(...r) : PAINS.length + i }; })
    .sort((a, b) => a.rank - b.rank);

  const subscribe = async () => {
    if (!plan || purchasing) return;
    setPurchasing(true);
    try {
      const res = await RevenueCatService.purchasePackage(plan.pkg);
      if (res.success) { await refresh().catch(() => {}); onPurchased(); }
      else if (!res.error) { toast(tr('paywall.purchaseNotActive')); await refresh().catch(() => {}); onPurchased(); }
      else if (res.error !== 'User cancelled') toast(res.error);
    } finally { setPurchasing(false); }
  };
  const restore = async () => {
    setPurchasing(true);
    try {
      const res = await RevenueCatService.restorePurchases();
      if (res.isPro) { toast(tr('paywall.restored')); await refresh().catch(() => {}); onPurchased(); } else toast(res.error ?? tr('paywall.noSubscription'));
    } finally { setPurchasing(false); }
  };

  const failed = plans != null && plans.length === 0;
  const prints: PrintSpec[] = [
    { x: 60, y: 18, w: 84, h: 84, r: -6, bg: pic(0) }, { x: 198, y: 14, w: 84, h: 84, r: 6, bg: pic(1) },
    { x: 112, y: 4, w: 118, h: 102, r: -1, bg: pic(2), tape: true, cells: [pic(2), pic(3), pic(4), pic(5)] },
  ];
  return (
    <Shell onClose={onFree} busy={purchasing}
      headline={found ? tr('onboarding.flow.paywall.titleFound', { count: n }) : tr('onboarding.flow.paywall.title')}
      primary={{ label: plan?.trial ? tr('paywall.startTrial', { trial: plan.trial }) : tr('paywall.continue'), onPress: subscribe, disabled: !plan }}
      links={[{ label: tr('paywall.restore'), onPress: restore }, { label: tr('onboarding.flow.paywall.free'), onPress: onFree }]}
      above={<PrintStack prints={prints} height={112} />}>
      <View style={{ gap: 14, marginTop: 4 }}>
        <Card style={{ padding: 14, gap: 12 }}>
          {features.map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}><f.icon size={16} color={t.ink} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[ui(13, 600), { color: t.ink }]}>{tr(`paywall.feature.${f.id}.title`)}</Text>
                <Text style={[ui(11, 500), { color: t.inkMuted }]}>{tr(`paywall.feature.${f.id}.sub`)}</Text>
              </View>
            </View>
          ))}
        </Card>
        {days ? (
          <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="list">
            {[[tr('onboarding.flow.paywall.today'), tr('onboarding.flow.paywall.unlock')], [tr('onboarding.flow.paywall.day', { n: Math.max(2, days - 1) }), tr('onboarding.flow.paywall.reminder')], [tr('onboarding.flow.paywall.day', { n: days }), tr('onboarding.flow.paywall.billing')]].map(([k, v], i) => (
              <View key={k + i} style={{ flex: 1, gap: 4 }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: t.ink, backgroundColor: i === 0 ? t.ink : t.bgScreen }} />
                <Text style={[ui(11, 600), { color: t.ink }]}>{k}</Text>
                <Text style={[ui(10, 500), { color: t.inkMuted }]}>{v}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {plans == null ? <ActivityIndicator color={t.ink} /> : failed ? (
          <Card style={{ padding: 14, gap: 10 }}>
            <View style={{ gap: 2 }}>
              <Text style={[ui(13, 600), { color: t.ink }]}>{tr('onboarding.flow.paywall.failed')}</Text>
              <Text style={[ui(11, 500), { color: t.inkMuted }]}>{tr('onboarding.flow.paywall.failedSub')}</Text>
            </View>
            <Tap onPress={() => { setPlans(null); setAttempt((x) => x + 1); }} accessibilityRole="button" style={{ height: 44, borderRadius: 22, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[ui(13, 600), { color: t.ink }]}>{tr('common.tryAgain')}</Text>
            </Tap>
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
            {plans.map((p) => {
              const on = p.id === selected;
              const best = p.pkg.packageType === 'ANNUAL';
              return (
                <Tap key={p.id} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelected(p.id); set('plan', best ? 'annual' : 'monthly'); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  accessibilityLabel={`${p.title}, ${p.price}${p.trial ? `, ${p.trial}` : ''}`} style={{ flex: 1, gap: 3, padding: 14, borderRadius: 16, backgroundColor: t.bgCard, borderWidth: 1.5, borderColor: on ? t.ink : t.borderSubtle }}>
                  {best ? <View style={{ position: 'absolute', top: -9, right: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: t.ink }}><Text style={[ui(10, 600), { color: t.bgScreen }]}>{tr('onboarding.flow.paywall.best')}</Text></View> : null}
                  <Text style={[ui(13, 600), { color: t.ink }]}>{p.title}</Text>
                  <Text style={[display(15), { color: t.ink }]}>{p.price}</Text>
                  <Text style={[ui(11, 500), { color: t.inkMuted }]}>{p.trial ?? tr(`onboarding.flow.paywall.${BILLED[p.pkg.packageType as string] ?? 'billedMonthly'}`)}</Text>
                </Tap>
              );
            })}
          </View>
        )}
        <Text style={[ui(10), { color: t.inkMuted, textAlign: 'center', lineHeight: 14 }]}>{plan?.trial ? tr('paywall.trialThen', { price: plan.price }) : ''}{tr('paywall.disclosure')}</Text>
      </View>
    </Shell>
  );
}

/** 30 · Done: Pro welcome, or the free tier with the first dump waiting at the top of Discover */
export function DoneScreen({ pro, onOpen }: { pro: boolean; onOpen: () => void }) {
  const pic = usePic();
  useEffect(() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }, []);
  const prints: PrintSpec[] = [
    { x: 30, y: 54, w: 128, h: 160, r: -7, bg: pic(0) }, { x: 186, y: 44, w: 128, h: 160, r: 7, bg: pic(1) },
    { x: 80, y: 24, w: 182, h: 226, r: -1.5, bg: pic(2), bw: 5, tape: true, cells: [pic(2), pic(3), pic(4), pic(5)], chip: tr('onboarding.flow.done.today') },
  ];
  return (
    <Shell justify="center" headline={tr(pro ? 'onboarding.flow.done.titlePro' : 'onboarding.flow.done.title')} sub={tr(pro ? 'onboarding.flow.done.subPro' : 'onboarding.flow.done.sub')}
      primary={{ label: tr('onboarding.flow.done.cta'), onPress: onOpen }} above={<PrintStack prints={prints} height={300} />} />
  );
}

