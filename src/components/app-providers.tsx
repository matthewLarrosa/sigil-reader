import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { PropsWithChildren, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { AppThemeProvider, useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

function InternalProviders({ children }: PropsWithChildren) {
  const { theme } = useAppTheme();
  const [isLaunching, setIsLaunching] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setIsLaunching(false), 700);
    return () => clearTimeout(timeout);
  }, []);

  if (isLaunching) {
    return (
      <View style={[styles.launchScreen, { backgroundColor: theme.colors.background }]}>
        <Image source={require('../../assets/images/gem-background.png')} style={styles.launchLogo} />
        <Text style={[styles.launchTitle, { color: theme.colors.text }]}>Sigil</Text>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <NavigationThemeProvider value={theme.name === 'dark' ? DarkTheme : DefaultTheme}>
      {children}
      <StatusBar style={theme.name === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppThemeProvider>
      <InternalProviders>{children}</InternalProviders>
    </AppThemeProvider>
  );
}

const styles = StyleSheet.create({
  launchScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.lg,
  },
  launchLogo: {
    width: 132,
    height: 132,
    resizeMode: 'contain',
  },
  launchTitle: {
    fontSize: 34,
    fontWeight: '800',
  },
});
