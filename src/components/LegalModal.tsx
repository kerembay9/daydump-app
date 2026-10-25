import React from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { IconButton } from './ui/TopHeader';
import { Icons } from './ui/Icons';

export type LegalDocType = 'terms' | 'privacy';

type Section = [heading: string, body: string];

const EFFECTIVE_DATE = '[EFFECTIVE DATE]';

// RELEASE-BLOCKER: fill [PROVIDER] [ADDRESS] [COUNTRY] [EFFECTIVE DATE] before any store release (scripts/release-check.js fails EAS production builds while they remain).
const PRIVACY: Section[] = [
  ['The short version', 'PicDump works on your phone, not in the cloud. Your photos, and everything PicDump works out about them, stay on your device. There is no PicDump account, no PicDump server holding your data, and no ads, analytics or tracking in the app.\n\nThis policy explains what that means in practice, including the two cases where something does leave your phone: when you choose to share a dump, and when you buy a subscription.'],
  ['Who we are', 'PicDump is provided by [PROVIDER], [ADDRESS], [COUNTRY] (“we”, “us”). We are responsible for the app under data-protection law. Apart from the purchase information described below, the app does not send us personal data.'],
  ['How PicDump uses your photos', 'To suggest dumps, PicDump reads the photos in your gallery and runs an on-device image model that tags and indexes them. Stories, search, caption suggestions, sensitive-photo detection and the “is this you?” selfie finder all run on your phone using that index.\n\nYour photos, their tags and the embeddings (the numeric descriptions the model produces) are never uploaded by PicDump. We never see them, so we can’t sell them, show them to advertisers or use them to train models. These features don’t need an internet connection.'],
  ['What we don’t collect', 'There is no sign-up and no PicDump account. The app contains no advertising, no analytics, no crash-reporting tools and no third-party trackers. We don’t collect your name, email, contacts, location or browsing activity, and we don’t build a profile of you. Purchases are the one exception, described below.'],
  ['What’s stored on your phone', 'PicDump keeps the following in its private app storage on your device: the photo index (tags, embeddings and references to your photos), your dumps and drafts, your profile name and handle, a copy of your profile photo if you pick one, and your settings.\n\nAll of this is removed when you clear PicDump’s storage in Android settings or uninstall the app. Slides you export are saved to a “PicDump” album in your gallery. Those are your files and stay there until you delete them.'],
  ['Backups and other apps', 'PicDump never backs anything up to us. Your phone, gallery or cloud photo service may have its own backup or sync switched on (for example Google’s device backup or Google Photos), which can copy the PicDump album or app data to your account with that provider. Those copies are handled under that provider’s settings and policies, not ours.'],
  ['Permissions', '• Photos and media: to read your gallery for indexing and suggestions, and to save exported slides to the PicDump album.\n• Notifications (optional): for the daily 8 PM recap. The recap is put together on your phone; no server sends it.\n• Foreground service: so indexing can keep running while the screen is off or the phone is charging.\n\nYou can change these in Android settings at any time. PicDump can’t make suggestions without photo access.'],
  ['Sensitive photos', '“Hide sensitive photos” is on by default. It tries to recognise things like ID documents, bank cards and medical papers and keep them out of suggested dumps. The check runs entirely on your phone. It is automatic and can miss things or hide the wrong photo, so please look over every slide before you post.'],
  ['When you share', 'When you post a dump, PicDump hands the slides and caption to the app you choose (such as Instagram or TikTok) through Android’s share sheet. From that point, that app’s own terms and privacy policy apply. PicDump doesn’t sign in to your social accounts or post on your behalf.'],
  ['Purchases', 'PicDump Pro subscriptions are bought through Google Play or the Apple App Store. The store handles payment; we never see your card or bank details.\n\nWe use RevenueCat, a subscription-management service, to check whether your subscription is active. It receives an anonymous app user ID and your purchase and receipt information (such as product, purchase date and status) and processes it on our behalf, only so we can provide the subscription you bought. The store’s own privacy policy covers the payment itself.'],
  ['Age', 'PicDump is meant for people aged 16 and over. If you are under 16, please don’t use the app.'],
  ['Your rights', 'Depending on where you live, laws such as the GDPR (EU and UK) or KVKK (Türkiye) give you rights to access, correct, delete, restrict or object to the use of your personal data, to receive a copy of it, and to complain to your local data-protection authority.\n\nBecause PicDump keeps your data on your device rather than on our servers, you control most of this directly: edit your profile in the app, delete dumps, or erase everything by clearing the app’s storage or uninstalling. For purchase records held by RevenueCat, email us and we’ll help. Records kept by Google or Apple are managed through your account with them.'],
  ['Security', 'PicDump’s data sits in the app’s private storage, which Android keeps separate from other apps. Keeping data on your device instead of a server limits what could be exposed, but no system is perfectly secure. A screen lock and up-to-date software on your phone help protect it.'],
  ['Changes to this policy', 'If we change how PicDump handles data, we’ll update this policy and its effective date. For significant changes, we’ll also let you know in the app.'],
  ['Contact', 'Questions or requests about privacy: support@picdump.app. You can also write to [PROVIDER], [ADDRESS], [COUNTRY].'],
];

const TERMS: Section[] = [
  ['Agreement', 'These terms are an agreement between you and [PROVIDER] (“we”, “us”) about the PicDump app. By installing or using PicDump, you agree to them. If you don’t agree, please don’t use the app. Our Privacy Policy explains how PicDump handles your data.'],
  ['Who can use PicDump', 'You must be at least 16 years old and able to agree to these terms under the laws where you live. To buy a subscription, you must be allowed to make purchases with your store account.'],
  ['Your licence to use the app', 'We give you a personal, non-exclusive, non-transferable licence to install and use PicDump on devices you own or control, under these terms and the rules of the store you got it from. The app, its design and code belong to us or our licensors; open-source parts are covered by their own licences. Please don’t copy, resell or reverse-engineer the app, except where the law allows it.'],
  ['Your photos and content', 'Your photos, captions and the dumps you make are yours. You keep all rights in them and we claim none. PicDump processes them on your phone to provide its features and never sends them to us.\n\nYou are responsible for having the right to post what you share, including photos of other people.'],
  ['Acceptable use', 'Use PicDump lawfully and respectfully. Don’t use it to make or share content that is illegal, infringes someone else’s rights, harasses or exploits others, or exposes someone’s private images without their consent. Don’t try to break, bypass or interfere with the app or its subscription checks.'],
  ['Automatic and AI features', 'Suggestions, story picks, captions, selfie matching and sensitive-photo detection are produced automatically by on-device models. They can be wrong, incomplete or just odd, and sensitive-photo filtering can miss things.\n\nPlease review every slide and caption before you post. You decide what to share, and you are responsible for what you post.'],
  ['Other apps and stores', 'PicDump works alongside services we don’t control, such as Instagram, TikTok, Google Play, the App Store and Android itself. Their own terms and policies apply when you use them. We aren’t responsible for how they handle your content or for changes on their side that affect PicDump.'],
  ['PicDump Pro subscriptions', 'Some features may need a PicDump Pro subscription. The price, billing period and any free trial are shown in the store before you buy, and payment is charged to your Google Play or App Store account.\n\nSubscriptions renew automatically unless you cancel at least 24 hours before the end of the current period. You can manage or cancel them in your store account’s subscription settings; uninstalling the app does not cancel a subscription. If a free trial is offered, you’ll be charged when it ends unless you cancel before then. Refunds are handled by Google or Apple under their policies. Nothing here limits your legal rights as a consumer.'],
  ['Changes to the app and these terms', 'We keep improving PicDump, so features may be added, changed or removed. We may also update these terms. When we do, we’ll change the effective date, and for significant changes we’ll let you know in the app. If you keep using PicDump after a change takes effect, the updated terms apply; if you don’t agree, you can stop using the app and cancel any subscription.'],
  ['Ending your use', 'You can stop using PicDump at any time by uninstalling it (remember to cancel any subscription in your store account). We may end your licence if you seriously or repeatedly break these terms. Sections that by their nature should continue, such as content ownership, disclaimers and liability, still apply afterwards.'],
  ['Disclaimer', 'We work hard to make PicDump useful and reliable, but it is provided “as is” and “as available”. To the extent the law allows, we don’t promise that it will be error-free or uninterrupted, that its suggestions will be accurate, or that it will work with every device or third-party app. PicDump does not back up your gallery, so keep your own backups of photos that matter.'],
  ['Limitation of liability', 'To the extent the law allows, we aren’t liable for indirect or consequential losses (such as lost data, profits or opportunities) or for content you choose to post. Our total liability for any claim about PicDump is limited to the amount you paid for PicDump in the 12 months before the claim.\n\nNothing in these terms limits liability that can’t be limited by law, such as for fraud or for death or personal injury caused by negligence, or your mandatory rights as a consumer.'],
  ['Governing law', 'These terms are governed by the laws of [COUNTRY]. If you are a consumer, you also keep the protection of the mandatory laws of the country where you live, and you may bring claims in your local courts where the law allows.'],
  ['Contact', 'Questions about these terms: support@picdump.app. You can also write to [PROVIDER], [ADDRESS], [COUNTRY].'],
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
        <Text style={[ui(12), { color: t.inkMuted, paddingHorizontal: 16, paddingBottom: 12 }]}>{`Effective ${EFFECTIVE_DATE}`}</Text>
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
