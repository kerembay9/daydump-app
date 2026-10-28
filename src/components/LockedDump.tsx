import React from 'react';
import { Text, View } from 'react-native';
import type { Story } from '../services/stories';
import { usePro } from '../state/Pro';
import { useTheme } from '../theme/ThemeProvider';
import { ui } from '../theme/type';
import { Icons } from './ui/Icons';
import { Stub } from './ui/Stub';
import { Tap } from './ui/Tap';

/**
 * How hard a locked dump's photos blur: the scene's colours show, which photos were picked doesn't. 25 is expo-image's
 * cap on Android (it clamps anything higher, after a 4x downsample), the platform this ships on.
 */
export const LOCKED_BLUR = 25;

/** Lock in a locked dump's top-right corner. Place inside a positioned card. */
export function LockBadge() {
  const { t } = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Icons.lock size={12} color={t.bgScreen} />
    </View>
  );
}

/** Preview / Edit of a locked story (a deep link, or Back after Pro lapsed): no picks, just the way in. */
export function LockedStub({ story }: { story: Story }) {
  const { t } = useTheme();
  const { askUnlock } = usePro();
  return (
    <Stub back title={story.title} note={`${story.subtitle}. This dump is locked.`}>
      <Tap onPress={() => askUnlock(story)} accessibilityRole="button" style={{ height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[ui(13, 600), { color: t.bgScreen }]}>Unlock</Text>
      </Tap>
    </Stub>
  );
}
