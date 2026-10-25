import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, Text, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { Icons } from './ui/Icons';
import { FrameCard } from './ui/FrameCard';
import { Tap } from './ui/Tap';
import { RevenueCatService, type PurchasesPackage } from '../services/revenuecat';
import { LegalModal, type LegalDocType } from './LegalModal';

const toast = (m: string) => (Platform.OS === 'android' ? ToastAndroid.show(m, ToastAndroid.SHORT) : console.log('[paywall]', m));

export function PaywallModal({
  visible,
  onClose,
  onPurchased,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased?: () => void;
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<'yearly' | 'weekly'>('yearly');
  const [, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [legal, setLegal] = useState<LegalDocType | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    RevenueCatService.getOfferings().then((offerings) => {
      if (!active) return;
      const pkgs = offerings?.current?.availablePackages ?? [];
      setPackages(pkgs);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [visible]);

  // Find packages
  const annualPkg = packages.find(
    (p) => p.packageType === 'ANNUAL' || p.identifier.includes('annual') || p.identifier.includes('year')
  );
  const weeklyPkg = packages.find(
    (p) => p.packageType === 'WEEKLY' || p.identifier.includes('week')
  );

  const annualPrice = annualPkg?.product.priceString ?? '$29.99/year';
  const weeklyPrice = weeklyPkg?.product.priceString ?? '$2.99/week';

  const handleSubscribe = async () => {
    setPurchasing(true);
    try {
      const targetPkg = selected === 'yearly' ? (annualPkg ?? packages[0]) : (weeklyPkg ?? packages[0]);
      let res;
      if (targetPkg) {
        res = await RevenueCatService.purchasePackage(targetPkg);
      } else {
        res = await RevenueCatService.purchasePlan(selected);
      }

      if (res.success) {
        toast('Welcome to PicDump Pro!');
        onPurchased?.();
        onClose();
      } else if (res.error) {
        toast(res.error);
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        toast(e.message || 'Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      const res = await RevenueCatService.restorePurchases();
      if (res.isPro) {
        toast('Purchases restored. Welcome back to Pro!');
        onPurchased?.();
        onClose();
      } else {
        toast('No active PicDump Pro subscription found.');
      }
    } catch (e: any) {
      toast(e.message || 'Restore failed.');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.bgScreen, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}>
        {/* Top Header */}
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
          {/* Hero Value Statement */}
          <View style={{ gap: 6 }}>
            <Text style={[display(26, 1.1), { color: t.ink }]}>Curate and export without limits.</Text>
            <Text style={[ui(13), { color: t.inkMuted, lineHeight: 18 }]}>
              Standout moments, unlimited daily carousels, and high-definition exports for Instagram and TikTok.
            </Text>
          </View>

          {/* Feature highlights */}
          <FrameCard radius={18} padding={14} style={{ gap: 12 }}>
            <FeatureRow icon={Icons.carousel} title="Unlimited Daily Dumps" sub="Create, curate, and save as many dumps as you take." />
            <FeatureRow icon={Icons.sparkle} title="Ultra HD 2160 px Export" sub="Pristine slide quality optimized for social feeds and stories." />
            <FeatureRow icon={Icons.search} title="Natural Language Search" sub="Find any trip, food, outfit, or scene using on-device AI." />
            <FeatureRow icon={Icons.crop} title="Exclusive Frame Styles" sub="Full access to cashmere borders, film look, and split ratios." />
          </FrameCard>

          {/* Plan Selector */}
          <View style={{ gap: 10, marginTop: 4 }}>
            {/* Annual Plan */}
            <Tap onPress={() => setSelected('yearly')} accessibilityRole="button"
              style={{
                borderWidth: selected === 'yearly' ? 2 : 1,
                borderColor: selected === 'yearly' ? t.ink : t.borderSubtle,
                borderRadius: 16,
                padding: 14,
                backgroundColor: t.bgCard,
                position: 'relative',
              }}>
              <View style={{ position: 'absolute', top: -10, right: 16, backgroundColor: t.accentFab, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                <Text style={[ui(10, 700), { color: t.accentFabText }]}>BEST VALUE · SAVE 80%</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ gap: 2 }}>
                  <Text style={[ui(15, 600), { color: t.ink }]}>Annual Access</Text>
                  <Text style={[ui(11.5), { color: t.inkMuted }]}>{annualPrice} (Just ~$2.49 / month)</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected === 'yearly' ? t.ink : t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                  {selected === 'yearly' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.ink }} />}
                </View>
              </View>
            </Tap>

            {/* Weekly Plan */}
            <Tap onPress={() => setSelected('weekly')} accessibilityRole="button"
              style={{
                borderWidth: selected === 'weekly' ? 2 : 1,
                borderColor: selected === 'weekly' ? t.ink : t.borderSubtle,
                borderRadius: 16,
                padding: 14,
                backgroundColor: t.bgCard,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ gap: 2 }}>
                  <Text style={[ui(15, 600), { color: t.ink }]}>Weekly Access</Text>
                  <Text style={[ui(11.5), { color: t.inkMuted }]}>{weeklyPrice}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected === 'weekly' ? t.ink : t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                  {selected === 'weekly' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.ink }} />}
                </View>
              </View>
            </Tap>
          </View>

          {/* CTA Button */}
          <Tap onPress={handleSubscribe} disabled={purchasing} accessibilityRole="button"
            style={{
              height: 48,
              borderRadius: 24,
              backgroundColor: t.ink,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 4,
            }}>
            {purchasing ? (
              <ActivityIndicator color={t.bgScreen} size="small" />
            ) : (
              <Text style={[ui(14, 600), { color: t.bgScreen }]}>
                {selected === 'yearly' ? 'Start Free Trial & Continue' : 'Continue'}
              </Text>
            )}
          </Tap>

          {/* Restore & Legal footer */}
          <View style={{ alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Tap onPress={handleRestore} disabled={purchasing} hitSlop={8}>
              <Text style={[ui(12, 500), { color: t.inkMuted, textDecorationLine: 'underline' }]}>Restore purchases</Text>
            </Tap>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Tap onPress={() => setLegal('terms')} hitSlop={6}>
                <Text style={[ui(10.5), { color: t.inkMuted }]}>Terms of Service</Text>
              </Tap>
              <Text style={[ui(10.5), { color: t.inkMuted }]}>·</Text>
              <Tap onPress={() => setLegal('privacy')} hitSlop={6}>
                <Text style={[ui(10.5), { color: t.inkMuted }]}>Privacy Policy</Text>
              </Tap>
            </View>
            <Text style={[ui(10), { color: t.inkMuted, textAlign: 'center', lineHeight: 14 }]}>
              Payment will be charged to your store account upon confirmation. Subscription auto-renews unless cancelled at least 24 hours before the end of the current period.
            </Text>
          </View>
        </ScrollView>

        <LegalModal visible={legal != null} type={legal ?? 'terms'} onClose={() => setLegal(null)} />
      </View>
    </Modal>
  );
}

function FeatureRow({ icon: Icon, title, sub }: { icon: any; title: string; sub: string }) {
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
