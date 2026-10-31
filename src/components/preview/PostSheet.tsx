import React from 'react';
import { Text, View } from 'react-native';
import type { ShareTarget } from '../../../modules/clip-embedder';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';
import { tr } from '../../i18n';

/** name: "Posted to {name}" / "Opening {name}…" */
export const APPS: Record<ShareTarget, { label: string; name: string; note: (n: number) => string; Icon: (typeof Icons)[keyof typeof Icons] }> = {
  instagram: { label: tr('preview.apps.instagram'), name: 'Instagram', note: (n) => (n === 1 ? tr('preview.apps.noteInstagramSingle') : tr('preview.apps.noteInstagramMulti', { count: n })), Icon: Icons.carousel },
  'instagram-story': { label: tr('preview.apps.instagramStory'), name: 'Instagram Stories', note: (n) => (n === 1 ? tr('preview.apps.noteStorySingle') : tr('preview.apps.noteStoryMulti', { count: n })), Icon: Icons.story },
  'instagram-reel': { label: tr('preview.apps.instagramReel'), name: 'Instagram Reels', note: () => tr('preview.apps.noteReel'), Icon: Icons.reel },
  tiktok: { label: tr('preview.apps.tiktok'), name: 'TikTok', note: () => tr('preview.apps.noteTikTok'), Icon: Icons.music },
  whatsapp: { label: tr('preview.apps.whatsapp'), name: 'WhatsApp', note: (n) => (n === 1 ? tr('preview.apps.noteWhatsAppSingle') : tr('preview.apps.noteWhatsAppMulti', { count: n })), Icon: Icons.comment },
};

/** Post's app picker: only the installed apps, each opening its share screen directly (no system share sheet). */
export function PostSheet({ targets, slides, onPick, onClose, visible }: {
  targets: ShareTarget[]; slides: number; visible: boolean; onPick: (t: ShareTarget) => void; onClose: () => void;
}) {
  const { t } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={[display(20, 1.15), { color: t.ink }]}>{tr('preview.shareTo')}</Text>
      {targets.map((k) => {
        const a = APPS[k];
        return (
          <FrameCard key={k} radius={16} onPress={() => onPick(k)} label={a.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 56 }}>
            <a.Icon size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[ui(13, 600), { color: t.ink }]}>{a.label}</Text>
              <Text style={[ui(11), { color: t.inkMuted }]}>{a.note(slides)}</Text>
            </View>
            <Icons.chevron size={16} color={t.inkMuted} />
          </FrameCard>
        );
      })}
    </Sheet>
  );
}
