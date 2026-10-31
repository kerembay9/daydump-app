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
import type { PaywallSource } from '../state/Pro';
import { tr } from '../i18n';

const toast = (m: string) => (Platform.OS === 'android' ? ToastAndroid.show(m, ToastAndroid.SHORT) : console.log('[paywall]', m));

/** The heading for what was tapped; everything else (a locked dump, Profile, photos per dump) gets the dumps one. */
const DUMPS = { heading: 'paywall.dumps.heading', sub: 'paywall.dumps.sub' };
const COPY: Partial<Record<PaywallSource, { heading: string; sub: string }>> = {
  tidy: { heading: 'paywall.tidy.heading', sub: 'paywall.tidy.sub' },
  finish: { heading: 'paywall.finish.heading', sub: 'paywall.finish.sub' },
  search: { heading: 'paywall.search.heading', sub: 'paywall.search.sub' },
};

/**
 * PicDump Pro. Plans, prices and trials are the current RevenueCat offering's packages, in its order; the first with a
 * trial starts selected. found: the dump titles Discover just found (the first-full-Discover paywall).
 */
export function PaywallModal({ visible, onClose, onPurchased, source, found }: {
  visible: boolean;
  onClose: () => void;
  onPurchased?: () => void;
  source?: PaywallSource;
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
        toast(tr('paywall.welcome'));
        onPurchased?.();
        onClose();
      } else if (!res.error) {
        // paid, but the entitlement isn't on the customer info yet (store delay, a product not mapped in RevenueCat)
        toast(tr('paywall.purchaseNotActive'));
        onPurchased?.();
      } else if (res.error !== 'User cancelled') toast(res.error);
    } finally {
      setPurchasing(false);
    }
  };

  const restore = async () => {
    setPurchasing(true);
    try {
      const res = await RevenueCatService.restorePurchases();
      if (res.isPro) {
        toast(tr('paywall.restored'));
        onPurchased?.();
        onClose();
      } else toast(res.error ?? tr('paywall.noSubscription'));
    } finally {
      setPurchasing(false);
    }
  };

  const n = found?.length ?? 0;
  const copy = (source && COPY[source]) || DUMPS;
  const heading = n ? tr('paywall.found.heading', { count: n }) : tr(copy.heading);
  const sub = n ? tr(n > 3 ? 'paywall.found.subMore' : 'paywall.found.sub', { titles: found!.slice(0, 3).join(', ') }) : tr(copy.sub);

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
          <Tap onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={tr('paywall.close')}
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
            <FeatureRow icon={Icons.carousel} title={tr('paywall.feature.dumps.title')} sub={tr('paywall.feature.dumps.sub')} />
            <FeatureRow icon={Icons.search} title={tr('paywall.feature.search.title')} sub={tr('paywall.feature.search.sub')} />
            <FeatureRow icon={Icons.sparkle} title={tr('paywall.feature.looks.title')} sub={tr('paywall.feature.looks.sub')} />
            <FeatureRow icon={Icons.trash} title={tr('paywall.feature.tidy.title')} sub={tr('paywall.feature.tidy.sub')} />
            <FeatureRow icon={Icons.crop} title={tr('paywall.feature.yours.title')} sub={tr('paywall.feature.yours.sub')} />
          </FrameCard>

          <View style={{ gap: 10, marginTop: 4 }}>
            {plans == null ? <ActivityIndicator color={t.ink} /> : plans.length === 0 ? (
              <Text style={[ui(12), { color: t.inkMuted, textAlign: 'center' }]}>{tr('paywall.plansFailed')}</Text>
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
              : <Text style={[ui(14, 600), { color: t.bgScreen }]}>{plan?.trial ? tr('paywall.startTrial', { trial: plan.trial }) : tr('paywall.continue')}</Text>}
          </Tap>

          <View style={{ alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Tap onPress={restore} disabled={purchasing} hitSlop={8}>
              <Text style={[ui(12, 500), { color: t.inkMuted, textDecorationLine: 'underline' }]}>{tr('paywall.restore')}</Text>
            </Tap>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Tap onPress={() => setLegal('terms')} hitSlop={6}><Text style={[ui(10.5), { color: t.inkMuted }]}>{tr('common.termsOfService')}</Text></Tap>
              <Text style={[ui(10.5), { color: t.inkMuted }]}>·</Text>
              <Tap onPress={() => setLegal('privacy')} hitSlop={6}><Text style={[ui(10.5), { color: t.inkMuted }]}>{tr('common.privacyPolicy')}</Text></Tap>
            </View>
            <Text style={[ui(10), { color: t.inkMuted, textAlign: 'center', lineHeight: 14 }]}>
              {plan?.trial ? tr('paywall.trialThen', { price: plan.price }) : ''}{tr('paywall.disclosure')}
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
