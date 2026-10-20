import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
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

/** Dev tools experiment: the best selfie found on-device, a verdict, and the user's name. Logs everything to the console. */
export default function Selfie() {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
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
      c.forEach((x, k) => console.log(`[selfie] #${k + 1} score ${x.score.toFixed(3)} clip ${x.clip.toFixed(3)} sharp ${x.sharp.toFixed(3)} ${x.p.width}x${x.p.height} ${x.p.uri}`));
      setFound(c);
    }, (e) => { console.warn('[selfie] failed:', e); setFound([]); });
  }, [library]);

  const best = found?.[i];
  const vote = (v: 'up' | 'down') => {
    setVerdict(v);
    console.log(`[selfie] verdict ${v === 'up' ? '👍' : '👎'} on #${i + 1} ${best?.p.uri}`);
  };
  const next = () => { setI((x) => (found && x + 1 < found.length ? x + 1 : 0)); setVerdict(null); };
  const saveName = () => {
    console.log(`[selfie] name ${name.trim() ? 'given' : 'empty'}`);
    setProfile({ name: name.trim() }).catch((e) => console.warn('[selfie] name save failed:', e));
  };
  const w = width - 32 - 24;

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <View style={{ paddingTop: 2, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}><Icons.back size={16} /></IconButton>
        <Text style={[display(20), { color: t.ink }]}>Selfie experiment</Text>
      </View>
      <FrameCard radius={20} padding={12}>
        {!found ? (
          <View style={{ height: w * 1.25, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ActivityIndicator color={t.ink} />
            <Text style={[ui(12), { color: t.inkMuted }]}>{library ? 'Looking through your photos…' : 'Waiting for your library…'}</Text>
          </View>
        ) : !best ? (
          <Text style={[ui(12.5), { color: t.inkMuted, paddingVertical: 24, textAlign: 'center' }]}>No selfie found. Search needs the on-device model and an indexed library.</Text>
        ) : (
          <>
            <Image source={{ uri: best.p.uri }} style={{ width: w, height: w * 1.25, borderRadius: 14 }} contentFit="cover" />
            <Text style={[display(17, 1.25), { color: t.ink, marginTop: 12 }]}>We found this on your phone — it never left your device.</Text>
            <Text style={[ui(12.5, 500), { color: t.inkMuted, marginTop: 4 }]}>How did we do?</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <Pill label="👍" on={verdict === 'up'} onPress={() => vote('up')} height={34} size={16} style={{ paddingHorizontal: 16 }} />
              <Pill label="👎" on={verdict === 'down'} onPress={() => vote('down')} height={34} size={16} style={{ paddingHorizontal: 16 }} />
              <View style={{ flex: 1 }} />
              {found.length > 1 && <Pill label={`Another (${i + 1}/${found.length})`} onPress={next} variant="outline" height={30} size={11} />}
            </View>
          </>
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
