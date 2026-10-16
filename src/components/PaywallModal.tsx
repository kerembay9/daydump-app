import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  X,
  Sparkles,
  Check,
  Crown,
  Film,
  Zap,
  PenTool,
  CheckCircle2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { AGGRESSIVE_CREATOR_PLANS, PRO_FEATURES } from '../constants/plans';
import { SubscriptionPlanId } from '../types';
import { RevenueCatService } from '../services/revenuecat';
import { LegalModal, LegalDocType } from './LegalModal';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  // Default to the highest-converting plan: Weekly with 3-Day Trial
  const [selectedPlanId, setSelectedPlanId] = useState<SubscriptionPlanId>('weekly');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);

  const selectedPlan =
    AGGRESSIVE_CREATOR_PLANS.find((p) => p.id === selectedPlanId) ||
    AGGRESSIVE_CREATOR_PLANS[0];

  const handleSelectPlan = (planId: SubscriptionPlanId) => {
    Haptics.selectionAsync();
    setSelectedPlanId(planId);
  };

  const handlePurchase = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);

    try {
      const result = await RevenueCatService.purchasePlan(selectedPlanId);
      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Welcome to DayDump Pro!', 'You now have unlimited access to all AI themes and aesthetic frames.');
        onSuccess();
        onClose();
      } else if (result.error && result.error !== 'User cancelled') {
        Alert.alert('Purchase Error', result.error);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not complete transaction');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const result = await RevenueCatService.restorePurchases();
      if (result.isPro) {
        Alert.alert('Restored!', 'Your Pro subscription has been restored.');
        onSuccess();
        onClose();
      } else {
        Alert.alert('No Subscription Found', 'We could not find an active subscription for your Apple / Google account.');
      }
    } catch (e: any) {
      Alert.alert('Restore Failed', e.message);
    } finally {
      setIsRestoring(false);
    }
  };

  const getFeatureIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Sparkles size={16} color="#FF9500" />;
      case 1:
        return <Film size={16} color="#FF9500" />;
      case 2:
        return <PenTool size={16} color="#FF9500" />;
      case 3:
        return <CheckCircle2 size={16} color="#FF9500" />;
      default:
        return <Zap size={16} color="#FF9500" />;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Top Dismiss Button */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={20} color="#8E8E93" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Header */}
          <View style={styles.heroSection}>
            <View style={styles.badgeWrapper}>
              <Crown size={14} color="#000" />
              <Text style={styles.badgeText}>DAYDUMP CREATOR PASS</Text>
            </View>

            <Text style={styles.heroTitle}>Never Wonder What to Post.</Text>
            <Text style={styles.heroSubtitle}>
              Transform your camera roll into viral aesthetic Instagram carousels in seconds.
            </Text>
          </View>

          {/* Value Checklist */}
          <View style={styles.featuresCard}>
            {PRO_FEATURES.map((feat, idx) => (
              <View key={idx} style={styles.featureRow}>
                <View style={styles.iconCircle}>{getFeatureIcon(idx)}</View>
                <View style={styles.featureTextWrapper}>
                  <Text style={styles.featureTitle}>{feat.title}</Text>
                  <Text style={styles.featureDesc}>{feat.description}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Subscription Plans Selection */}
          <Text style={styles.plansSectionTitle}>SELECT YOUR PASS</Text>

          <View style={styles.plansContainer}>
            {AGGRESSIVE_CREATOR_PLANS.map((plan) => {
              const isSelected = plan.id === selectedPlanId;
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planCard, isSelected && styles.planCardSelected]}
                  onPress={() => handleSelectPlan(plan.id)}
                  activeOpacity={0.8}
                >
                  {plan.badge && (
                    <View
                      style={[
                        styles.planBadge,
                        isSelected ? styles.planBadgeSelected : styles.planBadgeDefault,
                      ]}
                    >
                      <Text style={styles.planBadgeText}>{plan.badge}</Text>
                    </View>
                  )}

                  <View style={styles.planInfo}>
                    <Text style={[styles.planTitle, isSelected && styles.planTitleSelected]}>
                      {plan.title}
                    </Text>
                    <Text style={styles.planBilling}>{plan.billingPeriod}</Text>
                  </View>

                  <View style={styles.planPriceWrapper}>
                    <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                      {plan.priceString}
                    </Text>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected && <Check size={12} color="#000" />}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Primary Call to Action */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handlePurchase}
            disabled={isPurchasing}
            activeOpacity={0.85}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.ctaButtonText}>
                {selectedPlan.trialDays
                  ? `Start ${selectedPlan.trialDays}-Day Free Trial`
                  : 'Unlock DayDump Pro'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.trialNote}>
            {selectedPlan.trialDays
              ? `Free for ${selectedPlan.trialDays} days, then ${selectedPlan.priceString}. Cancel anytime.`
              : selectedPlan.billingPeriod}
          </Text>

          {/* Footer Actions */}
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={handleRestore} disabled={isRestoring}>
              <Text style={styles.footerLink}>
                {isRestoring ? 'Restoring...' : 'Restore Purchases'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>•</Text>
            <TouchableOpacity onPress={() => setLegalDoc('terms')}>
              <Text style={styles.footerLink}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>•</Text>
            <TouchableOpacity onPress={() => setLegalDoc('privacy')}>
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <LegalModal
          visible={legalDoc !== null}
          type={legalDoc || 'terms'}
          onClose={() => setLegalDoc(null)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: '#1C1C1E',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  badgeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFD60A',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  featuresCard: {
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242426',
    marginBottom: 24,
    gap: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 149, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrapper: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 11,
    color: '#8E8E93',
    lineHeight: 15,
  },
  plansSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  plansContainer: {
    gap: 10,
    marginBottom: 24,
  },
  planCard: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161618',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#242426',
  },
  planCardSelected: {
    borderColor: '#FFD60A',
    backgroundColor: '#1E1C14',
  },
  planBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  planBadgeSelected: {
    backgroundColor: '#FFD60A',
  },
  planBadgeDefault: {
    backgroundColor: '#2C2C2E',
  },
  planBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.5,
  },
  planInfo: {
    flex: 1,
  },
  planTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  planTitleSelected: {
    color: '#FFD60A',
  },
  planBilling: {
    fontSize: 11,
    color: '#8E8E93',
  },
  planPriceWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planPriceSelected: {
    color: '#FFD60A',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    backgroundColor: '#FFD60A',
    borderColor: '#FFD60A',
  },
  ctaButton: {
    backgroundColor: '#FFD60A',
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD60A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.3,
  },
  trialNote: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  footerLink: {
    fontSize: 11,
    color: '#636366',
  },
  footerDivider: {
    fontSize: 11,
    color: '#3A3A3C',
  },
});
