import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { tr } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { dot, faceVec } from '../../services/faces';
import { filterLabel, keepApart, mergePeople, removeFace, renamePerson, separatePerson, usePeople, type PeopleFilter, type Person } from '../../services/people';
import { FaceThumb } from '../FaceCircle';
import { Icons } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';
import { Tap } from '../ui/Tap';

const NO = '#B4412A';
const FACE = 28;
const IN_ROW = 12; // the rest are in the sheet
// a list over the Sheet's padding, so a swipe from the sheet's edge or bottom still scrolls it
const FULL_BLEED = { style: { marginHorizontal: -16, marginBottom: -16 }, contentContainerStyle: { paddingHorizontal: 16, paddingBottom: 16 } };

type State = 'with' | 'any' | 'without';
const stateOf = (f: PeopleFilter, id: number): State => (f.with.includes(id) ? 'with' : f.without.includes(id) ? 'without' : 'any');
const put = (f: PeopleFilter, id: number, s: State): PeopleFilter => ({
  ...f,
  with: s === 'with' ? [...f.with.filter((x) => x !== id), id] : f.with.filter((x) => x !== id),
  without: s === 'without' ? [...f.without.filter((x) => x !== id), id] : f.without.filter((x) => x !== id),
});
const nameOf = (p: Person) => p.name || tr('people.unnamed');

/** A face that sets the filter. Tap: with, then without, then neither. Hold: merge. */
function FilterFace({ p, filter, onChange, onMerge, size, label }: { p: Person; filter: PeopleFilter; onChange: (f: PeopleFilter) => void; onMerge: (p: Person) => void; size: number; label: string }) {
  const { t } = useTheme();
  const s = stateOf(filter, p.id);
  const badge = size > FACE ? 15 : 12;
  return (
    <Tap hitSlop={{ top: 8, bottom: 8 }} onPress={() => onChange(put(filter, p.id, s === 'any' ? 'with' : s === 'with' ? 'without' : 'any'))} onLongPress={() => onMerge(p)}
      accessibilityRole="button" accessibilityLabel={label} accessibilityHint={tr('people.faceHint')}
      style={{ padding: 1, borderRadius: size, borderWidth: 1.5, borderColor: s === 'with' ? t.ink : s === 'without' ? NO : 'transparent' }}>
      <View style={{ opacity: s === 'without' ? 0.45 : 1 }}><FaceThumb uri={p.shots[0].uri} box={p.shots[0].f} size={size} /></View>
      {s !== 'any' && (
        <View style={{ position: 'absolute', right: -3, bottom: -3, width: badge, height: badge, borderRadius: badge / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: s === 'with' ? t.ink : NO }}>
          {s === 'with' ? <Icons.check size={badge - 4} color={t.bgScreen} /> : <Icons.close size={badge - 4} color="#fff" />}
        </View>
      )}
    </Tap>
  );
}

/** One row of small faces, no names, scrolling away with the grid. All of them: the sheet, with a dot when it has a question. */
export function PeopleRow({ people, filter, onChange, onMore, onMerge }: { people: Person[]; filter: PeopleFilter; onChange: (f: PeopleFilter) => void; onMore: () => void; onMerge: (p: Person) => void }) {
  const { t } = useTheme();
  const { suggest } = usePeople();
  if (!people.length) return null;
  const top = people.slice(0, IN_ROW);
  // someone picked in the sheet, past the row's end: first, so the filter is always on show
  const row = [...people.slice(IN_ROW).filter((p) => stateOf(filter, p.id) !== 'any'), ...top];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
        {row.map((p) => <FilterFace key={p.id} p={p} filter={filter} onChange={onChange} onMerge={onMerge} size={FACE} label={tr(`people.state.${stateOf(filter, p.id)}`, { name: nameOf(p) })} />)}
      </ScrollView>
      <Tap hitSlop={8} onPress={onMore} accessibilityRole="button" accessibilityLabel={tr('people.all')}
        style={{ width: FACE + 3, height: FACE + 3, borderRadius: FACE, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Icons.more size={14} color={t.inkMuted} />
        {suggest && <View style={{ position: 'absolute', right: 0, top: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: NO }} />}
      </Tap>
    </View>
  );
}

function Choice({ text, on, color, onPress, label }: { text: string; on: boolean; color: string; onPress: () => void; label?: string }) {
  const { t } = useTheme();
  return (
    <Tap onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={label ?? text} accessibilityState={{ selected: on }}
      style={{ height: 26, paddingHorizontal: 9, borderRadius: 13, justifyContent: 'center', backgroundColor: on ? color : 'transparent' }}>
      <Text style={[ui(10.5, 600), { color: on ? t.bgScreen : t.inkMuted }]}>{text}</Text>
    </Tap>
  );
}

function Pill({ text, strong, onPress, label }: { text: string; strong?: boolean; onPress: () => void; label?: string }) {
  const { t } = useTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? text}
      style={{ flex: 1, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: strong ? t.ink : 'transparent', borderWidth: strong ? 0 : 1, borderColor: t.borderStrong }}>
      <Text style={[ui(12, 600), { color: strong ? t.bgScreen : t.ink }]}>{text}</Text>
    </Tap>
  );
}

function Merged({ onUndo }: { onUndo: () => void }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26 }}>
      <Text style={[ui(12), { color: t.inkMuted }]}>{tr('people.merged')}</Text>
      <Choice text={tr('tidy.undo')} on={false} color={t.ink} onPress={onUndo} />
    </View>
  );
}

/** Everyone else, the likeliest first: tap the one that's the same person as from, then Undo or Done. */
function MergePicker({ from, people, onDone }: { from: Person; people: Person[]; onDone: () => void }) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const others = useMemo(() => people.filter((p) => p.id !== from.id).sort((a, b) => dot(b.vec, from.vec) - dot(a.vec, from.vec)), [people, from]);
  if (undo) {
    return (
      <>
        <Merged onUndo={() => { undo(); onDone(); }} />
        <Pill text={tr('common.done')} strong onPress={onDone} />
      </>
    );
  }
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FaceThumb uri={from.shots[0].uri} box={from.shots[0].f} size={36} />
        <Text style={[display(20), { color: t.ink, flex: 1 }]}>{tr('people.sameAs')}</Text>
      </View>
      <FlatList
        data={others}
        keyExtractor={(p) => String(p.id)}
        initialNumToRender={8}
        contentContainerStyle={FULL_BLEED.contentContainerStyle}
        style={[FULL_BLEED.style, { maxHeight: win.height * 0.55 }]}
        ListEmptyComponent={<Text style={[ui(12), { color: t.inkMuted }]}>{tr('people.nobodyElse')}</Text>}
        renderItem={({ item: p }) => (
          <Tap onPress={() => setUndo(() => mergePeople(from, p))} accessibilityRole="button" accessibilityLabel={tr('people.mergeWithA11y', { name: nameOf(p), photos: tr('tidy.photoCount', { count: p.photos }) })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
            <FaceThumb uri={p.shots[0].uri} box={p.shots[0].f} size={36} />
            <Text style={[ui(13, 600), { color: p.name ? t.ink : t.inkMuted, flex: 1 }]}>{nameOf(p)}</Text>
            <Text style={[ui(10), { color: t.inkMuted }]}>{tr('tidy.photoCount', { count: p.photos })}</Text>
          </Tap>
        )}
      />
    </>
  );
}

/** MergePicker on its own, for holding a face. */
export function MergeSheet({ from, people, onClose }: { from: Person | null; people: Person[]; onClose: () => void }) {
  return <Sheet visible={!!from} onClose={onClose}>{from && <MergePicker from={from} people={people} onDone={onClose} />}</Sheet>;
}

/** "Same person?": the two likeliest, and what's next once answered. */
function SameCard({ pair, onMerged }: { pair: [Person, Person]; onMerged: (undo: () => void) => void }) {
  const { t } = useTheme();
  const [a, b] = pair;
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.borderStrong, padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FaceThumb uri={a.shots[0].uri} box={a.shots[0].f} size={44} />
        <FaceThumb uri={b.shots[0].uri} box={b.shots[0].f} size={44} />
        <View style={{ flex: 1, marginLeft: 2 }}>
          <Text style={[ui(13, 600), { color: t.ink }]}>{tr('people.samePerson')}</Text>
          <Text style={[ui(10), { color: t.inkMuted }]}>{tr('people.pairPhotos', { a: a.photos, b: b.photos })}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pill text={tr('people.notSame')} onPress={() => keepApart(a, b)} />
        <Pill text={tr('people.same')} strong onPress={() => onMerged(mergePeople(a, b))} />
      </View>
    </View>
  );
}

/** A person's faces, the least like the rest first, so a stray is on top: tap it, then "Not this person". */
function PersonFaces({ p, onMerge }: { p: Person; onMerge: () => void }) {
  const { t } = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const faces = useMemo(() => {
    const like = new Map(p.shots.map((x) => [x.key, dot(faceVec(x.f)!, p.vec)]));
    return [...p.shots].sort((a, b) => like.get(a.key)! - like.get(b.key)!).slice(0, 24);
  }, [p]);
  return (
    <View style={{ paddingBottom: 8, gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {faces.map((x, i) => (
          <Tap key={x.key} onPress={() => setPicked(picked === x.key ? null : x.key)} accessibilityRole="button" accessibilityLabel={tr('people.faceOf', { n: i + 1, name: nameOf(p) })} accessibilityState={{ selected: picked === x.key }}
            style={{ padding: 1, borderRadius: 20, borderWidth: 1.5, borderColor: picked === x.key ? NO : 'transparent' }}>
            <FaceThumb uri={x.uri} box={x.f} size={36} />
          </Tap>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {picked ? <Pill text={tr('people.notThisPerson')} strong onPress={() => { removeFace(picked); setPicked(null); }} /> : <Pill text={tr('people.mergeWith')} onPress={onMerge} />}
        {p.merged && !picked && <Pill text={tr('people.separate')} onPress={() => separatePerson(p)} />}
      </View>
      {!picked && <Text style={[ui(10), { color: t.inkMuted }]}>{tr('people.strayHint')}</Text>}
    </View>
  );
}

/** Everyone, with their names: tap a face to filter by them, name them, and Edit opens their faces. The line on top says how, then what's being searched; "Same person?" on top when there's a likely pair. */
export function PeopleSheet({ visible, people, filter, count, onChange, onClose }: { visible: boolean; people: Person[]; filter: PeopleFilter; count: number; onChange: (f: PeopleFilter) => void; onClose: () => void }) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const { suggest } = usePeople();
  const list = useRef<FlatList<Person>>(null);
  const [rev, setRev] = useState(0); // remounts the name fields, to undo a typed name that wasn't confirmed
  const [open, setOpen] = useState<number | null>(null);
  const [naming, setNaming] = useState<number | null>(null);
  const [merging, setMerging] = useState<Person | null>(null);
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const who = filterLabel(filter, people);
  const close = () => { setOpen(null); setNaming(null); setMerging(null); setUndo(null); onClose(); };
  return (
    <Sheet visible={visible} onClose={close}>
      {merging ? <MergePicker from={merging} people={people} onDone={() => { setMerging(null); setOpen(null); }} /> : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26 }}>
            <Text style={[display(20), { color: t.ink }]}>{tr('people.title')}</Text>
            {filter.with.length >= 2 && (
              <View style={{ flexDirection: 'row' }}>
                <Choice text={tr('people.together')} on={!filter.either} color={t.ink} onPress={() => onChange({ ...filter, either: false })} />
                <Choice text={tr('people.either')} on={filter.either} color={t.ink} onPress={() => onChange({ ...filter, either: true })} />
              </View>
            )}
          </View>
          {/* two lines' room, so the list doesn't move under the finger as this changes */}
          <Text style={[ui(12), { color: who ? t.ink : t.inkMuted, lineHeight: 16, minHeight: 32 }]}>
            {who ? tr('people.photosWho', { who, count }) : tr('people.howTo')}
          </Text>
          {undo && <Merged onUndo={() => { undo(); setUndo(null); }} />}
          {suggest && <SameCard pair={suggest} onMerged={(u) => setUndo(() => u)} />}
          <FlatList
            ref={list}
            data={people}
            keyExtractor={(p) => String(p.id)}
            extraData={[filter, open, naming]}
            onScrollToIndexFailed={() => {}}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={8}
            contentContainerStyle={FULL_BLEED.contentContainerStyle}
            style={[FULL_BLEED.style, { maxHeight: win.height * (suggest ? 0.42 : 0.55) }]}
            renderItem={({ item: p, index }) => {
              const s = stateOf(filter, p.id);
              return (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
                    <FilterFace p={p} filter={filter} onChange={onChange} onMerge={setMerging} size={36} label={tr(`people.search.${s}`, { name: nameOf(p) })} />
                    <View style={{ flex: 1 }}>
                      <TextInput key={rev} defaultValue={p.name} placeholder={tr('people.addName')} placeholderTextColor={t.inkMuted} returnKeyType="done"
                        onFocus={() => { setNaming(p.id); list.current?.scrollToIndex({ index, viewPosition: 0.5 }); }}
                        onEndEditing={(e) => { setNaming(null); renamePerson(p, e.nativeEvent.text.trim(), () => setRev((r) => r + 1)); }}
                        style={[ui(13, 600), { color: t.ink, padding: 0 }]} />
                      <Text style={[ui(10), { color: s === 'with' ? t.ink : s === 'without' ? NO : t.inkMuted }]}>{s === 'with' ? tr('people.included') : s === 'without' ? tr('people.excluded') : tr('tidy.photoCount', { count: p.photos })}</Text>
                    </View>
                    {naming === p.id ? (
                      <Tap onPress={Keyboard.dismiss} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('people.doneNaming')}
                        style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.ink }}>
                        <Icons.check size={18} color={t.bgScreen} />
                      </Tap>
                    ) : (
                      <Tap onPress={() => setOpen(open === p.id ? null : p.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('people.editName', { name: nameOf(p) })} accessibilityState={{ expanded: open === p.id }}
                        style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: t.borderStrong }}>
                        <Icons.edit size={12} color={open === p.id ? t.ink : t.inkMuted} />
                        <Text style={[ui(10.5, 600), { color: open === p.id ? t.ink : t.inkMuted }]}>{tr('common.edit')}</Text>
                      </Tap>
                    )}
                  </View>
                  {open === p.id && <PersonFaces p={p} onMerge={() => setMerging(p)} />}
                </View>
              );
            }}
          />
        </>
      )}
    </Sheet>
  );
}
