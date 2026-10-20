import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { FaceCircle } from '../components/FaceCircle';
import { Screen } from '../components/ui/Screen';
import { FrameCard } from '../components/ui/FrameCard';
import { IconButton } from '../components/ui/TopHeader';
import { Icons } from '../components/ui/Icons';
import { Pill } from '../components/ui/Pill';
import { useTheme } from '../theme/ThemeProvider';
import { display, label, ui } from '../theme/type';
import { useApp } from '../state/AppState';
import { findSelfies, SELFIE_QUERY, SelfieCandidate } from '../services/selfie';
import { getProfile, setProfile } from '../services/profile';

/** Dev tools experiment: the best selfie found on-device (see findSelfies), a verdict, and the user's name. Logs everything to the console. */
export default function Selfie() {
  const { t } = useTheme();
  const { library } = useApp();
  const [found, setFound] = useState<SelfieCandidate[] | null>(null);
  const [i, setI] = useState(0);
  const [verdict, setVerdict] = useState<'up' | 'down' | null>(null);
  const [name, setName] = useState('');

  useEffect(() => { getProfile().then((p) => setName(p.name)); }, []);
  useEffect(() => {
    if (!library) return;
    const t0 = Date.now();
    findSelfies(library).then((c) => {
      console.log(`[selfie] "${SELFIE_QUERY}" ${c.length} candidates in ${Date.now() - t0} ms`);
      c.forEach((x, k) => console.log(`[selfie] #${k + 1} person ${x.person} (in ${x.seen}) face ${x.face.toFixed(3)} score ${x.score.toFixed(3)} clip ${x.clip.toFixed(3)} sharp ${x.sharp.toFixed(3)} ${x.p.uri}`));
      setFound(c);
    }, (e) => { console.warn('[selfie] failed:', e); setFound([]); });
  }, [library]);

  const best = found?.[i];
  const [notMe, setNotMe] = useState<number[]>([]);
  const vote = (v: 'up' | 'down') => {
    setVerdict(v);
    console.log(`[selfie] verdict ${v === 'up' ? "that's me" : 'not me'} on #${i + 1} person ${best?.person} ${best?.p.uri}`);
    if (v === 'down' && found && best) {
      // someone else: the next photo of a person not turned down yet
      const no = best.person >= 0 ? [...notMe, best.person] : notMe;
      setNotMe(no);
      const k = found.findIndex((x, j) => j > i && !(x.person >= 0 && no.includes(x.person)));
      setI(k >= 0 ? k : 0); setVerdict(null);
    }
  };
  const next = () => { setI((x) => (found && x + 1 < found.length ? x + 1 : 0)); setVerdict(null); };
  const saveName = () => {
    console.log(`[selfie] name ${name.trim() ? 'given' : 'empty'}`);
    setProfile({ name: name.trim() }).catch((e) => console.warn('[selfie] name save failed:', e));
  };

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <View style={{ paddingTop: 2, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}><Icons.back size={16} /></IconButton>
        <Text style={[display(20), { color: t.ink }]}>Selfie experiment</Text>
      </View>
      <FrameCard radius={20} padding={12}>
        {!found ? (
          <View style={{ height: 300, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ActivityIndicator color={t.ink} />
            <Text style={[ui(12), { color: t.inkMuted }]}>{library ? 'Looking through your photos…' : 'Waiting for your library…'}</Text>
          </View>
        ) : !best ? (
          <Text style={[ui(12.5), { color: t.inkMuted, paddingVertical: 24, textAlign: 'center' }]}>No selfie found. Search needs the on-device model and an indexed library.</Text>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <FaceCircle uri={best.p.uri} box={best.box} aspect={best.aspect} size={180} />
            <Text style={[display(19, 1.2), { color: t.ink, marginTop: 14, textAlign: 'center' }]}>We think this is you. Did we get it right?</Text>
            <Text style={[ui(12.5, 500), { color: t.inkMuted, marginTop: 4, textAlign: 'center' }]}>Found on your phone. It never left your device!</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pill label="That's me!" on={verdict === 'up'} onPress={() => vote('up')} height={36} size={13} style={{ paddingHorizontal: 18 }} />
              <Pill label="Not me :(" onPress={() => vote('down')} height={36} size={13} style={{ paddingHorizontal: 18 }} />
            </View>
            {found.length > 1 && <Pill label="Try another" onPress={next} variant="plain" height={30} size={11.5} style={{ marginTop: 6 }} />}
          </View>
        )}
      </FrameCard>
      <Text style={[label(10, 0.12), { color: t.inkMuted, marginTop: 14, marginBottom: 4, paddingHorizontal: 4 }]}>What&apos;s your name?</Text>
      <FrameCard radius={18} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
        <TextInput value={name} onChangeText={setName} onEndEditing={saveName} placeholder="Your name" placeholderTextColor={t.inkMuted}
          returnKeyType="done" style={[display(18), { color: t.ink, paddingVertical: 8 }]} />
      </FrameCard>
    </Screen>
  );
}
