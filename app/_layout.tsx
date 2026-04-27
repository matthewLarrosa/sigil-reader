import 'react-native-reanimated';

import { Stack } from 'expo-router';

import { AppProviders } from '@/components/app-providers';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="books/[bookId]" options={{ title: 'Book' }} />
        <Stack.Screen name="reader/[bookId]/[chapterId]" options={{ title: 'Reader' }} />
        <Stack.Screen name="reader-menu/[bookId]/[chapterId]" options={{ title: 'Reader Menu' }} />
        <Stack.Screen name="player/[bookId]" options={{ title: 'Audiobook' }} />
        <Stack.Screen name="device-data" options={{ title: 'Device Data' }} />
        <Stack.Screen name="kokoro-setup" options={{ title: 'Kokoro Setup' }} />
      </Stack>
    </AppProviders>
  );
}
