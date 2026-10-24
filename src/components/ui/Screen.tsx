import React from 'react';
import { ScrollView, ScrollViewProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';

/** Screen-coloured band behind the status bar, so scrolled content never runs under the clock. */
export function StatusScrim() {
  const { t } = useTheme();
  const top = useSafeAreaInsets().top;
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top, backgroundColor: t.bgScreen, opacity: 0.94 }} />;
}

/** Page scroll area: status-bar inset on top, 16px gutter, 16px bottom padding; the screen gradient shows through. */
export function Screen({ children, contentContainerStyle, ...rest }: ScrollViewProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        {...rest}
        contentContainerStyle={[{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 16 }, contentContainerStyle]}
      >
        {children}
      </ScrollView>
      <StatusScrim />
    </View>
  );
}
