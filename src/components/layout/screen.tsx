import { PropsWithChildren } from 'react';
import { SafeAreaView, StyleSheet, View, ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

interface ScreenProps extends PropsWithChildren {
  style?: ViewStyle;
}

export function Screen({ children, style }: ScreenProps) {
  const { theme } = useAppTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
});
