import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { DumpStatus, setCurrentCreateDraft } from '../../services/dumps';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';
import { Tap } from '../ui/Tap';
import { tr } from '../../i18n';

/** tab: the Library tab the dump now sits in (Save only keeps it a draft). */
export type Done = { title: string; note: string; tab: DumpStatus };

/** Done sheet after Post / Save only (board 10): three ways out; Back or tapping outside stays on Preview. */
export function DoneSheet({ done, onClose }: { done: Done | null; onClose: () => void }) {
  const { t } = useTheme();
  const go = (to: '/create' | '/') => { onClose(); router.navigate(to); };
  // a new dump starts from an empty basket: unlink the Create draft (it stays in Drafts)
  const fresh = () => setCurrentCreateDraft(null).catch((e) => console.warn('[preview] unlink create draft failed:', e)).then(() => go('/create'));
  return (
    <Sheet visible={!!done} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Icons.check size={14} color={t.bgScreen} />
        </View>
        <Text style={[display(20, 1.15), { color: t.ink }]}>{done?.title}</Text>
      </View>
      <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17, marginBottom: 4 }]}>{done?.note}</Text>
      <Tap onPress={() => { onClose(); router.navigate({ pathname: '/library', params: { tab: done?.tab } }); }} accessibilityRole="button"
        style={{ height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[ui(13, 600), { color: t.bgScreen }]}>{tr('preview.viewInLibrary')}</Text>
      </Tap>
      <FrameCard radius={22} onPress={fresh} label={tr('preview.startNewDump')} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[ui(13, 600), { color: t.ink }]}>{tr('preview.startNewDump')}</Text>
      </FrameCard>
      <Tap onPress={() => go('/')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }}>
        <Text style={[ui(12, 600), { color: t.ink, textDecorationLine: 'underline' }]}>{tr('preview.backToDiscover')}</Text>
      </Tap>
    </Sheet>
  );
}
