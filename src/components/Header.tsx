import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Sparkles, Settings, Crown } from 'lucide-react-native';
import { UserSubscriptionState } from '../types';

interface HeaderProps {
  subscription: UserSubscriptionState;
  onOpenPaywall: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  subscription,
  onOpenPaywall,
  onOpenSettings,
}) => {
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.dateText}>{todayFormatted.toUpperCase()}</Text>
        <View style={styles.titleRow}>
          <Text style={styles.logoText}>DayDump</Text>
          <Sparkles size={18} color="#FF9500" style={styles.sparkleIcon} />
        </View>
      </View>

      <View style={styles.rightActions}>
        {subscription.isPro ? (
          <View style={styles.proBadge}>
            <Crown size={12} color="#000" />
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={onOpenPaywall}
            activeOpacity={0.8}
          >
            <Crown size={14} color="#FFF" />
            <Text style={styles.upgradeButtonText}>Upgrade</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={onOpenSettings}
          activeOpacity={0.7}
        >
          <Settings size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  dateText: {
    fontSize: 11,
    fontFamily: 'System',
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  sparkleIcon: {
    marginLeft: 6,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFD60A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.5,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  upgradeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  settingsButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
  },
});
