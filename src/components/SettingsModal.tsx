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
} from 'react-native';
import { X, Key, ShieldCheck, Cpu, RefreshCw, Download, Sparkles, BookOpen } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RevenueCatService } from '../services/revenuecat';
import { GeminiService } from '../services/geminiService';
import { GemmaService, GemmaModelStatus } from '../services/gemmaService';
import { OnboardingService } from '../services/onboardingService';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onReloadSubscription: () => void;
  onTriggerOnboarding?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  onReloadSubscription,
  onTriggerOnboarding,
}) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [rcKey, setRcKey] = useState('');
  const [isSimulatedPro, setIsSimulatedPro] = useState(false);
  const [gemmaStatus, setGemmaStatus] = useState<GemmaModelStatus | null>(null);

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
    const subState = await RevenueCatService.getUserSubscriptionState();
    const gemma = await GemmaService.checkStatus();

    if (savedGemini) setGeminiKey(savedGemini);
    if (savedRc) setRcKey(savedRc);
    setIsSimulatedPro(subState.isPro);
    setGemmaStatus(gemma);
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
          <Text style={styles.headerTitle}>Engine & Dev Settings</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* AI Engine Status & Gemma Model Downloader */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Cpu size={16} color="#FF9500" />
              <Text style={styles.sectionTitle}>AI VISION ENGINE (ON-DEVICE)</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.cardLabel}>On-Device Model</Text>
                <Text style={gemmaStatus?.isAvailable ? styles.statusBadge : styles.statusBadgeSubtle}>
                  {gemmaStatus?.isAvailable ? 'Gemma E2B (Active)' : 'Gemma E2B (Searching)'}
                </Text>
              </View>

              {gemmaStatus?.isAvailable ? (
                <View style={styles.row}>
                  <Text style={styles.cardSublabel}>Model Weights</Text>
                  <Text style={[styles.cardSublabel, { color: '#30D158', fontWeight: '700' }]}>
                    {gemmaStatus.fileName} ({Math.round(gemmaStatus.fileSizeMB || 0)} MB)
                  </Text>
                </View>
              ) : (
                <View style={{ marginTop: 4 }}>
                  <Text style={styles.cardSublabel}>
                    Auto-scans /sdcard/Download/ for Gemma weights (downloaded via Google AI Edge Gallery).
                  </Text>
                </View>
              )}

              {/* In-App Model Downloader UI */}
              <View style={[styles.modelDownloadBox, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2C2C2E' }]}>
                <Text style={styles.inputLabel}>In-App Model Downloader</Text>
                <Text style={styles.helperText}>
                  Download quantized weights (.bin/.task) directly into the app storage:
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://huggingface.co/.../gemma-2b-it-gpu-int4.bin"
                  placeholderTextColor="#636366"
                  value={downloadUrl}
                  onChangeText={setDownloadUrl}
                  autoCapitalize="none"
                />

                {isDownloading ? (
                  <View style={styles.progressContainer}>
                    <ActivityIndicator size="small" color="#FF9500" />
                    <Text style={styles.progressText}>Downloading weights: {downloadProgress}%</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.downloadModelBtn}
                    onPress={handleStartModelDownload}
                    activeOpacity={0.8}
                  >
                    <Download size={14} color="#000" />
                    <Text style={styles.downloadModelBtnText}>Download to Device</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.row, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2C2C2E' }]}>
                <Text style={styles.cardLabel}>Cloud Fallback</Text>
                <Text style={styles.statusBadgeSubtle}>Gemini 2.0 Flash</Text>
              </View>
            </View>
          </View>

          {/* RevenueCat & Aggressive Creator Model Testing */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <ShieldCheck size={16} color="#FF9500" />
              <Text style={styles.sectionTitle}>MONETIZATION & ONBOARDING TEST</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                <View>
                  <Text style={styles.cardLabel}>Simulate Pro Active</Text>
                  <Text style={styles.cardSublabel}>Unlock 35mm film, editorial frames, and watermark removal</Text>
                </View>
                <Switch
                  value={isSimulatedPro}
                  onValueChange={handleTogglePro}
                  trackColor={{ false: '#3A3A3C', true: '#FFD60A' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <TouchableOpacity
                style={styles.resetLimitBtn}
                onPress={handleResetDailyLimit}
                activeOpacity={0.7}
              >
                <RefreshCw size={14} color="#8E8E93" />
                <Text style={styles.resetLimitText}>Reset Daily Free Dump Limit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resetLimitBtn, { marginTop: 8 }]}
                onPress={handleResetOnboarding}
                activeOpacity={0.7}
              >
                <BookOpen size={14} color="#FF9500" />
                <Text style={[styles.resetLimitText, { color: '#FF9500' }]}>Relaunch Onboarding & Permission Primer</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* API Keys Configuration */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Key size={16} color="#FF9500" />
              <Text style={styles.sectionTitle}>CUSTOM API KEYS (OPTIONAL)</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.inputLabel}>Google Gemini API Key (Multimodal Cloud)</Text>
              <Text style={styles.helperText}>
                Unlocks deep pixel vision: detects exact objects, people, food, and vibes in your photos.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="AIzaSy..."
                placeholderTextColor="#636366"
                value={geminiKey}
                onChangeText={setGeminiKey}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>RevenueCat Public Android Key</Text>
              <TextInput
                style={styles.input}
                placeholder="goog_... or appl_..."
                placeholderTextColor="#636366"
                value={rcKey}
                onChangeText={setRcKey}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveKeys}
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>Save Keys</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F11',
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
    paddingVertical: 6,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardSublabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#30D158',
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeSubtle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  modelDownloadBox: {
    gap: 6,
  },
  downloadModelBtn: {
    backgroundColor: '#FF9500',
    paddingVertical: 9,
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
  resetLimitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  resetLimitText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 4,
  },
  helperText: {
    fontSize: 11,
    color: '#8E8E93',
    lineHeight: 15,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#121212',
    color: '#FFFFFF',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  saveBtn: {
    backgroundColor: '#FF9500',
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
});
