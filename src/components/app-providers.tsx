import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { PropsWithChildren, useEffect } from 'react';

import { playerService } from '@/features/player/services-track-player';
import { AppThemeProvider, useAppTheme } from '@/theme/theme-provider';

function InternalProviders({ children }: PropsWithChildren) {
  const { theme } = useAppTheme();
  const isExpoGo =
    Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

  useEffect(() => {
    if (!isExpoGo) {
      playerService.setup().catch((error) => {
        console.warn('Audio player setup skipped', error);
      });
    }
  }, [isExpoGo]);

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
