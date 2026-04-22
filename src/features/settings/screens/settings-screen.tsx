import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { getSetting, upsertSetting } from '@/db/client';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

const AUDIO_MODE_KEY = 'audio_generation_mode';
const SPEED_KEY = 'playback_speed';

type AudioMode = 'live' | 'charger_only' | 'aggressive_cache';

export function SettingsScreen() {
  const { theme, setThemeName } = useAppTheme();
  const [audioMode, setAudioMode] = useState<AudioMode>('charger_only');
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    Promise.all([getSetting(AUDIO_MODE_KEY), getSetting(SPEED_KEY)])
      .then(([mode, speedValue]) => {
        if (mode === 'live' || mode === 'charger_only' || mode === 'aggressive_cache') {
          setAudioMode(mode);
        }
        if (speedValue) {
          setSpeed(Number(speedValue));
        }
      })
      .catch(() => undefined);
  }, []);

  const applyAudioMode = async (mode: AudioMode) => {
    setAudioMode(mode);
    await upsertSetting(AUDIO_MODE_KEY, mode);
  };

  const applySpeed = async (nextSpeed: number) => {
    const clamped = Math.min(3, Math.max(0.75, nextSpeed));
    setSpeed(clamped);
    await upsertSetting(SPEED_KEY, clamped.toFixed(2));
  };

  return (
    <Screen>
      <Text style={[styles.title, { color: theme.colors.text }]}>Settings</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        Reader + audiobook defaults
      </Text>

      <View
        style={[
          styles.panel,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
        ]}
      >
        <Text style={[styles.panelHeading, { color: theme.colors.text }]}>Reader Theme</Text>
        <View style={styles.row}>
          {(['light', 'sepia', 'dark'] as const).map((name) => (
            <Pressable
              key={name}
              onPress={() => setThemeName(name)}
              style={[styles.choice, { borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.text }}>{name}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.panel,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
        ]}
      >
        <Text style={[styles.panelHeading, { color: theme.colors.text }]}>Playback Speed</Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => applySpeed(speed - 0.25)}
            style={[styles.choice, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text }}>-</Text>
          </Pressable>
          <Text style={{ color: theme.colors.text }}>{speed.toFixed(2)}x</Text>
          <Pressable
            onPress={() => applySpeed(speed + 0.25)}
            style={[styles.choice, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text }}>+</Text>
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.panel,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
        ]}
      >
        <Text style={[styles.panelHeading, { color: theme.colors.text }]}>Battery Mode</Text>
        <View style={styles.column}>
          <Pressable onPress={() => applyAudioMode('live')}>
            <Text
              style={{ color: audioMode === 'live' ? theme.colors.primary : theme.colors.text }}
            >
              Live generation
            </Text>
          </Pressable>
          <Pressable onPress={() => applyAudioMode('charger_only')}>
            <Text
              style={{
                color: audioMode === 'charger_only' ? theme.colors.primary : theme.colors.text,
              }}
            >
              Pre-generate on charger
            </Text>
          </Pressable>
          <Pressable onPress={() => applyAudioMode('aggressive_cache')}>
            <Text
              style={{
                color: audioMode === 'aggressive_cache' ? theme.colors.primary : theme.colors.text,
              }}
            >
              Aggressive cache
            </Text>
          </Pressable>
        </View>
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
  panel: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  panelHeading: {
    fontSize: tokens.typography.body,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  column: {
    gap: tokens.spacing.sm,
  },
  choice: {
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
});
