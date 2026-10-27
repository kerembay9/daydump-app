// Posted Preview mock-ups (ph6.png): IG Post, IG Profile Grid, TikTok 9:16. The slides are the live Skia render.
import React, { useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Canvas, Group } from '@shopify/react-native-skia';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Tap } from '../ui/Tap';
import type { Images, Slide } from '../edit/SlidePager';
import { FilterState, lookFor, matrixFor } from '../../services/filters';
import { Fit, ratioOf } from '../../services/layouts';
import { SlideDrawing } from '../../services/slides';

/** What every mock-up draws from. */
export type PostView = {
  slides: Slide[];
  ratio: string;
  fit: Fit;
  filter: FilterState;
  images: Images;
  index: number;
  onIndex: (i: number) => void;
  /** profile handle, '' = not set ("your_account") */
  handle: string;
  name: string;
  /** profile photo uri, '' = initial letter */
  avatar: string;
  bio: string;
  place?: string;
  liked: boolean;
  onLike: () => void;
  saved: boolean;
  onSave: () => void;
  onAvatar: () => void;
};

const WHITE = '#FFFFFF';
const LIKES = 1284;
const shown = (h: string) => h || 'your_account';
const ring = { experimental_backgroundImage: `linear-gradient(45deg, ${fixed.igRing[0]}, ${fixed.igRing[1]})` };

/** One slide in a w x h frame, whole and letterboxed: no mock-up ever hides part of a slide. */
function SlideCanvas({ v, i, w, h }: { v: PostView; i: number; w: number; h: number }) {
  const r = ratioOf(v.ratio);
  const k = r.h / r.w;
  const sw = Math.min(w, h / k);
  const sh = sw * k;
  const s = v.slides[i];
  const photos = useMemo(() => s.photos.map((p) => ({ image: v.images[p.uri], matrix: matrixFor(lookFor(v.filter, p.id)), crop: p.crop })), [s, v.images, v.filter]);
  return (
    <Canvas style={{ width: w, height: h }}>
      <Group transform={[{ translateX: (w - sw) / 2 }, { translateY: (h - sh) / 2 }]}>
        <SlideDrawing layout={s.layout} fit={v.fit} width={sw} height={sh} photos={photos} />
      </Group>
    </Canvas>
  );
}

/** Sideways pager over the slides; tap = next slide. Follows index changes from arrows / dots. */
function Pager({ v, w, h }: { v: PostView; w: number; h: number }) {
  const list = useRef<FlatList<number>>(null);
  // Only a finger's settle names the page: Android also fires momentumScrollEnd for our own animated scrolls, and on
  // their cancel (the next fast tap) with a half-way offset, which bounced the index back and forth.
  const swiped = useRef(false);
  const n = v.slides.length;
  useEffect(() => { swiped.current = false; list.current?.scrollToOffset({ offset: v.index * w, animated: true }); }, [v.index, w]);
  return (
    <FlatList
      ref={list}
      data={v.slides.map((_, i) => i)}
      extraData={v}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={String}
      getItemLayout={(_, i) => ({ length: w, offset: w * i, index: i })}
      initialScrollIndex={Math.min(v.index, n - 1)}
      windowSize={3}
      initialNumToRender={2}
      onScrollEndDrag={() => { swiped.current = true; }}
      onMomentumScrollEnd={(e) => { if (swiped.current) v.onIndex(Math.round(e.nativeEvent.contentOffset.x / w)); }}
      style={{ width: w, height: h }}
      renderItem={({ item }) => (
        <Pressable onPress={() => v.onIndex((v.index + 1) % n)} accessibilityLabel={v.index === n - 1 ? 'First slide' : 'Next slide'}>
          <SlideCanvas v={v} i={item} w={w} h={h} />
        </Pressable>
      )}
    />
  );
}

/** Ringed avatar: the Profile photo, else the initial letter, else a person glyph. */
function Avatar({ v, size, ringed = true, border = 1 }: { v: PostView; size: number; ringed?: boolean; border?: number }) {
  const { t } = useTheme();
  const initial = (v.name.trim()[0] || v.handle[0] || '').toUpperCase();
  return (
    <Tap onPress={v.onAvatar} accessibilityRole="button" accessibilityLabel="Profile"
      style={[{ width: size, height: size, borderRadius: size / 2, padding: ringed ? 1.5 : 0 }, ringed ? ring : null]}>
      <View style={{ flex: 1, borderRadius: size, overflow: 'hidden', borderWidth: border, borderColor: WHITE, backgroundColor: t.accentFab, alignItems: 'center', justifyContent: 'center' }}>
        {v.avatar ? <Image source={{ uri: v.avatar }} style={{ width: '100%', height: '100%', borderRadius: size }} contentFit="cover" />
          : initial ? <Text style={[ui(size * 0.4, 600), { color: t.accentFabText }]}>{initial}</Text> : <Icons.user size={size * 0.5} color={t.accentFabText} />}
      </View>
    </Tap>
  );
}

const pill = { position: 'absolute', height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' } as const;
const arrow = { position: 'absolute', top: '50%', marginTop: -14, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' } as const;

/** IG feed post: author row (handle edited in place), carousel at the post's ratio (frame capped at 4:5; taller slides letterboxed, whole), actions. */
export function IgPost({ v, w, onHandle }: { v: PostView; w: number; onHandle: (h: string) => void }) {
  const { t } = useTheme();
  const input = useRef<TextInput>(null);
  const r = ratioOf(v.ratio);
  const h = Math.round(w * Math.min(r.h / r.w, 5 / 4));
  const n = v.slides.length;
  return (
    <FrameCard radius={22} style={{ overflow: 'hidden', marginBottom: 10 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar v={v} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TextInput
              ref={input}
              defaultValue={v.handle}
              placeholder="your_account"
              placeholderTextColor={t.ink}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              onEndEditing={(e) => onHandle(e.nativeEvent.text)}
              accessibilityLabel="Your handle"
              style={[ui(12.5, 700), { color: t.ink, padding: 0, minWidth: 40, maxWidth: 170, includeFontPadding: false }]}
            />
            <Tap onPress={() => input.current?.focus()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit handle"
              style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
              <Text style={[ui(9.5, 500), { color: t.inkMuted }]}>edit @</Text>
            </Tap>
          </View>
          {v.place ? <Text style={[ui(10.5), { color: t.inkMuted }]} numberOfLines={1}>{v.place}</Text> : null}
        </View>
        <Icons.more size={16} color={t.inkMuted} />
      </View>

      <View style={{ width: w, height: h, backgroundColor: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
        <Pager v={v} w={w} h={h} />
        <View pointerEvents="none" style={[pill, { top: 10, right: 10 }]}>
          <Text style={[ui(11, 600), { color: WHITE }]}>{v.index + 1}/{n}</Text>
        </View>
        {n > 1 ? (
          <>
            {/* like IG: no Previous on the first slide, no Next on the last */}
            {v.index > 0 ? (
              <Tap onPress={() => v.onIndex(v.index - 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Previous slide" style={[arrow, { left: 8 }]}>
                <Icons.back size={14} color={WHITE} />
              </Tap>
            ) : null}
            {v.index < n - 1 ? (
              <Tap onPress={() => v.onIndex(v.index + 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Next slide" style={[arrow, { right: 8 }]}>
                <Icons.chevron size={14} color={WHITE} />
              </Tap>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Tap onPress={v.onLike} hitSlop={6} accessibilityRole="button" accessibilityLabel={v.liked ? 'Unlike' : 'Like'}>
              <Icons.heart size={21} color={v.liked ? fixed.like : t.ink} fill={v.liked ? fixed.like : undefined} />
            </Tap>
            <Tap onPress={() => v.onIndex((v.index + 1) % n)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Comments"><Icons.comment size={20} /></Tap>
            <Icons.send size={19} />
          </View>
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
            {n > 1 ? v.slides.map((_, i) => (
              <Pressable key={i} onPress={() => v.onIndex(i)} hitSlop={3} accessibilityLabel={`Slide ${i + 1}`}
                style={{ width: i === v.index ? 7 : 5, height: i === v.index ? 7 : 5, borderRadius: 4, backgroundColor: i === v.index ? fixed.igBlue : t.ink, opacity: i === v.index ? 1 : 0.25 }} />
            )) : null}
          </View>
          <Tap onPress={v.onSave} hitSlop={6} accessibilityRole="button" accessibilityLabel={v.saved ? 'Unsave' : 'Save'}>
            <Icons.bookmark size={20} color={v.saved ? t.accentFab : t.ink} fill={v.saved ? t.accentFab : undefined} />
          </Tap>
        </View>
        <Text style={[ui(12, 600), { color: t.ink, marginTop: 6 }]}>Liked by {(LIKES + (v.liked ? 1 : 0)).toLocaleString('en-US')} others</Text>
        <Text style={[ui(11), { color: t.inkMuted, marginTop: 4 }]}>View all 38 comments</Text>
      </View>
    </FrameCard>
  );
}

/**
 * IG profile grid: this dump's cover first (NEW), then the covers of your Posted dumps, then of your top Discover dumps.
 * No follower counts: there is no account yet.
 */
export function IgGrid({ v, w, others }: { v: PostView; w: number; others: string[] }) {
  const { t } = useTheme();
  const tile = Math.floor((w - 2 - 24 - 6) / 3); // 1px borders, 12 padding, 3px gaps
  return (
    <FrameCard radius={22} padding={12} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10 }}>
        <Avatar v={v} size={52} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[ui(12, 700), { color: t.ink }]} numberOfLines={1}>
            {v.name.trim() ? <>{v.name.trim()} <Text style={[ui(12), { color: t.inkMuted }]}>@{shown(v.handle)}</Text></> : `@${shown(v.handle)}`}
          </Text>
          {v.bio ? <Text style={[ui(11), { color: t.inkMuted, marginTop: 2 }]} numberOfLines={2}>{v.bio}</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, borderRadius: 12, overflow: 'hidden' }}>
        <View style={{ width: tile, height: tile, backgroundColor: t.borderSubtle }}>
          <SlideCanvas v={v} i={0} w={tile} h={tile} />
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: t.ink }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: '#261F1B' }}>
            <Text style={[ui(9, 700), { color: fixed.printBorder }]}>NEW</Text>
          </View>
        </View>
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={{ width: tile, height: tile, backgroundColor: t.borderSubtle }}>
            {others[i] ? <Image source={{ uri: others[i] }} style={{ flex: 1 }} contentFit="cover" recyclingKey={others[i]} transition={120} /> : null}
          </View>
        ))}
      </View>
    </FrameCard>
  );
}

const shadowText = { textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } } as const;

function RailItem({ icon, label, onPress, name }: { icon: React.ReactNode; label: string; onPress?: () => void; name: string }) {
  return (
    <Tap onPress={onPress} disabled={!onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={name} style={{ alignItems: 'center', gap: 2 }}>
      {/* white icons on a light (cream matte) slide need the same shadow as the labels */}
      <View style={{ filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.6))' }}>{icon}</View>
      <Text style={[ui(10.5, 600), { color: WHITE }, shadowText]}>{label}</Text>
    </Tap>
  );
}

/** TikTok photo mode, 9:16: the slide letterboxed on black like TikTok shows other ratios, right rail, sound, progress. */
export function TikTok({ v, w, h }: { v: PostView; w: number; h: number }) {
  const n = v.slides.length;
  return (
    <View style={{ width: w, height: h, alignSelf: 'center', borderRadius: 22, overflow: 'hidden', backgroundColor: fixed.tiktokBg, marginBottom: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)' }}>
      <Pager v={v} w={w} h={h} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
        <Text style={[ui(12.5, 600), { color: WHITE, opacity: 0.7 }, shadowText]}>Following</Text>
        <Text style={[ui(12.5, 600), { color: WHITE, borderBottomWidth: 2, borderColor: WHITE, paddingBottom: 2 }, shadowText]}>For You</Text>
      </View>
      <View style={{ position: 'absolute', right: 10, bottom: 92, alignItems: 'center', gap: 14 }}>
        <Avatar v={v} size={36} ringed={false} border={2} />
        <RailItem name={v.liked ? 'Unlike' : 'Like'} onPress={v.onLike} label={(LIKES + (v.liked ? 1 : 0)).toLocaleString('en-US')}
          icon={<Icons.heart size={24} color={v.liked ? fixed.like : WHITE} fill={v.liked ? fixed.like : undefined} />} />
        <RailItem name="Comments" label="64" icon={<Icons.comment size={24} color={WHITE} />} />
        <RailItem name={v.saved ? 'Unsave' : 'Save'} onPress={v.onSave} label={v.saved ? '193' : '192'}
          icon={<Icons.bookmark size={24} color={WHITE} fill={v.saved ? WHITE : undefined} />} />
        <RailItem name="Share" label="28" icon={<Icons.send size={20} color={WHITE} />} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingRight: 56, experimental_backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.38) 65%, rgba(0,0,0,0) 100%)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[ui(13.5, 700), { color: WHITE }]}>@{shown(v.handle)}</Text>
          <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <Text style={[ui(10), { color: WHITE }]}>Photo Mode · {v.index + 1}/{n}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Icons.music size={14} color="rgba(255,255,255,0.8)" />
          <Text style={[ui(11), { color: 'rgba(255,255,255,0.8)' }]}>original sound · {shown(v.handle)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
          {v.slides.map((_, i) => (
            <Pressable key={i} onPress={() => v.onIndex(i)} hitSlop={{ top: 8, bottom: 8 }} accessibilityLabel={`Slide ${i + 1}`}
              style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i === v.index ? WHITE : 'rgba(255,255,255,0.35)' }} />
          ))}
        </View>
      </View>
    </View>
  );
}
