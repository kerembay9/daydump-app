import React from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { PAYWALLS_ENABLED } from '../constants/flags';
import { IconButton } from './ui/TopHeader';
import { Icons } from './ui/Icons';

export type LegalDocType = 'terms' | 'privacy';

type Section = [heading: string, body: string];

const PRIVACY: Section[] = [
  ['On-device processing', 'DayDump curates on your phone: photo indexing, stories and search run locally, and your photos are not uploaded to DayDump servers, sold to advertisers, or used to train public machine learning models.'],
  ['Photo library permissions', 'We request access to your photo library to build your dumps and search your photos, and to save the slides you post into your “DayDump” album.'],
  ...(PAYWALLS_ENABLED ? [['Subscriptions & payments', 'Subscription purchases are handled entirely by Apple App Store or Google Play Store via RevenueCat. DayDump does not collect or store your billing, credit card, or banking details.'] as Section] : []),
  ['Contact us', 'If you have privacy inquiries, contact support@daydump.app.'],
];

const TERMS: Section[] = [
  ...(PAYWALLS_ENABLED ? [
    ['Subscriptions & free trial', 'DayDump Pro offers Weekly ($3.99/week), Annual ($34.99/year), and Lifetime ($59.99) passes. If a 3-day free trial is selected, you will not be charged during the trial period.'] as Section,
    ['Cancellation & auto-renewal', 'Your subscription automatically renews unless cancelled at least 24 hours before the end of the current billing cycle. You can cancel anytime directly inside your Apple ID Subscriptions or Google Play Store Account Settings.'] as Section,
  ] : []),
  ['Ownership of content', 'You retain 100% intellectual property rights and copyright to your photos and created carousels. DayDump claims no ownership over your media.'],
  ['Support', 'For assistance or questions, email support@daydump.app.'],
];

/** Terms / Privacy sheet in the app's theme. Android Modals draw edge to edge, so pad with the root's insets. */
export function LegalModal({ visible, type, onClose }: { visible: boolean; type: LegalDocType; onClose: () => void }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const doc = type === 'privacy' ? PRIVACY : TERMS;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.bgScreen, experimental_backgroundImage: t.bgGrad ?? undefined, paddingTop: insets.top + 8 }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[display(24, 1.1), { color: t.ink }]}>{type === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</Text>
          <IconButton label="Close" onPress={onClose}><Icons.close size={16} /></IconButton>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }} showsVerticalScrollIndicator={false}>
          {doc.map(([h, body], i) => (
            <View key={h}>
              <Text style={[ui(13, 600), { color: t.ink, marginBottom: 4 }]}>{`${i + 1}. ${h}`}</Text>
              <Text style={[ui(13), { color: t.inkMuted, lineHeight: 20 }]}>{body}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
