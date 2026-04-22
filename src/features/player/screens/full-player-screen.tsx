import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { playerService } from '@/features/player/services-track-player';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

export function FullPlayerScreen() {
  const params = useLocalSearchParams();
  const { theme } = useAppTheme();
  const bookId = useMemo(() => {
    const value = params.bookId;
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value ?? '';
  }, [params.bookId]);

  return (
    <Screen>
      <Text style={[styles.title, { color: theme.colors.text }]}>Player</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Book: {bookId}</Text>
      <View style={styles.controls}>
        <Pressable
          onPress={() => playerService.skipToPrevious()}
          style={[styles.button, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.text }}>Prev</Text>
        </Pressable>
        <Pressable
          onPress={() => playerService.pause()}
          style={[styles.button, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.text }}>Pause</Text>
        </Pressable>
        <Pressable
          onPress={() => playerService.resume()}
          style={[styles.button, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.text }}>Play</Text>
        </Pressable>
        <Pressable
          onPress={() => playerService.skipToNext()}
          style={[styles.button, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.text }}>Next</Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.panel,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
        ]}
      >
        <Text style={{ color: theme.colors.text }}>
          Stage 11 controls (speed, sleep timer, voice picker, battery mode) are scaffolded in
          settings and service interfaces and can be wired to generated chunk queues next.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: tokens.typography.title,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: tokens.typography.body,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  button: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  panel: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
});
