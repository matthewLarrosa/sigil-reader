import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/theme-provider';

export default function TabLayout() {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const bottomLift = Math.max(insets.bottom, 18);

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 64,
          marginBottom: bottomLift,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => <Ionicons size={22} name="library" color={color} />,
        }}
      />
      <Tabs.Screen
        name="audiobooks"
        options={{
          title: 'Audiobooks',
          tabBarIcon: ({ color }) => <Ionicons size={22} name="headset" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Ionicons size={22} name="settings" color={color} />,
        }}
      />
      <Tabs.Screen
        name="import"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
