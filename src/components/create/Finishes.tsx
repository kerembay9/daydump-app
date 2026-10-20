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
import { WayPreview } from './WayPreview';

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

  /** Y size = Total − |X|; none when X fills the Total. xs / tot: the picks and Total about to be. */
  const run = (regen: boolean, xs = x, tot = total) => {
    if (busy) return;
    if (!lib) return toast('Still reading your photos, try again in a moment');
    if (!xs.length) return toast('Pick a photo first, then Suggest fills');
    // the picks already fill the Total: nothing to suggest (the ways of an older round would be wrong now)
    if (xs.length >= tot) { setSets(null); return toast('Raise Total to get suggestions'); }
    if (!own.length) setPlaced(new Set());
    setBusy(true);
    setOpen(true);
    // a frame for the spinner first; finishSets is synchronous (≈5–10 ms in node on 4k photos)
    setTimeout(() => {
      try {
        const size = tot - xs.length;
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

  return { sets, open, setOpen, busy, stale, picks: x.length, saved, added, again, suggest, refresh: () => run(false), use, addPicked, undo, undoAdd, save };
}

export type Finishes = ReturnType<typeof useFinishes>;

/**
 * The mock's fan, for any count: [0] centred on top, then alternating left / right, each step further out and tilted
 * more; every photo shows (no "+N"). Prints keep the mock's size (by h) and spread over the whole width w, so the
 * more there are, the more they overlap.
 */
function Fan({ photos, w, h, sparkle }: { photos: DumpPhoto[]; w: number; h: number; sparkle?: boolean }) {
  const { t } = useTheme();
  const ph = Math.round(h * 0.84), pw = Math.min(Math.round(ph * 1.6), w), r = Math.max(6, Math.round(pw * 0.1));
  const steps = Math.ceil((photos.length - 1) / 2), mid = (w - pw) / 2;
  // a few photos sit side by side (slight overlap); many share the width
  const step = steps ? Math.min(pw * 0.85, mid / steps) : 0;
  return (
    <View style={{ width: w, height: h }}>
      {photos.map((p, i) => {
        const k = Math.ceil(i / 2), side = i % 2 ? -1 : 1, f = steps ? k / steps : 0;
        return { p, left: Math.round(mid + side * k * step), top: Math.round(h * (i ? 0.06 + 0.04 * f : 0)), rotate: i ? side * (2 + 3 * f) : -1.5 };
      }).reverse().map(({ p, left, top, rotate }) => (
        <Print key={p.id} uri={p.uri} w={pw} h={ph} r={r} rotate={rotate} border={1.5} borderColor={fixed.printBorder} style={{ position: 'absolute', left, top }} />
      ))}
      {/* on the top (centre) photo: the fan's edge has nothing on it when there are few photos */}
      {sparkle ? (
        <View style={{ position: 'absolute', top: -6, left: Math.round(mid + pw - 12), width: 18, height: 18, borderRadius: 9, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
          <Icons.sparkle size={10} color={t.bgScreen} />
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

  // mock: card 212 of a 282 column, X fan 52 tall, Y fan 76 (a little taller here); both fans use the card's full width
  const cardW = Math.round((win.width - 32) * 0.75);
  const k = Math.min(cardW / 212, 1);
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
        {f.busy ? <ActivityIndicator size={12} color={t.ink} /> : null}
      </View>

      {!f.open ? null : !sets ? (
        <FrameCard radius={18} style={{ width: cardW, height: Math.round(150 * k) + 40, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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
                  <FrameCard key={i} radius={18} style={[{ width: cardW, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 8, alignItems: 'center' },
                    on ? { boxShadow: `0 0 0 2px ${t.ink}, ${t.shadowCard}` } : null]}>
                    <Tap onPress={() => setPeek({ j, ids: new Set() })} accessibilityRole="button" accessibilityLabel={`Preview way ${j + 1}`} style={{ alignItems: 'center' }}>
                      <Fan photos={sets.x} w={cardW - 20} h={Math.round(56 * k)} />
                      <View style={{ width: 18, height: 18, borderRadius: 9, marginVertical: -2, zIndex: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, boxShadow: t.shadowCard, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={[ui(12, 600), { color: t.ink, lineHeight: 14 }]}>+</Text>
                      </View>
                      <Fan photos={y} w={cardW - 20} h={Math.round(80 * k)} sparkle />
                    </Tap>
                    <View style={{ alignSelf: 'stretch', marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text onPress={() => setPeek({ j, ids: new Set() })} style={[ui(9.5), { color: t.inkMuted, flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {sets.x.length} yours + {y.length} suggested · <Text style={[ui(9.5, 700), { color: t.ink, textDecorationLine: 'underline' }]}>Preview</Text>
                      </Text>
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
                <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderStrong, boxShadow: t.shadowCard }}>
                  <Text style={[ui(10.5, 600), { color: t.ink }]}>Picks changed</Text>
                </View>
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
