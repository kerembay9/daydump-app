import React from 'react';
import { Text, View } from 'react-native';
import type { ShareTarget } from '../../../modules/clip-embedder';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';

/** name: "Posted to {name}" / "Opening {name}…" */
export const APPS: Record<ShareTarget, { label: string; name: string; note: (n: number) => string; Icon: (typeof Icons)[keyof typeof Icons] }> = {
  instagram: { label: 'Instagram post', name: 'Instagram', note: (n) => (n === 1 ? 'A photo post' : `A carousel of ${n} slides`), Icon: Icons.carousel },
  'instagram-story': { label: 'Instagram story', name: 'Instagram Stories', note: (n) => (n === 1 ? 'One story' : `${n} stories, one per slide`), Icon: Icons.story },
  'instagram-reel': { label: 'Instagram reel', name: 'Instagram Reels', note: () => 'A slideshow reel', Icon: Icons.reel },
  tiktok: { label: 'TikTok', name: 'TikTok', note: () => 'A photo post', Icon: Icons.music },
  whatsapp: { label: 'WhatsApp', name: 'WhatsApp', note: (n) => (n === 1 ? 'Send to a chat' : `Send ${n} slides to a chat`), Icon: Icons.comment },
};

/** Post's app picker: only the installed apps, each opening its share screen directly (no system share sheet). */
export function PostSheet({ targets, slides, onPick, onClose, visible }: {
  targets: ShareTarget[]; slides: number; visible: boolean; onPick: (t: ShareTarget) => void; onClose: () => void;
}) {
  const { t } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={[display(20, 1.15), { color: t.ink }]}>Share to</Text>
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
