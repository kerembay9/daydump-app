import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusScrim } from '../../components/ui/Screen';
import { IconButton } from '../../components/ui/TopHeader';
import { Icons } from '../../components/ui/Icons';
import { Confirm, ConfirmSpec } from '../../components/ui/Sheet';
import { PhotoViewer } from '../../components/ui/PhotoViewer';
import { Tap } from '../../components/ui/Tap';
import { missChip, formatBytes, KeepToggle, lockConfirm, moveConfirm, Primary, ShotCheckList, TidyGrid } from '../../components/tidy/TidyGrid';
import { monthOf, Pile, PILES, shotCheck } from '../../services/tidy/rules';
import { moveToTrash, useTidy } from '../../services/tidy/scan';
import { usePro } from '../../state/Pro';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { tr } from '../../i18n';

const REVIEW: Pile[] = ['copies', 'screens', 'blurry', 'paper', 'chats', 'private'];

/** One pile's photos: the picked ones are marked; tap to change, hold to look closer, then Move to Trash. */
export default function PileScreen() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { pile: param, month } = useLocalSearchParams<{ pile: string; month?: string }>();
  const pile = REVIEW.includes(param as Pile) ? (param as Pile) : null;
  const { result } = useTidy();
  const { isPro, openPaywall } = usePro();
  const items = useMemo(() => ((pile && result?.piles[pile]) || []).filter((x) => !month || monthOf(x.p.created) === month), [pile, result, month]);
  const [sel, setSel] = useState(() => new Set(items.filter((x) => x.pre).map((x) => x.p.id)));
  const [ask, setAsk] = useState<ConfirmSpec | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const grid = useMemo(() => items.map((x) => ({ p: x.p, badge: x.lock ?? x.note, chip: pile === 'blurry' ? missChip(shotCheck(x.p)) : undefined })), [items, pile]);
  const photos = useMemo(() => items.map((x) => x.p), [items]);
  const lockOf = useMemo(() => new Map(items.map((x) => [x.p.id, x.lock])), [items]);
  const picked = items.filter((x) => sel.has(x.p.id));
  const bytes = picked.reduce((a, x) => a + x.p.size, 0);

  const mark = useCallback((id: string, remove: boolean) => {
    const lock = lockOf.get(id);
    const apply = () => setSel((s) => { const n = new Set(s); if (remove) n.add(id); else n.delete(id); return n; });
    if (remove && lock) setAsk(lockConfirm(lock, apply)); else apply();
  }, [lockOf]);
  const onPress = useCallback((id: string) => mark(id, !sel.has(id)), [mark, sel]);

  // Pro: a free user sees and reviews every pile; moving to Trash opens the paywall (undo and restore stay free)
  const move = () => (!isPro ? openPaywall('tidy') : setAsk(moveConfirm(picked.length, bytes, async () => {
    setBusy(true); setMsg(null);
    try {
      const done = await moveToTrash(picked.map((x) => ({ p: x.p, pile: pile! })));
      if (done) { router.back(); return; }
      setMsg(tr('tidy.nothingMoved'));
    } catch (e) {
      console.warn('[tidy] move failed:', e);
      setMsg(tr('tidy.nothingMoved'));
    }
    setBusy(false);
  })));

  if (!pile) return null;
  const header = (
    <View style={{ paddingTop: insets.top + 8, paddingBottom: 10, gap: 6 }}>
      <View style={{ paddingTop: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/tidy'))}><Icons.back size={16} /></IconButton>
        <Text style={[display(20), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>{PILES[pile].title}</Text>
      </View>
      <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17 }]}>{pile === 'private' ? tr('tidy.checkTheseYourself') : PILES[pile].blurb}</Text>
      {items.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={[ui(12.5, 600), { color: t.ink }]}>{tr('tidy.removeSummary', { count: picked.length, bytes: formatBytes(bytes) })}</Text>
          {picked.length ? (
            <Tap onPress={() => setSel(new Set())} accessibilityRole="button" accessibilityLabel={tr('tidy.unselectAll')} hitSlop={8}>
              <Text style={[ui(12, 600), { color: t.inkMuted, textDecorationLine: 'underline' }]}>{tr('tidy.unselectAll')}</Text>
            </Tap>
          ) : null}
        </View>
      ) : <Text style={[ui(12.5), { color: t.inkMuted, marginTop: 8 }]}>{tr('tidy.nothingHere')}</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <TidyGrid items={grid} selected={sel} onPress={onPress} onLongPress={setView} header={header} />
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12, gap: 6 }}>
        {msg ? <Text style={[ui(12, 500), { color: t.inkMuted, textAlign: 'center' }]}>{msg}</Text> : null}
        <Primary label={tr('tidy.moveToTrashCount', { count: picked.length })} onPress={move} disabled={!picked.length || busy} pro={!isPro} />
      </View>
      <StatusScrim />
      <PhotoViewer photos={photos} index={view} onClose={() => setView(null)} footer={(p) => (
        <View>
          <ShotCheckList checks={shotCheck(p)} />
          <KeepToggle removing={sel.has(p.id)} onChange={(r) => mark(p.id, r)} />
        </View>
      )} />
      <Confirm c={ask} onClose={() => setAsk(null)} />
    </View>
  );
}
