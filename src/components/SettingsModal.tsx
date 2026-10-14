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
} from 'react-native';
import { X, Key, ShieldCheck, Cpu, RefreshCw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RevenueCatService } from '../services/revenuecat';
import { GeminiService } from '../services/geminiService';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onReloadSubscription: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  onReloadSubscription,
}) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [rcKey, setRcKey] = useState('');
  const [isSimulatedPro, setIsSimulatedPro] = useState(false);

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    const savedGemini = await GeminiService.getApiKey();
    const savedRc = await RevenueCatService.getCustomApiKey();
    const subState = await RevenueCatService.getUserSubscriptionState();

    if (savedGemini) setGeminiKey(savedGemini);
    if (savedRc) setRcKey(savedRc);
    setIsSimulatedPro(subState.isPro);
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
          {/* AI Engine Status */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Cpu size={16} color="#FF9500" />
              <Text style={styles.sectionTitle}>AI VISION ENGINE</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.cardLabel}>Primary Engine</Text>
                <Text style={styles.statusBadge}>Gemini Nano (On-Device)</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.cardLabel}>Fallback Engine</Text>
                <Text style={styles.statusBadgeSubtle}>Gemini 2.0 Flash (Cloud)</Text>
              </View>
            </View>
          </View>

          {/* RevenueCat & Aggressive Creator Model Testing */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <ShieldCheck size={16} color="#FF9500" />
              <Text style={styles.sectionTitle}>MONETIZATION & PAYWALL TEST</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                <View>
                  <Text style={styles.cardLabel}>Simulate Pro Active</Text>
                  <Text style={styles.cardSublabel}>Test all creator frames & unlimited dumps</Text>
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
            </View>
          </View>

          {/* API Keys Configuration */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Key size={16} color="#FF9500" />
              <Text style={styles.sectionTitle}>CUSTOM API KEYS (OPTIONAL)</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.inputLabel}>Google Gemini API Key (For Cloud Flash)</Text>
              <TextInput
                style={styles.input}
                placeholder="AIzaSy..."
                placeholderTextColor="#636366"
                value={geminiKey}
                onChangeText={setGeminiKey}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>RevenueCat Public SDK Key</Text>
              <TextInput
                style={styles.input}
                placeholder="appl_... or goog_..."
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
    marginBottom: 6,
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
