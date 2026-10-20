// Create's "✧ 2 ways to finish" (decisions.md "X+Y section — FINAL", Variant 2 of xy_variants.html): the user's picks
// X plus two different suggested sets Y1 / Y2, as swipeable tall cards. Opened by "Suggest fills" in the Total row.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, ToastAndroid, useWindowDimensions, View } from 'react-native';
import type { IndexedPhoto, Library } from '../../services/index/photoIndex';
import { adoptWay, finishSets } from '../../services/stories/suggest';
import { createDraft, DumpPhoto } from '../../services/dumps';
import { useTheme } from '../../theme/ThemeProvider';
import { label, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Print } from '../ui/Print';
import { Tap } from '../ui/Tap';
import { mix, WayPreview } from './WayPreview';

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

  /** Y size = Total − |X|; when X already fills the Total, 2 (and Use this bumps the Total). xs / tot: the picks and Total about to be. */
  const run = (regen: boolean, xs = x, tot = total) => {
    if (busy) return;
    if (!lib) return toast('Still reading your photos, try again in a moment');
    if (!xs.length) return toast('Pick a photo first, then Suggest fills');
    if (!own.length) setPlaced(new Set());
    setBusy(true);
    setOpen(true);
    // a frame for the spinner first; finishSets is synchronous (≈5–10 ms in node on 4k photos)
    setTimeout(() => {
      try {
        const size = tot > xs.length ? tot - xs.length : 2;
        const exclude = regen ? new Set(offered.current) : new Set<string>();
        const { ys, ms } = finishSets(lib, xs.map((p) => p.id), size, exclude);
        console.log(`[xy] ${xs.length} yours + ${size}: ${ys[0].length}/${ys[1].length} in ${ms} ms${regen ? `, excluding ${exclude.size}` : ''}`);
        if (!ys[0].length && !ys[1].length) {
          toast(regen ? 'No more new photos to suggest' : 'Nothing similar to suggest yet');
          return;
        }
        ys.flat().forEach((p) => offered.current.add(p.id));
        setSets({ round: Date.now(), x: xs, xKey: keyOf(xs), total: tot, ys: [ys[0].map((p) => toPhoto(p, true)), ys[1].map((p) => toPhoto(p, true))] });
        setSaved([]);
      } finally {
        setBusy(false);
      }
    }, 16);
  };

  /** "Suggest fills": open what's there if it still fits the picks, else a fresh round. "Suggest again" (open): redraw. */
  const again = open && !!sets;
  const suggest = () => (again ? run(!stale) : sets && !stale ? setOpen(true) : run(false));

  /** the last add, for "Added N photos · Undo": everything as it was before it (basket, placed, Total, ways) */
  const [undo, setUndo] = useState<{ n: number; basket: DumpPhoto[]; placed: Set<string>; total: number; sets: Sets | null } | null>(null);
  useEffect(() => { if (!undo) return; const h = setTimeout(() => setUndo(null), 4000); return () => clearTimeout(h); }, [undo]);
  const put = (next: DumpPhoto[], now: Set<string>) => {
    const n = next.filter((p) => !inBasket.has(p.id)).length;
    if (n) setUndo({ n, basket, placed, total, sets });
    setPlaced(now);
    change(next);
  };
  const undoAdd = () => { if (!undo) return; setPlaced(undo.placed); change(undo.basket); bumpTotal(undo.total); setSets(undo.sets); setUndo(null); };

  /** Use this: add Y_k (✨) in place of any other offered Y; on an "Added" card, take Y_k out again. */
  const use = (k: number) => {
    if (!sets) return;
    const { next, placed: now } = adoptWay(basket, placed, sets.ys[k]);
    put(next, now);
    if (next.length > total) {
      bumpTotal(next.length);
      setSets({ ...sets, total: next.length });
    }
  };

  /** Add N picked (preview): only the circled ✨ photos, as the user's own picks; the ways redraw for them (board 9). */
  const addPicked = (k: number, ids: Set<string>) => {
    if (!sets) return;
    // without the ✨ flag: the dock counts them as You, like the ways do
    const more = sets.ys[k].filter((p) => ids.has(p.id) && !inBasket.has(p.id)).map(({ suggested, ...p }) => p);
    const next = [...basket, ...more];
    put(next, placed);
    // the X and Total the next render will have (no picks of their own yet: run makes the whole basket theirs)
    run(false, own.length ? [...own, ...more] : next, Math.max(total, next.length));
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

  return { sets, open, setOpen, busy, stale, picks: x.length, saved, added, again, suggest, regenerate: () => run(true), refresh: () => run(false), use, addPicked, undo, undoAdd, save };
}

export type Finishes = ReturnType<typeof useFinishes>;

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

/** The section that grows up out of the dock (above Total). Nothing until "Suggest fills" made a round. */
export function FinishSection({ f }: { f: Finishes }) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const { sets } = f;
  // the dots and the scroll start over with each round (not a remount: that blanks every tile while it reloads)
  const [pg, setPg] = useState({ round: 0, i: 0 });
  const scroller = useRef<ScrollView>(null);
  useEffect(() => { scroller.current?.scrollTo({ x: 0, animated: false }); }, [sets?.round]);
  /** the way open in the preview (an index into ways) and its circled photos */
  const [peek, setPeek] = useState<{ j: number; ids: Set<string> } | null>(null);
  const page = pg.round === sets?.round ? pg.i : 0;
  if (!sets && !f.busy) return null;

  const cardW = Math.round((win.width - 32) * 0.75);
  // six tiles a row; a Total over 6 wraps to a second row
  const tw = Math.floor((cardW - 20 - 5 * 4) / 6), th = Math.round(tw * 1.25);
  const ways = sets ? sets.ys.map((y, i) => ({ y, i })).filter((w) => w.y.length) : [];
  // 3C: picks changed since the round: the cards fade under one big Refresh (no auto-refresh)
  const stale = f.stale && !f.busy;
  return (
    <View style={{ marginBottom: 8 }}>
      {f.undo ? (
        <View style={{ position: 'absolute', bottom: '100%', alignSelf: 'center', marginBottom: 8, zIndex: 20, height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
          <Text style={[ui(11, 500), { color: t.bgScreen }]}>Added {f.undo.n} photo{f.undo.n === 1 ? '' : 's'} · </Text>
          <Tap onPress={f.undoAdd} accessibilityRole="button" accessibilityLabel="Undo" hitSlop={8}>
            <Text style={[ui(11, 700), { color: t.bgScreen, textDecorationLine: 'underline' }]}>Undo</Text>
          </Tap>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 2, gap: 8 }}>
        <Tap onPress={() => f.setOpen(!f.open)} accessibilityRole="button" accessibilityState={{ expanded: f.open }} accessibilityLabel="2 ways to finish" hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
          <Icons.sparkle size={12} color={t.ink} />
          <Text style={[label(9.5, 0.11), { color: t.inkMuted }]} numberOfLines={1}>2 ways to finish</Text>
          <View style={{ transform: [{ rotate: f.open ? '90deg' : '0deg' }] }}><Icons.chevron size={13} color={t.inkMuted} /></View>
        </Tap>
        <FrameCard radius={12} onPress={f.busy ? undefined : f.regenerate} label="New suggestions" style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          {f.busy ? <ActivityIndicator size={12} color={t.ink} /> : <Icons.refresh size={12} color={t.ink} />}
        </FrameCard>
      </View>

      {!f.open ? null : !sets ? (
        <FrameCard radius={18} style={{ width: cardW, height: 2 * th + 70, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ActivityIndicator color={t.inkMuted} />
          <Text style={[ui(10), { color: t.inkMuted }]}>Finding 2 ways to finish…</Text>
        </FrameCard>
      ) : (
        <>
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + 8} decelerationRate="fast" pointerEvents={stale ? 'none' : 'auto'}
              ref={scroller} onScroll={(e) => setPg({ round: sets.round, i: Math.round(e.nativeEvent.contentOffset.x / (cardW + 8)) })} scrollEventThrottle={32}
              style={{ marginHorizontal: -16, opacity: stale ? 0.3 : f.busy ? 0.5 : 1 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 2, paddingBottom: 6 }}>
              {ways.map(({ y, i }, j) => {
                const on = f.added(i), saved = f.saved.includes(i);
                return (
                  <FrameCard key={i} radius={18} style={[{ width: cardW, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8 }, on ? { boxShadow: `0 0 0 2px ${t.ink}, ${t.shadowCard}` } : null]}>
                    <Tap onPress={() => setPeek({ j, ids: new Set() })} accessibilityRole="button" accessibilityLabel={`Preview way ${j + 1}`}
                      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
                      {mix(sets.x, y).map((p) => (
                        <View key={p.id}>
                          <Print uri={p.uri} w={tw} h={th} r={5} />
                          {y.includes(p) ? (
                            <View style={{ position: 'absolute', right: 2, bottom: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
                              <Icons.sparkle size={7} color={t.bgScreen} />
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </Tap>
                    <Text onPress={() => setPeek({ j, ids: new Set() })} style={[ui(9.5), { color: t.inkMuted, textAlign: 'center', marginTop: 8 }]} numberOfLines={1}>
                      {sets.x.length} yours + {y.length} suggested · <Text style={[ui(9.5, 700), { color: t.ink, textDecorationLine: 'underline' }]}>Preview</Text>
                    </Text>
                    <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                      <Pill text={saved ? 'Saved' : 'Save as draft'} onPress={() => f.save(i)} a11y={saved ? 'Saved to Drafts' : 'Save this way as a draft'}
                        icon={saved ? <Icons.check size={10} color={t.ink} /> : null} />
                      <Pill text={on ? 'Added' : 'Use this'} on={on} onPress={() => f.use(i)} a11y={on ? 'Added. Tap to take these out' : 'Use these suggestions'}
                        icon={on ? <Icons.check size={10} color={t.bgScreen} /> : null} />
                    </View>
                  </FrameCard>
                );
              })}
            </ScrollView>
            {stale ? (
              <Tap onPress={f.refresh} accessibilityRole="button" accessibilityLabel={`Refresh for ${f.picks} pick${f.picks === 1 ? '' : 's'}`}
                style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <View style={{ height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', gap: 6, boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                  <Icons.refresh size={14} color={t.bgScreen} />
                  <Text style={[ui(12, 600), { color: t.bgScreen }]}>Refresh for {f.picks} pick{f.picks === 1 ? '' : 's'}</Text>
                </View>
                <Text style={[ui(10, 500), { color: t.inkMuted, backgroundColor: t.bgScreen, paddingHorizontal: 8, borderRadius: 8, overflow: 'hidden' }]}>Picks changed</Text>
              </Tap>
            ) : null}
          </View>
          {ways.length > 1 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
              {ways.map((w, j) => (
                <View key={w.i} style={{ height: 6, width: j === page ? 16 : 6, borderRadius: 3, backgroundColor: j === page ? t.ink : t.borderStrong }} />
              ))}
            </View>
          ) : null}
        </>
      )}
      {sets ? <WayPreview f={f} x={sets.x} ways={ways} peek={peek} setPeek={setPeek} /> : null}
    </View>
  );
}
