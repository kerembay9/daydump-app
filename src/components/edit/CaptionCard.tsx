import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Text, ToastAndroid, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../theme/ThemeProvider';
import { label, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Tap } from '../ui/Tap';
import { CaptionInput, captionIdeas, clipText, hashtags } from '../../services/captions';

const PER_PAGE = 2;

/** CAPTION IDEAS: template ideas 2 at a time, More pages; Copy puts caption + hashtags on the clipboard. */
export function CaptionCard({ input, onCopy }: { input: CaptionInput; onCopy: (caption: string) => void }) {
  const { t } = useTheme();
  const ideas = useMemo(() => captionIdeas(input), [input]);
  const tags = useMemo(() => hashtags(input), [input]);
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  const pages = Math.ceil(ideas.length / PER_PAGE);
  const shown = ideas.slice((page % pages) * PER_PAGE, (page % pages) * PER_PAGE + PER_PAGE);
  const copy = async (c: string) => {
    await Clipboard.setStringAsync(clipText(c, tags));
    setCopied(c);
    onCopy(c);
    if (Platform.OS === 'android') ToastAndroid.show('Caption and hashtags copied', ToastAndroid.SHORT);
  };

  return (
    <FrameCard radius={16} padding={10} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icons.sparkle size={12} color={t.inkMuted} />
          <Text style={[label(10, 0.1), { color: t.inkMuted }]}>Caption ideas</Text>
          <Text style={[ui(9, 400), { color: t.inkMuted }]}>(Optional · Copy)</Text>
        </View>
        <Tap onPress={() => setPage((p) => p + 1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="More caption ideas"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Icons.refresh size={11} color={t.inkMuted} />
          <Text style={[ui(9.5, 600), { color: t.inkMuted }]}>More</Text>
        </Tap>
      </View>
      <View style={{ gap: 6 }}>
        {shown.map((c) => {
          const on = copied === c;
          return (
            <Tap key={c} onPress={() => copy(c)} accessibilityRole="button" accessibilityLabel={`Copy caption: ${c}`}
              style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Text style={[ui(11, 500), { color: t.ink, flex: 1, lineHeight: 15 }]}>{c}</Text>
              <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1, backgroundColor: on ? t.ink : t.bgCard }}>
                {on ? <Icons.check size={10} color={t.bgScreen} /> : <Icons.copy size={10} />}
                <Text style={[ui(9.5, 600), { color: on ? t.bgScreen : t.ink }]}>{on ? 'Copied' : 'Copy'}</Text>
              </View>
            </Tap>
          );
        })}
      </View>
    </FrameCard>
  );
}
