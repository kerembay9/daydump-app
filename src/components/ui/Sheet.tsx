import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { FrameCard } from './FrameCard';
import { Tap } from './Tap';

/** Bottom sheet card over a dimmed backdrop; tap outside or Back closes it. */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { t } = useTheme();
  const bottom = useSafeAreaInsets().bottom;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Pressable onPress={() => {}} style={{ backgroundColor: t.bgScreen, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: bottom + 16, gap: 8, boxShadow: t.shadowDeck }}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export type ConfirmSpec = { title: string; body: string; action: string; danger?: boolean; onConfirm: () => void };

/** Themed yes/no (a native Alert ignores the app theme and draws system-accent buttons). */
export function Confirm({ c, onClose }: { c: ConfirmSpec | null; onClose: () => void }) {
  const { t } = useTheme();
  return (
    <Sheet visible={!!c} onClose={onClose}>
      <Text style={[display(20, 1.15), { color: t.ink }]}>{c?.title}</Text>
      <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17, marginBottom: 4 }]}>{c?.body}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <FrameCard radius={22} onPress={onClose} label="Cancel" style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.ink }]}>Cancel</Text>
        </FrameCard>
        <Tap onPress={() => { onClose(); c?.onConfirm(); }} accessibilityRole="button"
          style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: c?.danger ? '#B4412A' : t.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: c?.danger ? '#fff' : t.bgScreen }]}>{c?.action}</Text>
        </Tap>
      </View>
    </Sheet>
  );
}
