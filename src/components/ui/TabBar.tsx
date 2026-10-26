import React from 'react';
import { Text, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { em, sans } from '../../theme/type';
import { CreateRays, FancyFrame, IconProps, WorkspaceEdit } from './Icons';
import { Tap } from './Tap';

// Create/Library glyphs draw smaller in the 24 box than Discover's, so they get a bigger size to match.
const TABS: Record<string, { label: string; Icon: (p: IconProps) => React.ReactElement; size: number }> = {
  index: { label: 'Discover', Icon: FancyFrame, size: 19 },
  create: { label: 'Create', Icon: CreateRays, size: 22 },
  library: { label: 'Library', Icon: WorkspaceEdit, size: 22 },
};

/** Mock bottom bar: bg-card, top hairline, 3 equal tabs; the active one is full ink, bold, on a faint ink pill; the rest muted. Fills the nav-bar inset too. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row', gap: 6, paddingTop: 6, paddingHorizontal: 12, paddingBottom: 4 + insets.bottom,
        backgroundColor: t.bgCard, borderTopWidth: 1, borderTopColor: t.borderStrong,
      }}
    >
      {state.routes.map((route, i) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const on = state.index === i;
        const color = on ? t.ink : t.inkMuted;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!on && !e.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Tap
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            style={[
              { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, alignItems: 'center', gap: 2 },
              // ink + 8-digit hex alpha (~9%): a tint that works in both themes
              on ? { backgroundColor: `${t.ink}17` } : null,
            ]}
          >
            <View style={{ height: 22, justifyContent: 'center' }}>
              <tab.Icon size={tab.size} color={color} />
            </View>
            <Text style={{ fontFamily: sans[on ? 700 : 600], fontSize: 10.5, lineHeight: 12, letterSpacing: em(10.5, -0.025), color }}>{tab.label}</Text>
          </Tap>
        );
      })}
    </View>
  );
}
