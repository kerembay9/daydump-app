import React, { useCallback, useRef, useState } from 'react';
// Photos inside a card that Save / Share capture are RN's Image: it clips itself to its rounded box when drawn. Skia's
// makeImageFromView skips overflow: hidden on RN 0.86 (it calls ReactViewGroup.dispatchOverflowDraw, which is gone), so an
// expo-image cover spills out of its square in the saved PNG.
import { ActivityIndicator, Animated, Image as Photo, Linking, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, Path, Text as SvgText, TextPath } from 'react-native-svg';
import { File, Paths } from 'expo-file-system';
import { ImageFormat, makeImageFromView } from '@shopify/react-native-skia';
import { shareImages } from '../../modules/clip-embedder';
import { saveToAlbum } from '../services/shareService';
import { router, useFocusEffect } from 'expo-router';
import { accent, accentTint, PopToast, useSlotPop } from '../components/SlotPop';
import { FrameCard } from '../components/ui/FrameCard';
import { Sheet } from '../components/ui/Sheet';
import { Icons } from '../components/ui/Icons';
import { Screen } from '../components/ui/Screen';
import { Tap } from '../components/ui/Tap';
import { IconButton } from '../components/ui/TopHeader';
import { PhotoViewer } from '../components/ui/PhotoViewer';
import { useApp } from '../state/AppState';
import { AlbumDay, Cell, dayKey, Hub, monday, photosOn, setPrint, setSquare, swapCell, useChecking, useHub } from '../services/today';
import { useTheme } from '../theme/ThemeProvider';
import { fixed, type Theme } from '../theme/tokens';
import { display, sans, ui } from '../theme/type';
import { tr } from '../i18n';

const TILT = [-4, 5, -3, 6, -5, 4, -2];
const shade = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 };
const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const weekday = (k: string) => new Date(k + 'T12:00').toLocaleDateString('en-US', { weekday: 'long' });

/** Two or more views of one thing: Today | Album, Week | Month. */
function Pill<T extends string>({ items, on, onPick, big }: { items: readonly T[]; on: T; onPick: (x: T) => void; big?: boolean }) {
  const { t } = useTheme();
  const labelOf = (x: T) => {
    if (x === 'Bingo') return tr('today.tabBingo');
    if (x === 'Album') return tr('today.tabAlbum');
    if (x === 'Week') return tr('today.tabWeek');
    if (x === 'Month') return tr('today.tabMonth');
    return x;
  };
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.borderSubtle, borderRadius: 14, padding: 2 }}>
      {items.map((x) => (
        <Tap key={x} onPress={() => onPick(x)} accessibilityRole="tab" accessibilityLabel={labelOf(x)} accessibilityState={{ selected: x === on }}
          style={[{ paddingHorizontal: big ? 20 : 13, paddingVertical: big ? 6 : 4, borderRadius: 12 }, x === on ? { backgroundColor: t.dark ? t.borderStrong : fixed.printBorder } : null]}>
          <Text style={[ui(big ? 13 : 11.5, 600), { color: x === on ? t.ink : t.inkMuted }]}>{labelOf(x)}</Text>
        </Tap>
      ))}
    </View>
  );
}

/** Dark paper photo corners holding the card (like an old album). */
function Corners({ t }: { t: Theme }) {
  const c = t.dark ? '#0d0a08' : '#3a2b22', n = 20;
  const tri = (pos: object, side: 'Left' | 'Right', vert: 'Top' | 'Bottom') => (
    <View pointerEvents="none" style={[{ position: 'absolute', width: 0, height: 0, opacity: 0.85, [`border${vert}Width`]: n, [`border${vert}Color`]: c, [`border${side === 'Left' ? 'Right' : 'Left'}Width`]: n, [`border${side === 'Left' ? 'Right' : 'Left'}Color`]: 'transparent' }, pos]} />
  );
  return <>{tri({ top: 0, left: 0 }, 'Left', 'Top')}{tri({ top: 0, right: 0 }, 'Right', 'Top')}{tri({ bottom: 0, left: 0 }, 'Left', 'Bottom')}{tri({ bottom: 0, right: 0 }, 'Right', 'Bottom')}</>;
}

function Square({ c, swaps, flip, onFix, onView }: { c: Cell; swaps: number; flip: ReturnType<typeof useSlotPop>['flip']; onFix: (c: Cell) => void; onView: (c: Cell) => void }) {
  const { t } = useTheme();
  const box = { width: '100%' as const, aspectRatio: 1, borderRadius: 9, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 6 };
  if (!c.key) return <View style={[box, { backgroundColor: accentTint(t) }]}><Text style={[display(15), { color: accent(t) }]}>{tr('today.freeSquare')}</Text></View>;
  if (c.on) return (
    <Tap onPress={() => onFix(c)} onLongPress={() => onView(c)} delayLongPress={350} accessibilityRole="button" accessibilityLabel={tr('today.squareDoneA11y', { label: c.label })} accessibilityHint={tr('tidy.holdToEnlarge')} style={{ width: '100%', aspectRatio: 1 }}>
    <Animated.View style={[box, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, flip(c.key)]}>
      {c.uri ? <Photo testID="square-photo" source={{ uri: c.uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 9 }} resizeMode="cover" /> : null}
      <Text style={[ui(11, 600), shade, { color: fixed.printBorder, textAlign: 'center' }]}>{c.label}</Text>
      <Text style={[ui(11, 600), shade, { color: fixed.printBorder, position: 'absolute', right: 6, top: 5 }]}>✓</Text>
      {c.win ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 9, borderWidth: 3, borderColor: accent(t) }} /> : null}
    </Animated.View>
    </Tap>
  );
  return (
    <Tap onPress={() => swapCell(c.i)} disabled={!swaps} accessibilityRole="button" accessibilityLabel={swaps ? tr('today.squareEmptySwapA11y', { label: c.label }) : tr('today.squareEmptyA11y', { label: c.label })}
      style={[box, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.borderStrong }]}>
      <Text style={[ui(11, 600), { color: t.inkMuted, textAlign: 'center' }]}>{c.label}</Text>
      {swaps ? <Text style={[ui(11, 600), { color: t.inkMuted, opacity: 0.55, position: 'absolute', right: 5, bottom: 4 }]}>↻</Text> : null}
    </Tap>
  );
}

/** A filled square's fix: another of today's photos goes in it, or its photo comes out (the next best, or nothing, fills it). */
function FixSheet({ c, shots, onClose }: { c: Cell | null; shots: string[]; onClose: () => void }) {
  const { t } = useTheme();
  const fix = (uri: string | null) => { onClose(); if (c) void setSquare(c.i, uri); };
  return (
    <Sheet visible={!!c} onClose={onClose}>
      <Text style={[display(19), { color: t.ink }]}>{c?.label}</Text>
      <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17 }]}>{tr('today.fixSheetHint')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
        {shots.map((uri, n) => (
          <Tap key={uri} onPress={() => fix(uri)} accessibilityRole="button" accessibilityLabel={tr('today.photoOfTodayA11y', { index: n + 1 })} accessibilityState={{ selected: uri === c?.uri }}
            style={{ width: 76, height: 76, borderRadius: 10, overflow: 'hidden', borderWidth: uri === c?.uri ? 3 : 0, borderColor: accent(t), backgroundColor: t.borderStrong }}>
            <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={uri} />
          </Tap>
        ))}
      </ScrollView>
      <FrameCard radius={14} onPress={() => fix(null)} label={tr('today.takePhotoOut')} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
        <Text style={[ui(13, 600), { color: '#B4412A' }]}>{tr('today.takePhotoOut')}</Text>
      </FrameCard>
    </Sheet>
  );
}

/** Album: pick the photo for a day's print from that day's camera photos. */
function PrintSheet({ k, print, onClose }: { k: string | null; print?: string; onClose: () => void }) {
  const { t } = useTheme();
  const { library } = useApp();
  const at = k ? new Date(k + 'T12:00') : null;
  const shots = at && library ? photosOn(library, at.getTime()).map((p) => p.uri) : [];
  return (
    <Sheet visible={!!k} onClose={onClose}>
      <Text style={[display(19), { color: t.ink }]}>{at?.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
      <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17 }]}>{tr('today.pickPrintHint')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
        {shots.map((uri, n) => (
          <Tap key={uri} onPress={() => { onClose(); if (k) void setPrint(k, uri); }} accessibilityRole="button" accessibilityLabel={tr('today.photoOfDayA11y', { index: n + 1 })} accessibilityState={{ selected: uri === print }}
            style={{ width: 76, height: 76, borderRadius: 10, overflow: 'hidden', borderWidth: uri === print ? 3 : 0, borderColor: accent(t), backgroundColor: t.borderStrong }}>
            <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={uri} />
          </Tap>
        ))}
      </ScrollView>
    </Sheet>
  );
}

/**
 * Save (to the PicDump album) and Share (the system sheet, caption with the hashtag) for the view under `card`. Its buttons look
 * inside the card but sit on top of it, outside `card`, so the capture leaves them out and they never blink.
 */
function useShare(card: React.RefObject<View | null>, name: string, caption: string) {
  const [said, setSaid] = useState<string | null>(null);
  const say = (x: string) => { setSaid(x); setTimeout(() => setSaid(null), 3000); };
  const run = async (what: 'save' | 'share') => {
    try {
      // makeImageFromView: Android needs the view uncollapsed
      const img = await makeImageFromView(card);
      if (!img) throw new Error('nothing to capture');
      const file = new File(Paths.cache, `${name}-${Date.now().toString(36)}.png`);
      file.write(img.encodeToBytes(ImageFormat.PNG));
      img.dispose();
      if (what === 'save') { await saveToAlbum([file.uri]); say(tr('today.savedToPicDump')); } else await shareImages([file.uri], caption, null);
    } catch (e) { console.warn(`[today] ${what} failed:`, e); say(what === 'save' ? tr('today.couldntSave') : tr('today.couldntShare')); }
  };
  return { run, said };
}

/** `ghost`: an invisible copy inside the captured card that holds the buttons' place; the real ones sit over it, outside the card. */
function ShareButtons({ name, run, ghost, shareLabel = 'Share' }: { name: string; run?: (w: 'save' | 'share') => void; ghost?: boolean; shareLabel?: string }) {
  const { t } = useTheme();
  const pill = { height: 28, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const };
  const label = shareLabel === 'Share' ? tr('today.share') : shareLabel;
  return (
    <View style={{ flexDirection: 'row', gap: 6, opacity: ghost ? 0 : 1 }} pointerEvents={ghost ? 'none' : 'auto'} accessibilityElementsHidden={ghost} importantForAccessibility={ghost ? 'no-hide-descendants' : 'auto'}>
      <Tap onPress={() => { run?.('save'); }} accessibilityRole="button" accessibilityLabel={ghost ? undefined : tr('today.saveNameA11y', { name })} style={pill}><Text style={[ui(11.5, 600), { color: t.ink }]}>{tr('today.save')}</Text></Tap>
      <Tap onPress={() => { run?.('share'); }} accessibilityRole="button" accessibilityLabel={ghost ? undefined : tr('today.shareNameA11y', { name })} style={[pill, shareLabel !== 'Share' ? { backgroundColor: t.ink, borderColor: t.ink } : null]}>
        <Text style={[ui(11.5, 600), { color: shareLabel !== 'Share' ? t.bgScreen : t.ink }]}>{label}</Text>
      </Tap>
    </View>
  );
}

/** The quest's rubber stamp: its text around the ring, a doodle in the middle until the photo that found it fills it. */
function Stamp({ text, uri, t }: { text: string; uri?: string; t: Theme }) {
  const a = accent(t);
  return (
    <View style={{ width: 70, height: 70, transform: [{ rotate: '-8deg' }] }}>
      <Svg width={70} height={70} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={47} stroke={a} strokeWidth={2} strokeDasharray="4 3" fill="none" />
        <Defs><Path id="ring" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" /></Defs>
        <SvgText fill={a} fontSize={9.5} fontFamily={sans[700]} letterSpacing={1.1}><TextPath href="#ring">{text}</TextPath></SvgText>
        {uri ? null : <Circle cx={50} cy={50} r={25} fill={accentTint(t)} />}
        {uri ? null : <Path d="M38 61c4-8 7-12 11-12s4 5 8 5 3-4 3-4M44 42m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M55 38l3 3m3-3l-3 3" stroke={a} strokeWidth={2.2} fill="none" strokeLinecap="round" />}
      </Svg>
      {uri ? <Photo testID="quest-photo" source={{ uri }} style={{ position: 'absolute', left: 17.5, top: 17.5, width: 35, height: 35, borderRadius: 18 }} resizeMode="cover" /> : null}
    </View>
  );
}

function Chip({ text, hot, t }: { text: string; hot?: boolean; t: Theme }) {
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: hot ? accent(t) : t.borderSubtle }}>
      <Text style={[ui(10.5, 600), { color: hot ? fixed.printBorder : t.inkMuted }]}>{text}</Text>
    </View>
  );
}

function TodayTab({ hub, flip }: { hub: Hub; flip: ReturnType<typeof useSlotPop>['flip'] }) {
  const { t } = useTheme();
  const { library, stories } = useApp();
  const checking = useChecking(library);
  const story = stories.find((x) => x.kind === 'today');
  const board = useRef<View>(null), questCard = useRef<View>(null);
  const [fixing, setFixing] = useState<Cell | null>(null);
  const [view, setView] = useState<number | null>(null);
  const shown = hub.cells.filter((c) => c.on && c.uri).map((c) => ({ id: c.uri!, uri: c.uri! }));
  const bingo = useShare(board, 'bingo card', `${hub.bingo ? 'Bingo! ' : ''}Today’s photo bingo #picdumpbingo`);
  const q = hub.quest;
  const quest = useShare(questCard, 'side quest', `Side quest: ${q.label} ✓ #picdumpquest #${q.label.toLowerCase().replace(/[^a-z]/g, '')}`);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  const end = new Date(q.from); end.setDate(end.getDate() + 6);
  const on = q.day === hub.day ? 'today' : q.day ? `on ${weekday(q.day)}` : '';

  return (
    <>
      <View style={{ marginBottom: 8 }}>
      <View ref={board} collapsable={false}>
        <FrameCard radius={14} padding={12}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9, minHeight: 34 }}>
            <Text style={[display(17), { color: t.ink }]}>{tr('today.todaysBingo')}</Text>
            <ShareButtons name="bingo card" ghost />
          </View>
          <View style={{ gap: 6 }}>
            {[0, 3, 6].map((r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
                {/* equal thirds: a square's own padding and border would widen its flex share */}
                {hub.cells.slice(r, r + 3).map((c) => <View key={c.i} style={{ flex: 1 }}><Square c={c} swaps={hub.swapsLeft} flip={flip} onFix={setFixing} onView={(x) => setView(shown.findIndex((p) => p.uri === x.uri))} /></View>)}
              </View>
            ))}
          </View>
          {hub.bingo ? (
            <View style={{ marginTop: 9, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: accent(t) }}>
              <Text style={[ui(12.5, 600), { color: fixed.printBorder, lineHeight: 17 }]}>{tr('today.bingoBanner')}</Text>
            </View>
          ) : null}
        </FrameCard>
        <Corners t={t} />
      </View>
        {/* over the header, outside the capture: FrameCard's 1px border + 12 padding */}
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 13, left: 13, right: 13, height: 34, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
          {/* the phone's camera; back in the app, the new photo is checked
              ponytail: Android only (iOS can't open its Camera app); expo-image-picker's camera + a save if iOS ships */}
          {Platform.OS === 'android' ? (
            <Tap onPress={() => Linking.sendIntent('android.media.action.STILL_IMAGE_CAMERA').catch((e) => console.warn('[today] camera:', e))}
              accessibilityRole="button" accessibilityLabel={tr('today.openCamera')}
              style={{ position: 'absolute', left: '50%', marginLeft: -17, width: 34, height: 34, borderRadius: 17, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Icons.camera size={17} color={t.bgScreen} />
            </Tap>
          ) : null}
          <ShareButtons name="bingo card" run={bingo.run} />
        </View>
      </View>
      <Text style={[ui(11), { color: t.inkMuted, textAlign: 'center', marginBottom: 14 }]} numberOfLines={1}>
        {checking ?? bingo.said ?? (hub.swapsLeft ? tr('today.swapHelp') : '')}
      </Text>

      <View style={{ marginBottom: 14 }}>
      <View ref={questCard} collapsable={false}>
        <FrameCard radius={14} padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Stamp t={t} uri={q.uri} text={q.found ? `FOUND · ${q.label.toUpperCase()} ·${q.label.length < 11 ? ' FOUND ·' : ''}` : `WEEKLY QUEST · ${fmt(new Date(q.from))} – ${fmt(end)} ·`} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[ui(9.5, 700), { color: accent(t), letterSpacing: 1, textTransform: 'uppercase' }]}>{q.found ? tr('today.foundOn', { on }) : tr('today.thisWeeksQuest')}</Text>
            <Text style={[display(19), { color: t.ink }]}>{q.label}</Text>
            <Text style={[ui(11.5), { color: t.inkMuted, lineHeight: 16 }]}>
              {q.found ? tr('today.questFoundSub', { day: on === 'today' ? tr('today.today').toLowerCase() : weekday(q.day!) }) : tr('today.questFindSub')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              {q.found ? <ShareButtons name="side quest" ghost />
                : <><Chip t={t} hot text={q.left === 1 ? tr('today.lastDay') : tr('today.daysLeft', { count: q.left })} /><Chip t={t} text={tr('today.newOnMonday')} /></>}
            </View>
          </View>
          {q.found ? (
            <View pointerEvents="none" style={{ position: 'absolute', right: 10, top: 10, borderWidth: 2, borderColor: accent(t), borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, transform: [{ rotate: '12deg' }], opacity: 0.85 }}>
              <Text style={[ui(11, 700), { color: accent(t), letterSpacing: 1.5 }]}>{tr('today.found')}</Text>
            </View>
          ) : null}
        </FrameCard>
      </View>
        {/* over the ghost under the text, outside the capture: border + padding, the 70 stamp and its 12 gap; the text column is the taller one */}
        {q.found ? (
          <View style={{ position: 'absolute', left: 95, bottom: Platform.OS === 'android' ? 14 : 13 }}><ShareButtons name="side quest" run={quest.run} /></View>
        ) : null}
      </View>
      {quest.said ? <Text style={[ui(11), { color: t.inkMuted, textAlign: 'center', marginTop: -8, marginBottom: 12 }]}>{quest.said}</Text> : null}

      {story ? (
        <Tap onPress={() => router.push({ pathname: '/preview/[id]', params: { id: 'today' } })} accessibilityRole="button"
          style={{ height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.bgScreen }]}>{tr('today.makeDumpFromToday', { count: hub.photos })}</Text>
        </Tap>
      ) : null}
      <FixSheet c={fixing} shots={hub.shots} onClose={() => setFixing(null)} />
      <PhotoViewer photos={shown} index={view} onClose={() => setView(null)} />
    </>
  );
}

/** A bingo day's print as a polaroid; the week's quest sticker on the day that found it. */
function Polaroid({ day, w, tilt, label, peg, onPress, onLongPress, t }: { day: AlbumDay; w: number; tilt: number; label: string; peg?: boolean; onPress: () => void; onLongPress: () => void; t: Theme }) {
  const st = Math.round(w * 0.42);
  return (
    <Tap onPress={onPress} onLongPress={onLongPress} delayLongPress={350} accessibilityRole="button" accessibilityHint={tr('tidy.holdToEnlarge')} accessibilityLabel={tr('today.polaroidA11y', { label, quest: day.quest ? `, ${day.quest.label}` : '' })} style={{ width: w, padding: 3, paddingBottom: 0, backgroundColor: fixed.printBorder, borderRadius: 2, borderWidth: 0.5, borderColor: 'rgba(55,38,28,0.25)', transform: [{ rotate: `${tilt}deg` }] }}>
      <Photo testID="album-print" source={{ uri: day.print }} style={{ width: w - 6, height: w - 6, backgroundColor: t.borderStrong }} resizeMode="cover" />
      <Text numberOfLines={1} style={[ui(w < 50 ? 8 : 9.5, 600), { color: '#5a4a3f', textAlign: 'center', paddingVertical: w < 50 ? 1 : 3 }]}>{label}</Text>
      {peg ? <View style={{ position: 'absolute', top: -7, left: w / 2 - 4, width: 8, height: 14, borderRadius: 2, backgroundColor: '#b79b7f' }} /> : null}
      {day.quest ? (
        <View testID="album-sticker" style={{ position: 'absolute', right: -st / 4, top: w * 0.55 - st / 2, width: st, height: st, borderRadius: st / 2, borderWidth: 2, borderColor: fixed.printBorder, backgroundColor: accent(t), overflow: 'hidden', transform: [{ rotate: '-10deg' }] }}>
          {day.quest.uri ? <Photo testID="album-sticker-photo" source={{ uri: day.quest.uri }} style={{ flex: 1, borderRadius: st / 2 }} resizeMode="cover" /> : null}
        </View>
      ) : null}
    </Tap>
  );
}

/** A day with no print: dashed when it's gone by, outlined today, faint when it's still to come or before the first print. */
function Blank({ w, h, label, state, t }: { w: number; h: number; label: string; state: 'miss' | 'today' | 'later' | 'off'; t: Theme }) {
  return (
    <View accessibilityLabel={tr('today.blankA11y', { label, state: state === 'miss' ? tr('today.noBingo') : state === 'off' ? tr('today.noCard') : tr('today.notYet') })}
      style={{ width: w, height: h, borderRadius: 3, alignItems: 'center', justifyContent: 'center', borderWidth: state === 'later' || state === 'off' ? 1 : 1.5, borderStyle: state === 'miss' ? 'dashed' : 'solid', borderColor: state === 'today' ? t.ink : t.borderStrong, backgroundColor: state === 'miss' ? t.borderSubtle : undefined, opacity: state === 'later' || state === 'off' ? 0.45 : 1 }}>
      <Text style={[ui(w < 50 ? 9 : 10.5, 600), { color: state === 'today' ? t.ink : t.inkMuted }]}>{label}</Text>
    </View>
  );
}

/** The clothesline a row of the week hangs from. */
function Line({ w, t }: { w: number; t: Theme }) {
  return <Svg width={w} height={20} style={{ position: 'absolute', top: 0 }}><Path d={`M0 3 Q${w / 2} 22 ${w} 3`} stroke={t.dark ? '#7d6c5e' : '#9c8a7a'} strokeWidth={1.2} fill="none" /></Svg>;
}

/** Album: the week (Monday to Sunday, the quest's week) on two clotheslines, or the month as a calendar of polaroids. Both share. */
function AlbumTab({ hub }: { hub: Hub }) {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
  const [view, setView] = useState<'Week' | 'Month'>('Week');
  const [off, setOff] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const [big, setBig] = useState<number | null>(null);
  const card = useRef<View>(null);
  const today = hub.day, first = Object.keys(hub.album).sort()[0], now = new Date(today + 'T12:00');
  const W = width - 32 - 26; // the screen's gutters, the card's padding and border

  let title: string, body: React.ReactNode, from: Date, days: string[];
  if (view === 'Week') {
    from = new Date(monday(now.getTime())); from.setDate(from.getDate() - 7 * off);
    days = Array.from({ length: 7 }, (_, j) => dayKey(new Date(from).setDate(from.getDate() + j)));
    const fmt = (k: string) => new Date(k + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    title = off === 0 ? tr('today.thisWeek') : off === 1 ? tr('today.lastWeek') : `${fmt(days[0])} – ${fmt(days[6])}`;
    const pw = Math.min(84, Math.floor(W / 4) - 14);
    const item = (k: string, j: number) => {
      const label = k === today ? tr('today.today') : new Date(k + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' });
      const d = hub.album[k];
      return d?.print ? <Polaroid key={k} day={d} w={pw} tilt={TILT[j]} label={label} peg onPress={() => setPicking(k)} onLongPress={() => setBig(shown.findIndex((p) => p.id === k))} t={t} />
        : <Blank key={k} w={pw} h={pw + 12} label={label} state={k === today ? 'today' : k > today ? 'later' : !first || k < first ? 'off' : 'miss'} t={t} />;
    };
    body = [[0, 3], [3, 7]].map(([a, b]) => (
      <View key={a} style={{ paddingTop: 10, marginBottom: 14 }}>
        <Line w={W} t={t} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' }}>{days.slice(a, b).map((k, i) => item(k, a + i))}</View>
      </View>
    ));
  } else {
    from = new Date(now.getFullYear(), now.getMonth() - off, 1);
    const n = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate(), lead = (from.getDay() + 6) % 7;
    days = Array.from({ length: n }, (_, j) => dayKey(new Date(from.getFullYear(), from.getMonth(), j + 1).getTime()));
    title = from.toLocaleDateString('en-US', from.getFullYear() === now.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' });
    const cw = Math.floor(W / 7), pw = cw - 6;
    body = (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <Text key={i} style={[ui(10, 600), { width: cw, textAlign: 'center', color: t.inkMuted, marginBottom: 6 }]}>{x}</Text>)}
        {Array.from({ length: lead }, (_, i) => <View key={`l${i}`} style={{ width: cw }} />)}
        {days.map((k, j) => {
          const d = hub.album[k];
          return (
            <View key={k} style={{ width: cw, height: pw + 20, alignItems: 'center', justifyContent: 'center' }}>
              {d?.print ? <Polaroid day={d} w={pw} tilt={TILT[j % TILT.length]} label={String(j + 1)} onPress={() => setPicking(k)} onLongPress={() => setBig(shown.findIndex((p) => p.id === k))} t={t} />
                : <Blank w={pw} h={pw + 10} label={String(j + 1)} state={k === today ? 'today' : k > today ? 'later' : !first || k < first ? 'off' : 'miss'} t={t} />}
            </View>
          );
        })}
      </View>
    );
  }
  const shown = days.filter((k) => hub.album[k]?.print).map((k) => ({ id: k, uri: hub.album[k].print! }));
  const prints = shown.length, quests = days.filter((k) => hub.album[k]?.quest).length;
  const sum = view === 'Week' ? tr('today.weekSum', { bingo: s(prints, 'bingo'), quest: quests ? tr('today.questFound') : off ? tr('today.questMissed') : tr('today.questOpen') }) : tr('today.monthSum', { title, bingo: s(prints, 'bingo'), quest: s(quests, 'side quest') });
  const name = view === 'Week' ? 'week' : 'month';
  const share = useShare(card, name, `${view === 'Week' ? 'My week' : title} in photo bingo #picdumpbingo`);
  const canBack = !!first && first < days[0];
  const arrow = (dir: -1 | 1, on: boolean) => (
    <Tap onPress={() => setOff((x) => x - dir)} disabled={!on} accessibilityRole="button" accessibilityLabel={dir < 0 ? tr('today.prevName', { name }) : tr('today.nextName', { name })} style={{ padding: 6, opacity: on ? 1 : 0.3 }}>
      <Text style={[ui(16, 600), { color: t.ink }]}>{dir < 0 ? '‹' : '›'}</Text>
    </Tap>
  );

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Pill items={['Week', 'Month'] as const} on={view} onPick={(v) => { setView(v); setOff(0); }} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>{arrow(-1, canBack)}<Text style={[ui(12.5, 600), { color: t.ink, minWidth: 74, textAlign: 'center' }]}>{title}</Text>{arrow(1, off > 0)}</View>
      </View>
      <View>
      <View ref={card} collapsable={false}>
        <FrameCard radius={14} padding={12}>
          {body}
          <Text style={[ui(12, 600), { color: t.inkMuted, textAlign: 'center', marginTop: 2 }]}>{sum}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
            <ShareButtons name={name} ghost shareLabel={tr('today.shareName', { name })} />
          </View>
        </FrameCard>
      </View>
        {/* over the ghost, outside the capture: border + padding */}
        <View style={{ position: 'absolute', right: 13, bottom: Platform.OS === 'android' ? 14 : 13 }}><ShareButtons name={name} run={share.run} shareLabel={tr('today.shareName', { name })} /></View>
      </View>
      {share.said ? <Text style={[ui(11), { color: t.inkMuted, textAlign: 'center', marginTop: 8 }]}>{share.said}</Text> : null}
      <PhotoViewer photos={shown} index={big} onClose={() => setBig(null)} />
      <PrintSheet k={picking} print={picking ? hub.album[picking]?.print : undefined} onClose={() => setPicking(null)} />
    </>
  );
}

/** Today hub: Today (the bingo, one swap a day, and the week's side quest) and Album (the bingo prints by week and by month). */
export default function Today() {
  const { t } = useTheme();
  const hub = useHub(useApp().library);
  const [tab, setTab] = useState<'Bingo' | 'Album'>('Bingo');
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { text, anim, flip } = useSlotPop(hub, focused && tab === 'Bingo');

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ paddingTop: 2, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
          <IconButton label={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><Icons.back size={16} /></IconButton>
          <View style={{ flex: 1, alignItems: 'center' }}><Pill big items={['Bingo', 'Album'] as const} on={tab} onPick={setTab} /></View>
          <View style={{ width: 36 }} />
        </View>
        {!hub ? <ActivityIndicator color={t.ink} /> : tab === 'Bingo' ? <TodayTab hub={hub} flip={flip} /> : <AlbumTab hub={hub} />}
      </Screen>
      <PopToast text={text} anim={anim} t={t} />
    </View>
  );
}
