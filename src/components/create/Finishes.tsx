// Create's "✧ 2 ways to finish" (decisions.md "X+Y section — FINAL", Variant 2 of xy_variants.html): the user's picks
// X plus two different suggested sets Y1 / Y2, as swipeable tall cards. Opened by "Suggest fills" in the Total row.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, ToastAndroid, useWindowDimensions, View } from 'react-native';
import type { IndexedPhoto, Library } from '../../services/index/photoIndex';
import { adoptWay, finishSets } from '../../services/stories/suggest';
import { createDraft, DumpPhoto } from '../../services/dumps';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { label, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Print } from '../ui/Print';
import { Tap } from '../ui/Tap';

export const toPhoto = (p: IndexedPhoto, suggested?: boolean): DumpPhoto =>
  ({ id: p.id, uri: p.uri, created: p.creationTime, ...(suggested ? { suggested } : null) });

const toast = (m: string) => (Platform.OS === 'android' ? ToastAndroid.show(m, ToastAndroid.SHORT) : console.log('[xy]', m));
const keyOf = (ps: DumpPhoto[]) => ps.map((p) => p.id).sort().join(',');

/** One suggestion round: the picks it was made from (X), the Total then, and the two Ys (✨-marked, disjoint). */
type Sets = { x: DumpPhoto[]; xKey: string; total: number; ys: [DumpPhoto[], DumpPhoto[]]; round: number };

/**
 * State + actions of the section. `total` = the Total shown in the stepper. X = the basket minus the photos this
 * section put there, so adopting a Y never reads as "Selection changed". ponytail: which photos the section placed is
 * kept for this session only (the ✨ flag itself persists in the draft); after a restart they count as the user's.
 */
export function useFinishes({ lib, basket, total, change, bumpTotal, title }: {
  lib: Library | null; basket: DumpPhoto[]; total: number;
  change: (next: DumpPhoto[]) => void; bumpTotal: (n: number) => void; /** none = the photos' date range */ title?: string;
}) {
  const [sets, setSets] = useState<Sets | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);
  /** every Y photo offered since the basket was last empty: Regenerate excludes them */
  const offered = useRef(new Set<string>());
  /** photos Use this put in the basket (not ones the user added, even if a Y also holds them) */
  const [placed, setPlaced] = useState<Set<string>>(new Set());
  const saving = useRef(false);

  const inBasket = new Set(basket.map((p) => p.id));
  // a placed photo the user took out (and may tap back in) is theirs; an emptied basket ends the round
  if ([...placed].some((id) => !inBasket.has(id))) setPlaced(new Set([...placed].filter((id) => inBasket.has(id))));
  if (!basket.length && sets) setSets(null);
  useEffect(() => { if (!basket.length) offered.current.clear(); }, [basket.length]);

  // the user took out all their own picks: what's left (placed photos) becomes their X
  const own = basket.filter((p) => !placed.has(p.id));
  const x = own.length ? own : basket;
  const stale = !!sets && (keyOf(x) !== sets.xKey || total !== sets.total);
  const added = (k: number) => !!sets && sets.ys[k].length > 0 && sets.ys[k].every((p) => inBasket.has(p.id));

  /** Y size = Total − |X|; when X already fills the Total, 2 (and Use this bumps the Total). */
  const run = (regen: boolean) => {
    if (busy) return;
    if (!lib) return toast('Still reading your photos, try again in a moment');
    if (!x.length) return toast('Pick a photo first, then Suggest fills');
    if (!own.length) setPlaced(new Set());
    setBusy(true);
    setOpen(true);
    // a frame for the spinner first; finishSets is synchronous (≈5–10 ms in node on 4k photos)
    setTimeout(() => {
      try {
        const size = total > x.length ? total - x.length : 2;
        const exclude = regen ? new Set(offered.current) : new Set<string>();
        const { ys, ms } = finishSets(lib, x.map((p) => p.id), size, exclude);
        console.log(`[xy] ${x.length} yours + ${size}: ${ys[0].length}/${ys[1].length} in ${ms} ms${regen ? `, excluding ${exclude.size}` : ''}`);
        if (!ys[0].length && !ys[1].length) {
          toast(regen ? 'No more new photos to suggest' : 'Nothing similar to suggest yet');
          return;
        }
        ys.flat().forEach((p) => offered.current.add(p.id));
        setSets({ round: Date.now(), x, xKey: keyOf(x), total, ys: [ys[0].map((p) => toPhoto(p, true)), ys[1].map((p) => toPhoto(p, true))] });
        setSaved([]);
      } finally {
        setBusy(false);
      }
    }, 16);
  };

  /** "Suggest fills": open what's there if it still fits the picks, else a fresh round. */
  const suggest = () => (sets && !stale ? setOpen(true) : run(false));

  /** Use this: add Y_k (✨) in place of any other offered Y; on an "Added" card, take Y_k out again. */
  const use = (k: number) => {
    if (!sets) return;
    const { next, placed: now } = adoptWay(basket, placed, sets.ys[k]);
    setPlaced(now);
    change(next);
    if (next.length > total) {
      bumpTotal(next.length);
      setSets({ ...sets, total: next.length });
    }
  };

  /** Save as draft: X + Y_k as its own draft (Library → Drafts); the basket stays as it is. */
  const save = async (k: number) => {
    if (!sets || saving.current || saved.includes(k)) return;
    // the card shows the old picks; saving them silently would make a draft the user no longer sees
    if (stale) return toast('Selection changed. Tap Refresh first');
    saving.current = true;
    try {
      const d = await createDraft({ source: 'create', title, photos: [...sets.x, ...sets.ys[k]] });
      console.log(`[xy] saved way ${k + 1} as ${d.id}`);
      setSaved((s) => [...s, k]);
      toast('Saved to Drafts');
    } catch (e) {
      console.warn('[xy] save failed:', e);
      toast('Couldn’t save the draft');
    } finally {
      saving.current = false;
    }
  };

  return { sets, open, setOpen, busy, stale, saved, added, suggest, regenerate: () => run(true), refresh: () => run(false), use, save };
}

export type Finishes = ReturnType<typeof useFinishes>;

/** Mock fan(): [0] centred on top, [1] fanned left, [2] fanned right; max 3, "+N" chip for the rest. */
function Fan({ photos, w, h, sparkle }: { photos: DumpPhoto[]; w: number; h: number; sparkle?: boolean }) {
  const { t } = useTheme();
  const pw = Math.round(w * 0.56), ph = Math.round(h * 0.84), r = Math.max(6, Math.round(w * 0.08));
  const [a, b, c] = photos;
  const print = (p: DumpPhoto, rotate: number, pos: object) => (
    <Print uri={p.uri} w={pw} h={ph} r={r} rotate={rotate} border={1.5} borderColor={fixed.printBorder} style={{ position: 'absolute', ...pos }} />
  );
  const more = photos.length - 3;
  return (
    <View style={{ width: w, height: h }}>
      {b ? print(b, -7, { left: 0, top: Math.round(h * 0.1) }) : null}
      {c ? print(c, 6, { right: 0, top: Math.round(h * 0.06) }) : null}
      {a ? print(a, -1.5, { left: Math.round((w - pw) / 2), top: 0 }) : null}
      {sparkle ? (
        <View style={{ position: 'absolute', top: -6, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
          <Icons.sparkle size={10} color={t.bgScreen} />
        </View>
      ) : null}
      {more > 0 ? (
        <View style={{ position: 'absolute', bottom: -2, right: Math.round((w - pw) / 2) - 6, paddingHorizontal: 5, borderRadius: 8, backgroundColor: t.ink }}>
          <Text style={[ui(9, 700), { color: t.bgScreen }]}>+{more}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Pill({ text, on, onPress, icon, a11y }: { text: string; on?: boolean; onPress: () => void; icon?: React.ReactNode; a11y: string }) {
  const { t } = useTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: !!on }} hitSlop={4}
      style={[{ height: 24, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
        on ? { backgroundColor: t.ink } : { borderWidth: 1, borderColor: t.borderStrong }]}>
      {icon}
      <Text style={[ui(9.5, 600), { color: on ? t.bgScreen : t.ink }]}>{text}</Text>
    </Tap>
  );
}

/** The section above the basket footer. Nothing until "Suggest fills" made a round. */
export function FinishSection({ f }: { f: Finishes }) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const { sets } = f;
  // the dots start over with each round (the ScrollView is keyed by it too)
  const [pg, setPg] = useState({ round: 0, i: 0 });
  const page = pg.round === sets?.round ? pg.i : 0;
  if (!sets && !f.busy) return null;

  // mock: card 212 of a 282 column, X fan 128x52, Y fan 176x76; prints at the mock's size at most (pinned area, grid needs room)
  const cardW = Math.round((win.width - 32) * 0.75);
  const k = Math.min(cardW / 212, 1);
  // Similar-strip photos in X are suggested too: count them that way, as the footer does
  const xSug = sets ? sets.x.filter((p) => p.suggested).length : 0;
  const ways = sets ? sets.ys.map((y, i) => ({ y, i })).filter((w) => w.y.length) : [];
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 2, gap: 8 }}>
        <Tap onPress={() => f.setOpen(!f.open)} accessibilityRole="button" accessibilityState={{ expanded: f.open }} accessibilityLabel="2 ways to finish" hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
          <Icons.sparkle size={12} color={t.ink} />
          <Text style={[label(9.5, 0.11), { color: t.inkMuted }]} numberOfLines={1}>2 ways to finish</Text>
          <View style={{ transform: [{ rotate: f.open ? '90deg' : '0deg' }] }}><Icons.chevron size={13} color={t.inkMuted} /></View>
        </Tap>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {f.stale && !f.busy ? (
            <Tap onPress={f.refresh} accessibilityRole="button" accessibilityLabel="Selection changed. Refresh suggestions" hitSlop={6}>
              <Text style={[ui(9.5), { color: t.inkMuted }]}>Selection changed · <Text style={[ui(9.5, 700), { color: t.ink, textDecorationLine: 'underline' }]}>Refresh</Text></Text>
            </Tap>
          ) : null}
          <FrameCard radius={12} onPress={f.busy ? undefined : f.regenerate} label="New suggestions" style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
            {f.busy ? <ActivityIndicator size={12} color={t.ink} /> : <Icons.refresh size={12} color={t.ink} />}
          </FrameCard>
        </View>
      </View>

      {!f.open ? null : !sets ? (
        <FrameCard radius={18} style={{ width: cardW, height: Math.round(150 * k) + 40, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ActivityIndicator color={t.inkMuted} />
          <Text style={[ui(10), { color: t.inkMuted }]}>Finding 2 ways to finish…</Text>
        </FrameCard>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + 8} decelerationRate="fast"
            key={sets.round} onScroll={(e) => setPg({ round: sets.round, i: Math.round(e.nativeEvent.contentOffset.x / (cardW + 8)) })} scrollEventThrottle={32}
            style={{ marginHorizontal: -16, opacity: f.busy ? 0.5 : 1 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 2, paddingBottom: 6 }}>
            {ways.map(({ y, i }) => {
              const on = f.added(i), saved = f.saved.includes(i);
              return (
                <FrameCard key={i} radius={18} style={[{ width: cardW, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 8, alignItems: 'center' },
                  on ? { boxShadow: `0 0 0 2px ${t.ink}, ${t.shadowCard}` } : null]}>
                  <Fan photos={sets.x} w={Math.round(128 * k)} h={Math.round(52 * k)} />
                  <View style={{ width: 18, height: 18, borderRadius: 9, marginVertical: -2, zIndex: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, boxShadow: t.shadowCard, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[ui(12, 600), { color: t.ink, lineHeight: 14 }]}>+</Text>
                  </View>
                  <Fan photos={y} w={Math.round(176 * k)} h={Math.round(76 * k)} sparkle />
                  <View style={{ alignSelf: 'stretch', marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[ui(9.5), { color: t.inkMuted, flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{sets.x.length - xSug} yours + {y.length + xSug} suggested</Text>
                    <Pill text={saved ? 'Saved' : 'Save as draft'} onPress={() => f.save(i)} a11y={saved ? 'Saved to Drafts' : 'Save this way as a draft'}
                      icon={saved ? <Icons.check size={10} color={t.ink} /> : null} />
                    <Pill text={on ? 'Added' : 'Use this'} on={on} onPress={() => f.use(i)} a11y={on ? 'Added. Tap to take these out' : 'Use these suggestions'}
                      icon={on ? <Icons.check size={10} color={t.bgScreen} /> : null} />
                  </View>
                </FrameCard>
              );
            })}
          </ScrollView>
          {ways.length > 1 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
              {ways.map((w, j) => (
                <View key={w.i} style={{ height: 6, width: j === page ? 16 : 6, borderRadius: 3, backgroundColor: j === page ? t.ink : t.borderStrong }} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
