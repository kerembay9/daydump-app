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
      } else if (!res.error) {
        // paid, but the entitlement isn't on the customer info yet (store delay, a product not mapped in RevenueCat)
        toast('Purchase went through but Pro didn’t switch on yet. Tap Restore purchases.');
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
            <FeatureRow icon={Icons.trash} title="Clear repeats and clutter" sub="Move duplicates, blurry shots and screenshots to Trash in one go." />
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
