import React from 'react';
import { FlatList, StyleProp, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Check, NOT_CHECKED, TPhoto } from '../../services/tidy/rules';
import { PER_DIALOG } from '../../services/tidy/scan';
import { dateRange } from '../../services/stories/titles';
import { ProBadge } from '../ui/ProBadge';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { Icons } from '../ui/Icons';
import { Pill } from '../ui/Pill';
import type { ConfirmSpec } from '../ui/Sheet';
import { Tap } from '../ui/Tap';
import { tr } from '../../i18n';

/** 2.4 MB, 37 MB, 1.2 GB (decimal units, as Android's Files app shows them). */
export function formatBytes(b: number) {
  const mb = b / 1e6;
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** A grid cell's chip: its first failed Shot check in words ("Too dark"), none when everything passed. */
export const missChip = (c: Check[]) => c.find((x) => !x.ok)?.text;

const LOCK_ASK: Record<string, string> = {
  Favorite: 'tidy.lockFavorite',
  'In a dump': 'tidy.lockInDump',
  'Taken in the last 2 days': 'tidy.lockRecent',
  'Looks like a moment': 'tidy.lockMoment',
  'In a Discover story': 'tidy.lockStory',
  'You’re in it': 'tidy.lockYou',
};
/** "Trash anyway?" for a locked photo (lockOf's reasons). */
export const lockConfirm = (lock: string, onConfirm: () => void): ConfirmSpec => {
  const reason = LOCK_ASK[lock] ? tr(LOCK_ASK[lock] as any) : tr('tidy.lockGeneric', { lock });
  return {
    title: tr('tidy.trashAnywayTitle', { reason }),
    body: tr('tidy.trashAnywayBody'),
    action: tr('tidy.trashAnyway'),
    onConfirm,
  };
};

/** Our sheet before Android's own dialog(s). */
export const moveConfirm = (n: number, bytes: number, onConfirm: () => void): ConfirmSpec => ({
  title: tr('tidy.moveConfirmTitle', { count: n }),
  body: tr('tidy.moveConfirmBody', { bytes: formatBytes(bytes) })
    + (n > PER_DIALOG ? tr('tidy.moveConfirmAsk', { count: Math.ceil(n / PER_DIALOG) }) : ''),
  action: tr('tidy.moveToTrash'),
  onConfirm,
});

/** Full-width ink button. */
/** pro: a free user's tap opens the paywall (moving to Trash is Pro); the button says so with a small tag. */
export function Primary({ label, onPress, disabled, pro }: { label: string; onPress: () => void; disabled?: boolean; pro?: boolean }) {
  const { t } = useTheme();
  return (
    <Tap onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={pro ? tr('tidy.proHint') : undefined} accessibilityState={{ disabled: !!disabled }}
      style={{ height: 46, borderRadius: 23, backgroundColor: t.ink, opacity: disabled ? 0.4 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }}>
      <Text style={[ui(13.5, 600), { color: t.bgScreen }]} numberOfLines={1}>{label}</Text>
      {pro ? <ProBadge inverse /> : null}
    </Tap>
  );
}

/** Keep / Remove pair for a PhotoViewer footer. */
export function KeepToggle({ removing, onChange }: { removing: boolean; onChange: (remove: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
      <Pill label={tr('tidy.keep')} on={!removing} onPress={() => onChange(false)} height={32} size={12} />
      <Pill label={tr('tidy.remove')} on={removing} onPress={() => onChange(true)} height={32} size={12} />
    </View>
  );
}

/** Shot check rows (check / cross icons: the app's Inter subset has no ✓ ✗) and what it can't see; white, for PhotoViewer's dark footer unless color is given. */
export function ShotCheckList({ checks, color = '#fff' }: { checks: Check[]; color?: string }) {
  return (
    <View style={{ gap: 3 }}>
      {checks.map((c) => (
        <View key={c.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {c.ok ? <Icons.check size={13} color={color} /> : <Icons.close size={13} color={color} />}
          <Text style={[ui(12, 500), { color }]}>{c.text}</Text>
        </View>
      ))}
      <Text style={[ui(11), { color, opacity: 0.65, marginTop: 2 }]}>{NOT_CHECKED}</Text>
    </View>
  );
}

export type GridItem = { p: TPhoto; badge?: string | null; chip?: string };

const GAP = 6;

const Cell = React.memo(function Cell({ it, on, size, index, onPress, onLongPress }: {
  it: GridItem; on: boolean; size: number; index: number; onPress: (id: string) => void; onLongPress: (index: number) => void;
}) {
  const { t } = useTheme();
  const { p, badge, chip } = it;
  return (
    <Tap onPress={() => onPress(p.id)} onLongPress={() => onLongPress(index)} delayLongPress={350} accessibilityRole="button"
      accessibilityState={{ selected: on }} accessibilityHint={tr('tidy.holdToEnlarge')}
      accessibilityLabel={tr('tidy.photoFromA11y', { date: dateRange(p.created, p.created), badge: badge ? `, ${badge}` : '', status: on ? tr('tidy.trash') : tr('tidy.keep') })}
      style={{ width: size, height: size, borderRadius: 10 }}>
      <View style={{ flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: t.borderStrong }}>
        <Image source={{ uri: p.uri }} style={{ flex: 1, opacity: on ? 0.4 : 1 }} contentFit="cover" recyclingKey={p.id} transition={100} />
        {badge ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 5, paddingTop: 10, paddingBottom: 4, experimental_backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,0.65), rgba(0,0,0,0))' }}>
            <Text style={[ui(8.5, 600), { color: '#fff' }]} numberOfLines={1}>{badge}</Text>
          </View>
        ) : null}
        {chip ? (
          <View style={{ position: 'absolute', top: 5, left: 5, right: 5, alignItems: 'flex-start' }}>
            <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <Text style={[ui(8.5, 600), { color: '#fff' }]} numberOfLines={1}>{chip}</Text>
            </View>
          </View>
        ) : null}
      </View>
      {/* what happens to it, in words: a check mark read as "picked" */}
      <View style={[{ position: 'absolute', right: 5, bottom: badge ? 22 : 5, height: 22, paddingHorizontal: 8, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 3 },
        on ? { backgroundColor: t.ink } : { backgroundColor: 'rgba(255,255,255,0.92)' }]}>
        {on ? <Icons.trash size={11} color={t.bgScreen} /> : null}
        <Text style={[ui(10, 600), { color: on ? t.bgScreen : '#1a1a1a' }]}>{on ? tr('tidy.trash') : tr('tidy.keep')}</Text>
      </View>
    </Tap>
  );
});

/** 3-column grid; selected = marked for Trash (dimmed, tagged Trash; the rest are tagged Keep). Header/footer scroll with it. */
export function TidyGrid({ items, selected, onPress, onLongPress, header, footer, contentContainerStyle }: {
  items: GridItem[]; selected: Set<string>; onPress: (id: string) => void; onLongPress: (index: number) => void;
  header?: React.ReactElement; footer?: React.ReactElement; contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const w = useWindowDimensions().width;
  const size = Math.floor((w - 32 - 2 * GAP) / 3);
  return (
    <FlatList
      data={items}
      keyExtractor={(x) => x.p.id}
      numColumns={3}
      columnWrapperStyle={{ gap: GAP, marginBottom: GAP }}
      extraData={selected}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      showsVerticalScrollIndicator={false}
      initialNumToRender={24}
      windowSize={7}
      contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: 16 }, contentContainerStyle]}
      renderItem={({ item, index }) => <Cell it={item} on={selected.has(item.p.id)} size={size} index={index} onPress={onPress} onLongPress={onLongPress} />}
    />
  );
}
