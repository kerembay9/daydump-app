import React from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/ui/TabBar';

/** Discover · Create · Library with the mock's bottom bar. Back from Create/Library returns to Discover. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      backBehavior="firstRoute"
      // hidden tabs don't re-render: indexing's library / progress updates wait until a tab is shown again, and switching
      // away no longer re-renders the screen being left
      screenOptions={{ headerShown: false, freezeOnBlur: true, sceneStyle: { backgroundColor: 'transparent' } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="library" />
    </Tabs>
  );
}
