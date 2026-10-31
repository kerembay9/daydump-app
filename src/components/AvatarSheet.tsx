import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useApp } from '../state/AppState';
import { findSelfies, SelfieCandidate } from '../services/selfie';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { Sheet } from './ui/Sheet';
import { FrameCard } from './ui/FrameCard';
import { Tap } from './ui/Tap';
import { tr } from '../i18n';

/** Profile photo: the best selfie found on the phone ("Is this you?"), else the gallery picker. */
export function AvatarSheet({ visible, onClose, hasAvatar, onUse, onGallery, onRemove }: {
  visible: boolean; onClose: () => void; hasAvatar: boolean;
  onUse: (uri: string) => void; onGallery: () => void; onRemove: () => void;
}) {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
  const { library } = useApp();
  const [found, setFound] = useState<SelfieCandidate[] | null>(null);
  const [i, setI] = useState(0);
  const canLook = !!library?.photos.length;
  // once per Profile visit: CLIP search over the whole index
  useEffect(() => {
    if (!visible || found || !library?.photos.length) return;
    findSelfies(library).then(setFound, (e) => { console.warn('[avatar] selfie search failed:', e); setFound([]); });
  }, [visible, found, library]);

  const best = found?.[i];
  const size = Math.min(width - 64, 220);
  const close = (then: () => void) => () => { onClose(); then(); };

  return (
    <Sheet visible={visible} onClose={onClose}>
      {!found && canLook ? (
        <View style={{ height: size, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator color={t.ink} />
          <Text style={[ui(12), { color: t.inkMuted }]}>{tr('profile.lookingForSelfie')}</Text>
        </View>
      ) : best ? (
        <>
          <Image source={{ uri: best.p.uri }} style={{ width: size, height: size, borderRadius: size / 2, alignSelf: 'center' }} contentFit="cover" />
          <Text style={[display(20, 1.15), { color: t.ink, textAlign: 'center', marginTop: 4 }]}>{tr('profile.isThisYou')}</Text>
          <Text style={[ui(12), { color: t.inkMuted, textAlign: 'center' }]}>{tr('profile.foundOnPhone')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {found!.length > 1 && (
              <FrameCard radius={22} onPress={() => setI((x) => (x + 1) % found!.length)} label={tr('profile.showAnotherPhoto')} style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[ui(13, 600), { color: t.ink }]}>{tr('profile.anotherPhotoCount', { current: i + 1, total: found!.length })}</Text>
              </FrameCard>
            )}
            <Tap onPress={close(() => onUse(best.p.uri))} accessibilityRole="button" accessibilityLabel={tr('edit.useThisPhoto')}
              style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[ui(13, 600), { color: t.bgScreen }]}>{tr('profile.yesUseThis')}</Text>
            </Tap>
          </View>
        </>
      ) : (
        <>
          <Text style={[display(20, 1.15), { color: t.ink }]}>{tr('profile.profilePhoto')}</Text>
          <Text style={[ui(12), { color: t.inkMuted }]}>{canLook ? tr('profile.noSelfieFound') : tr('profile.readingPhotosWait')}</Text>
        </>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 6 }}>
        <Tap onPress={close(onGallery)} hitSlop={8} accessibilityRole="button">
          <Text style={[ui(12, 600), { color: t.ink, textDecorationLine: 'underline' }]}>{tr('profile.chooseFromGallery')}</Text>
        </Tap>
        {hasAvatar && (
          <Tap onPress={close(onRemove)} hitSlop={8} accessibilityRole="button">
            <Text style={[ui(12, 600), { color: '#B4412A' }]}>{tr('profile.removePhoto')}</Text>
          </Tap>
        )}
      </View>
    </Sheet>
  );
}
