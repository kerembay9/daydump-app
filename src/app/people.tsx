import React, { useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusScrim } from '../components/ui/Screen';
import { FrameCard } from '../components/ui/FrameCard';
import { IconButton } from '../components/ui/TopHeader';
import { Icons } from '../components/ui/Icons';
import { FaceThumb } from '../components/FaceCircle';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { renamePerson, usePeople } from '../services/people';

/** Dev tools: everyone services/people.ts found, with their faces; name them here too. On-device. */
export default function People() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { list, shown, scanned } = usePeople();
  const [open, setOpen] = useState<string | null>(null);
  const [rev, setRev] = useState(0); // remounts the name fields, to undo a typed name the user didn't confirm

  const faces = list.reduce((n, p) => n + p.shots.length, 0);
  const header = (
    <>
      <View style={{ paddingTop: 2, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}><Icons.back size={16} /></IconButton>
        <Text style={[display(20), { color: t.ink }]}>People experiment</Text>
      </View>
      <FrameCard radius={18} padding={14}>
        <Text style={[ui(12.5, 500), { color: t.inkMuted }]}>
          {`${scanned} photos scanned · ${faces} faces · ${list.length} people (${shown.length} in 2+ photos). Found on your phone; it never leaves your device.`}
        </Text>
      </FrameCard>
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.shots[0].key}
        extraData={[open, rev]}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={5}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 16 }}
        renderItem={({ item: p }) => {
          const key = p.shots[0].key;
          return (
            <FrameCard radius={18} padding={12} style={{ marginTop: 10 }} onPress={() => setOpen(open === key ? null : key)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <FaceThumb uri={p.shots[0].uri} box={p.shots[0].f} size={56} />
                <View style={{ flex: 1 }}>
                  <TextInput key={rev} defaultValue={p.name} onEndEditing={(e) => renamePerson(p, e.nativeEvent.text.trim(), () => setRev((r) => r + 1))} placeholder="Who is this?"
                    placeholderTextColor={t.inkMuted} returnKeyType="done" style={[display(17), { color: t.ink, paddingVertical: 4 }]} />
                  <Text style={[ui(11.5, 500), { color: t.inkMuted }]}>{p.photos} photos</Text>
                </View>
              </View>
              {open === key && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {p.shots.slice(0, 24).map((x) => <FaceThumb key={x.key} uri={x.uri} box={x.f} size={44} />)}
                </View>
              )}
            </FrameCard>
          );
        }}
      />
      <StatusScrim />
    </View>
  );
}
