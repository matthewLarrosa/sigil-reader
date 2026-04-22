import { Pressable, StyleSheet, Text } from 'react-native';

import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

interface MiniPlayerProps {
  title: string;
  onPressPlayPause: () => void;
  onOpenPlayer: () => void;
}

export function MiniPlayer({ title, onPressPlayPause, onOpenPlayer }: MiniPlayerProps) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      onPress={onOpenPlayer}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Pressable
        onPress={onPressPlayPause}
        style={[styles.playButton, { backgroundColor: theme.colors.primary }]}
      >
        <Text style={styles.playButtonLabel}>Play/Pause</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    marginRight: tokens.spacing.sm,
    fontWeight: '600',
  },
  playButton: {
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  playButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
