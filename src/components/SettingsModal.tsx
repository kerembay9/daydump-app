import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import {
  X,
  Key,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Download,
  BookOpen,
  Bell,
  Crown,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RevenueCatService } from '../services/revenuecat';
import { GeminiService } from '../services/geminiService';
import { GemmaService, GemmaModelStatus } from '../services/gemmaService';
import { OnboardingService } from '../services/onboardingService';
import { NotificationService } from '../services/notificationService';
import { GalleryService } from '../services/galleryService';
import { LegalModal, LegalDocType } from './LegalModal';
import { UserSubscriptionState } from '../types';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onReloadSubscription: () => void;
  onTriggerOnboarding?: () => void;
  onOpenPaywall?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  onReloadSubscription,
  onTriggerOnboarding,
  onOpenPaywall,
}) => {
  const [subState, setSubState] = useState<UserSubscriptionState | null>(null);
  const [geminiKey, setGeminiKey] = useState('');
  const [rcKey, setRcKey] = useState('');
  const [isSimulatedPro, setIsSimulatedPro] = useState(false);
  const [gemmaStatus, setGemmaStatus] = useState<GemmaModelStatus | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [hasPhotoPermission, setHasPhotoPermission] = useState(true);

  // Hidden Developer Mode Easter Egg (tap version 5 times)
  const [devTapCount, setDevTapCount] = useState(0);
  const [isDevUnlocked, setIsDevUnlocked] = useState(false);

  // Legal Modal
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);

  // Model Download States
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    const savedGemini = await GeminiService.getApiKey();
    const savedRc = await RevenueCatService.getCustomApiKey();
    const state = await RevenueCatService.getUserSubscriptionState();
    const gemma = await GemmaService.checkStatus();
    const isNotif = await NotificationService.isEnabled();
    const photoPerm = await GalleryService.requestPermissions();

    if (savedGemini) setGeminiKey(savedGemini);
    if (savedRc) setRcKey(savedRc);
    setSubState(state);
    setIsSimulatedPro(state.isPro);
    setGemmaStatus(gemma);
    setNotifEnabled(isNotif);
    setHasPhotoPermission(photoPerm);
  };

  const handleToggleNotification = async (val: boolean) => {
    setNotifEnabled(val);
    const success = await NotificationService.setEnabled(val);
    if (!success && val) {
      setNotifEnabled(false);
      Alert.alert(
        'Permission Required',
        'Please enable notifications in Device Settings so DayDump can remind you at 8:00 PM.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  const handleSendTestNotification = async () => {
    try {
      await NotificationService.sendTestNotification();
      Alert.alert('Notification Sent! 🔔', 'Check your notification shade to preview the 8:00 PM Daily Dump reminder.');
    } catch (e: any) {
      Alert.alert('Notification Notice', e.message || 'Could not send test notification.');
    }
  };

  const handleRestorePurchases = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await RevenueCatService.restorePurchases();
      if (result.isPro) {
        Alert.alert('Restored!', 'Your Pro subscription has been restored.');
        await onReloadSubscription();
        await loadSettings();
      } else {
        Alert.alert('No Subscription Found', 'We could not find an active subscription for your account.');
      }
    } catch (e: any) {
      Alert.alert('Restore Failed', e.message);
    }
  };

  const handleOpenCustomerCenter = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await RevenueCatService.presentCustomerCenter();
    } catch (e: any) {
      Alert.alert(
        'Customer Center',
        'Customer Center is active when configured in your RevenueCat dashboard. You can also manage subscriptions in Google Play / App Store account settings.'
      );
    }
  };

  const handleSaveKeys = async () => {
    if (geminiKey) await GeminiService.setApiKey(geminiKey.trim());
    if (rcKey) await RevenueCatService.setCustomApiKey(rcKey.trim());
    Alert.alert('Settings Saved', 'API keys have been updated.');
  };

  const handleTogglePro = async (val: boolean) => {
    setIsSimulatedPro(val);
    await RevenueCatService.setSimulatedPro(val);
    onReloadSubscription();
    await loadSettings();
  };

  const handleResetDailyLimit = async () => {
    await AsyncStorage.removeItem('@daydump_daily_dumps_count');
    await AsyncStorage.removeItem('@daydump_last_dump_date');
    onReloadSubscription();
    Alert.alert('Reset', 'Daily dump count has been reset to 0.');
  };

  const handleResetOnboarding = async () => {
    await OnboardingService.resetOnboarding();
    Alert.alert('Onboarding Reset', 'Onboarding has been reset. It will appear on next launch.');
    onClose();
    onTriggerOnboarding?.();
  };

  const handleVersionTap = () => {
    const nextCount = devTapCount + 1;
    setDevTapCount(nextCount);
    if (nextCount === 5) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsDevUnlocked(true);
      Alert.alert('Developer Mode Unlocked 🛠️', 'Engineering debug switches and model tools are now visible below.');
    } else if (nextCount < 5) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleStartModelDownload = async () => {
    const url = downloadUrl.trim();
    if (!url) {
      Alert.alert(
        'Download Model Weights',
        'Please enter a direct HTTP/HTTPS URL to Gemma E2B / 2B quantized weights (.bin / .task file).'
      );
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);

    const res = await GemmaService.downloadModelWeights(url, (ratio) => {
      setDownloadProgress(Math.round(ratio * 100));
    });

    setIsDownloading(false);
    if (res.success) {
      Alert.alert('Download Complete! 🎉', 'Gemma weights downloaded and loaded to device GPU.');
      await loadSettings();
    } else {
      Alert.alert('Download Failed', res.error || 'Could not download model weights.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Subscription & Pass */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SUBSCRIPTION & PASS</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Crown size={16} color={subState?.isPro ? '#FFD60A' : '#8E8E93'} />
                  <Text style={styles.cardLabel}>
                    {subState?.isPro ? 'DayDump Creator Pass' : 'DayDump Free'}
                  </Text>
                </View>
                <Text style={subState?.isPro ? styles.statusBadge : styles.statusBadgeSubtle}>
                  {subState?.isPro ? 'PRO ACTIVE' : 'FREE'}
                </Text>
              </View>

              {!subState?.isPro ? (
                <TouchableOpacity
                  style={styles.upgradeBtn}
                  onPress={() => {
                    onClose();
                    onOpenPaywall?.();
                  }}
                  activeOpacity={0.85}
                >
                  <Sparkles size={14} color="#000" />
                  <Text style={styles.upgradeBtnText}>Upgrade to Creator Pass</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.cardSublabel}>
                  Unlimited custom prompts, 35mm retro frames, multi-tone captions, and clean exports.
                </Text>
              )}

              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleRestorePurchases}
                activeOpacity={0.7}
              >
                <Text style={styles.actionRowText}>Restore Purchases</Text>
                <ChevronRight size={14} color="#8E8E93" />
              </TouchableOpacity>

              {subState?.isPro && (
                <TouchableOpacity
                  style={[styles.actionRow, { borderTopWidth: 1, borderTopColor: '#2C2C2E' }]}
                  onPress={handleOpenCustomerCenter}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionRowText}>Manage Subscription (Customer Center)</Text>
                  <ChevronRight size={14} color="#8E8E93" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Daily Push Notification */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DAILY RECAP NOTIFICATION</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.cardLabel}>8:00 PM Evening Dump Reminder</Text>
                  <Text style={styles.cardSublabel}>
                    Review your curated standout shots from today before the day ends.
                  </Text>
                </View>
                <Switch
                  value={notifEnabled}
                  onValueChange={handleToggleNotification}
                  trackColor={{ false: '#3A3A3C', true: '#FF9500' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleSendTestNotification}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Bell size={13} color="#FF9500" />
                  <Text style={[styles.actionRowText, { color: '#FF9500' }]}>
                    Send Test Reminder Now
                  </Text>
                </View>
                <ChevronRight size={14} color="#FF9500" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Photo Library Access */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CAMERA ROLL ACCESS</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ImageIcon size={16} color={hasPhotoPermission ? '#30D158' : '#FF9500'} />
                  <Text style={styles.cardLabel}>Photo Library</Text>
                </View>
                <Text style={hasPhotoPermission ? styles.statusBadge : styles.statusBadgeAlert}>
                  {hasPhotoPermission ? 'Granted' : 'Limited / Denied'}
                </Text>
              </View>
              <Text style={styles.cardSublabel}>
                DayDump scans photos on-device to curate your carousels. Photos never leave your phone.
              </Text>

              {!hasPhotoPermission && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => Linking.openSettings()}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionRowText, { color: '#FF9500' }]}>
                    Open System Settings to Grant
                  </Text>
                  <ExternalLink size={13} color="#FF9500" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Legal & About */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LEGAL & SUPPORT</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => setLegalDoc('terms')}
                activeOpacity={0.7}
              >
                <Text style={styles.menuRowText}>Terms of Service & EULA</Text>
                <ChevronRight size={14} color="#8E8E93" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuRow, { borderTopWidth: 1, borderTopColor: '#2C2C2E' }]}
                onPress={() => setLegalDoc('privacy')}
                activeOpacity={0.7}
              >
                <Text style={styles.menuRowText}>Privacy Policy</Text>
                <ChevronRight size={14} color="#8E8E93" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuRow, { borderTopWidth: 1, borderTopColor: '#2C2C2E' }]}
                onPress={() => Linking.openURL('mailto:support@daydump.app?subject=DayDump%20Support')}
                activeOpacity={0.7}
              >
                <Text style={styles.menuRowText}>Contact Support</Text>
                <ExternalLink size={13} color="#8E8E93" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Unlocked Developer Tools (Protected Behind 5 Taps) */}
          {isDevUnlocked && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Cpu size={14} color="#FF9500" />
                <Text style={[styles.sectionTitle, { color: '#FF9500' }]}>
                  DEVELOPER & ENGINE TOOLS (TEST ONLY)
                </Text>
              </View>

              <View style={[styles.card, { borderColor: '#FF9500' }]}>
                <View style={styles.row}>
                  <View>
                    <Text style={styles.cardLabel}>Simulate Pro Active</Text>
                    <Text style={styles.cardSublabel}>Bypass paywall for local testing</Text>
                  </View>
                  <Switch
                    value={isSimulatedPro}
                    onValueChange={handleTogglePro}
                    trackColor={{ false: '#3A3A3C', true: '#FFD60A' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={styles.row}>
                  <Text style={styles.cardLabel}>On-Device Gemma Model</Text>
                  <Text style={gemmaStatus?.isAvailable ? styles.statusBadge : styles.statusBadgeSubtle}>
                    {gemmaStatus?.isAvailable ? 'Gemma E2B Active' : 'Searching /sdcard/'}
                  </Text>
                </View>

                {/* In-App Model Downloader */}
                <View style={[styles.modelDownloadBox, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2C2C2E' }]}>
                  <Text style={styles.inputLabel}>In-App Model Downloader</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="https://.../gemma-2b-it-gpu-int4.bin"
                    placeholderTextColor="#636366"
                    value={downloadUrl}
                    onChangeText={setDownloadUrl}
                    autoCapitalize="none"
                  />
                  {isDownloading ? (
                    <View style={styles.progressContainer}>
                      <ActivityIndicator size="small" color="#FF9500" />
                      <Text style={styles.progressText}>Downloading: {downloadProgress}%</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.downloadModelBtn}
                      onPress={handleStartModelDownload}
                      activeOpacity={0.8}
                    >
                      <Download size={13} color="#000" />
                      <Text style={styles.downloadModelBtnText}>Download Weights</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={handleResetDailyLimit}
                  activeOpacity={0.7}
                >
                  <RefreshCw size={13} color="#8E8E93" />
                  <Text style={styles.actionRowText}>Reset Daily Free Dump Limit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionRow, { marginTop: 4 }]}
                  onPress={handleResetOnboarding}
                  activeOpacity={0.7}
                >
                  <BookOpen size={13} color="#FF9500" />
                  <Text style={[styles.actionRowText, { color: '#FF9500' }]}>Relaunch Onboarding</Text>
                </TouchableOpacity>

                {/* API Keys Configuration */}
                <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2C2C2E' }}>
                  <Text style={styles.inputLabel}>Google Gemini API Key (Multimodal Vision)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="AIzaSy..."
                    placeholderTextColor="#636366"
                    value={geminiKey}
                    onChangeText={setGeminiKey}
                    autoCapitalize="none"
                  />

                  <Text style={[styles.inputLabel, { marginTop: 8 }]}>RevenueCat Android Key</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="goog_..."
                    placeholderTextColor="#636366"
                    value={rcKey}
                    onChangeText={setRcKey}
                    autoCapitalize="none"
                  />

                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveKeys} activeOpacity={0.8}>
                    <Text style={styles.saveBtnText}>Save Keys</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* App Version Footer (Tap 5 times to unlock Dev Mode) */}
          <TouchableOpacity
            style={styles.versionFooter}
            onPress={handleVersionTap}
            activeOpacity={0.9}
          >
            <Text style={styles.versionText}>DayDump for Android • v1.0.0 (Build 1)</Text>
            <Text style={styles.copyrightText}>100% On-Device AI • Private by Design</Text>
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 6,
  },
  content: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  section: {
    gap: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardSublabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    lineHeight: 16,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#30D158',
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  statusBadgeAlert: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FF9500',
    backgroundColor: 'rgba(255, 149, 0, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  statusBadgeSubtle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
  },
  upgradeBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFD60A',
    paddingVertical: 10,
    borderRadius: 10,
  },
  upgradeBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.3,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  actionRowText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  menuRowText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  versionFooter: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636366',
  },
  copyrightText: {
    fontSize: 11,
    color: '#48484A',
  },
  modelDownloadBox: {
    gap: 6,
  },
  downloadModelBtn: {
    backgroundColor: '#FF9500',
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
  },
  downloadModelBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#121212',
    color: '#FFFFFF',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  saveBtn: {
    backgroundColor: '#FF9500',
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
});
