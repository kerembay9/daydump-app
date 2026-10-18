import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { X, ShieldCheck, FileText } from 'lucide-react-native';

export type LegalDocType = 'terms' | 'privacy';

interface LegalModalProps {
  visible: boolean;
  type: LegalDocType;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ visible, type, onClose }) => {
  const isPrivacy = type === 'privacy';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            {isPrivacy ? (
              <ShieldCheck size={18} color="#30D158" style={{ marginRight: 6 }} />
            ) : (
              <FileText size={18} color="#FF9500" style={{ marginRight: 6 }} />
            )}
            <Text style={styles.headerTitle}>
              {isPrivacy ? 'Privacy Policy' : 'Terms of Service & EULA'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {isPrivacy ? (
            <>
              <Text style={styles.sectionHeader}>1. On-Device Processing</Text>
              <Text style={styles.paragraph}>
                DayDump curates on your phone: photo indexing, stories and search run locally,
                and your photos are not uploaded to DayDump servers, sold to advertisers, or used
                to train public machine learning models. If you add your own Google Gemini API key
                in Settings, the photos being curated are sent to Google’s Gemini API under
                Google’s terms.
              </Text>

              <Text style={styles.sectionHeader}>2. Photo Library Permissions</Text>
              <Text style={styles.paragraph}>
                We request access to your photo library solely to discover photos taken today or
                matching your custom theme queries, and to save your finished 4:5 framed JPEG
                cards into your "DayDump" album.
              </Text>

              <Text style={styles.sectionHeader}>3. Subscriptions & Payments</Text>
              <Text style={styles.paragraph}>
                Subscription purchases are handled entirely by Apple App Store or Google Play
                Store via RevenueCat. DayDump does not collect or store your billing, credit card,
                or banking details.
              </Text>

              <Text style={styles.sectionHeader}>4. Contact Us</Text>
              <Text style={styles.paragraph}>
                If you have privacy inquiries, contact support@daydump.app.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.sectionHeader}>1. Subscriptions & Free Trial</Text>
              <Text style={styles.paragraph}>
                DayDump Pro offers Weekly ($3.99/week), Annual ($34.99/year), and Lifetime
                ($59.99) passes. If a 3-day free trial is selected, you will not be charged
                during the trial period.
              </Text>

              <Text style={styles.sectionHeader}>2. Cancellation & Auto-Renewal</Text>
              <Text style={styles.paragraph}>
                Your subscription automatically renews unless cancelled at least 24 hours before
                the end of the current billing cycle. You can cancel anytime directly inside your
                Apple ID Subscriptions or Google Play Store Account Settings.
              </Text>

              <Text style={styles.sectionHeader}>3. Ownership of Content</Text>
              <Text style={styles.paragraph}>
                You retain 100% intellectual property rights and copyright to your photos and
                created carousels. DayDump claims no ownership over your media.
              </Text>

              <Text style={styles.sectionHeader}>4. Support</Text>
              <Text style={styles.paragraph}>
                For assistance or questions regarding your subscription, email support@daydump.app.
              </Text>
            </>
          )}

          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F11',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    padding: 24,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF9500',
    marginTop: 16,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  paragraph: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 20,
    marginBottom: 12,
  },
  doneBtn: {
    marginTop: 24,
    backgroundColor: '#1C1C1E',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
