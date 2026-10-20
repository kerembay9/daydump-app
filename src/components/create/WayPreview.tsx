// Board 9 "Way preview": one way's photos big. Yours are tagged; suggested ones carry pick circles for "Add N picked".
import React from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import type { DumpPhoto } from '../../services/dumps';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { Icons } from '../ui/Icons';
import { Print } from '../ui/Print';
import { Sheet } from '../ui/Sheet';
import { Tap } from '../ui/Tap';
import type { Finishes } from './Finishes';

/** Yours and suggested taken in turn, then the rest: every photo shows, the counts read off the tiles (no "+N"). */
export function mix<P>(a: P[], b: P[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...a.slice(i, i + 1), ...b.slice(i, i + 1));
  return out;
}

type Peek = { j: number; ids: Set<string> } | null;

export function WayPreview({ f, x, ways, peek, setPeek }: {
  f: Finishes; x: DumpPhoto[]; ways: { y: DumpPhoto[]; i: number }[]; peek: Peek; setPeek: (p: Peek) => void;
}) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const w = peek ? ways[peek.j] : undefined;
  const close = () => setPeek(null);
  const cw = (win.width - 32 - 8) / 3, ch = Math.round(cw * 1.15);
  const n = peek?.ids.size ?? 0;
  const on = !!w && f.added(w.i);
  const go = (j: number) => setPeek({ j, ids: new Set() });
  const toggle = (id: string) => {
    if (!peek) return;
    const ids = new Set(peek.ids);
    if (!ids.delete(id)) ids.add(id);
    setPeek({ ...peek, ids });
  };
  const arrow = (j: number, back: boolean) => {
    const off = j < 0 || j >= ways.length;
    const I = back ? Icons.back : Icons.chevron;
    return (
      <Tap onPress={off ? undefined : () => go(j)} accessibilityRole="button" accessibilityLabel={back ? 'Previous way' : 'Next way'} accessibilityState={{ disabled: off }} hitSlop={6}
        style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.35 : 1 }}>
        <I size={14} color={t.ink} />
      </Tap>
    );
  };
  return (
    <Sheet visible={!!w} onClose={close}>
      {w && peek ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icons.sparkle size={13} color={t.ink} />
            <Text style={[ui(13, 700), { color: t.ink, flex: 1 }]}>Way {peek.j + 1} of {ways.length}</Text>
            {arrow(peek.j - 1, true)}
            {arrow(peek.j + 1, false)}
            <Tap onPress={close} hitSlop={8} accessibilityRole="button" style={{ marginLeft: 6 }}>
              <Text style={[ui(11), { color: t.inkMuted, textDecorationLine: 'underline' }]}>Close</Text>
            </Tap>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {mix(x, w.y).map((p) => {
              if (!w.y.includes(p)) {
                return (
                  <View key={p.id}>
                    <Print uri={p.uri} w={cw} h={ch} r={8} />
                    <View style={{ position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                      <Text style={[ui(8.5, 600), { color: '#fff' }]}>Yours</Text>
                    </View>
                  </View>
                );
              }
              const sel = peek.ids.has(p.id);
              return (
                <Tap key={p.id} onPress={() => toggle(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: sel }} accessibilityLabel="Pick this suggested photo">
                  <Print uri={p.uri} w={cw} h={ch} r={8} />
                  <View style={{ position: 'absolute', left: 4, bottom: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
                    <Icons.sparkle size={9} color={t.bgScreen} />
                  </View>
                  <View style={[{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
                    sel ? { backgroundColor: t.ink } : { backgroundColor: 'rgba(255,253,249,0.85)', borderWidth: 1, borderColor: 'rgba(74,52,40,0.3)' }]}>
                    {sel ? <Icons.check size={12} color={t.bgScreen} /> : null}
                  </View>
                </Tap>
              );
            })}
          </View>
          {/* ponytail: no full-screen viewer yet; a tap on a suggested photo picks it */}
          <Text style={[ui(10.5), { color: t.inkMuted }]}>Tap a suggested photo to pick it.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Tap onPress={n ? () => { f.addPicked(w.i, peek.ids); close(); } : undefined} accessibilityRole="button" accessibilityState={{ disabled: !n }}
              style={{ flex: 1, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center', opacity: n ? 1 : 0.4 }}>
              <Text style={[ui(12, 600), { color: t.ink }]}>Add {n} picked</Text>
            </Tap>
            <Tap onPress={on ? undefined : () => { f.use(w.i); close(); }} accessibilityRole="button" accessibilityState={{ disabled: on }}
              style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: on ? 0.5 : 1 }}>
              {on ? <Icons.check size={12} color={t.bgScreen} /> : null}
              <Text style={[ui(12, 600), { color: t.bgScreen }]}>{on ? 'Added' : `Use this (${x.length + w.y.length})`}</Text>
            </Tap>
          </View>
        </>
      ) : null}
    </Sheet>
  );
}
