import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { getLocalSetting, resetLocalSettings, upsertLocalSetting } from '@/config/local-settings';
import { libraryImportService } from '@/features/library/services/import-epub';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

const AUDIO_MODE_KEY = 'audio_generation_mode';
const SPEED_KEY = 'playback_speed';

type AudioMode = 'live' | 'charger_only' | 'aggressive_cache';

export function SettingsScreen() {
  const router = useRouter();
  const { theme, setThemeName } = useAppTheme();
  const [audioMode, setAudioMode] = useState<AudioMode>('charger_only');
  const [speed, setSpeed] = useState(1);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    Promise.all([getLocalSetting(AUDIO_MODE_KEY), getLocalSetting(SPEED_KEY)])
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
    await upsertLocalSetting(AUDIO_MODE_KEY, mode);
  };

  const applySpeed = async (nextSpeed: number) => {
    const clamped = Math.min(3, Math.max(0.75, nextSpeed));
    setSpeed(clamped);
    await upsertLocalSetting(SPEED_KEY, clamped.toFixed(2));
  };

  const handleResetLocalData = () => {
    Alert.alert(
      'Reset local data?',
      'This removes all imported books, progress, generated audio, and settings on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setIsResetting(true);
            Promise.all([libraryImportService.resetLocalData(), resetLocalSettings()]).finally(() =>
              setIsResetting(false),
            );
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Image source={require('../../../../assets/images/gem-background.png')} style={styles.titleGem} />
            <Text style={[styles.title, { color: theme.colors.text }]}>Settings</Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Reader and audiobook preferences
          </Text>
        </View>

        <View style={[styles.group, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.settingRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
              <Ionicons name="color-palette" size={18} color={theme.colors.text} />
            </View>
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.text }]}>Theme</Text>
              <Text style={[styles.settingCaption, { color: theme.colors.textMuted }]}>
                Choose your reading palette.
              </Text>
            </View>
          </View>
          <View style={styles.segmentedControl}>
            {(['light', 'sepia', 'dark'] as const).map((name) => {
              const isActive = theme.name === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => setThemeName(name)}
                  style={[
                    styles.segment,
                    { backgroundColor: isActive ? theme.colors.primary : 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: isActive ? '#10202A' : theme.colors.textMuted },
                    ]}
                  >
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.group, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.settingRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
              <Ionicons name="speedometer" size={18} color={theme.colors.text} />
            </View>
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.text }]}>Playback Speed</Text>
              <Text style={[styles.settingCaption, { color: theme.colors.textMuted }]}>
                Default speed for audiobook playback.
              </Text>
            </View>
            <View style={styles.stepper}>
              <Pressable onPress={() => applySpeed(speed - 0.25)} style={styles.iconButton}>
                <Ionicons name="remove" size={18} color={theme.colors.text} />
              </Pressable>
              <Text style={[styles.speedValue, { color: theme.colors.text }]}>{speed.toFixed(2)}x</Text>
              <Pressable onPress={() => applySpeed(speed + 0.25)} style={styles.iconButton}>
                <Ionicons name="add" size={18} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={[styles.group, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.settingRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
              <Ionicons name="battery-charging" size={18} color={theme.colors.text} />
            </View>
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.text }]}>Battery Mode</Text>
              <Text style={[styles.settingCaption, { color: theme.colors.textMuted }]}>
                Control how aggressively audio is prepared.
              </Text>
            </View>
          </View>
          <View style={styles.optionList}>
            {[
              ['live', 'Live generation', 'flash'],
              ['charger_only', 'On charger', 'battery-charging'],
              ['aggressive_cache', 'Aggressive cache', 'archive'],
            ].map(([mode, label, icon]) => {
              const isActive = audioMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => applyAudioMode(mode as AudioMode)}
                  style={styles.optionRow}
                >
                  <Ionicons
                    name={icon as keyof typeof Ionicons.glyphMap}
                    size={17}
                    color={isActive ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: isActive ? theme.colors.primary : theme.colors.text },
                    ]}
                  >
                    {label}
                  </Text>
                  {isActive ? (
                    <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.group, { backgroundColor: theme.colors.surface }]}>
          <Pressable onPress={() => router.push('/device-data')} style={styles.navRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
              <Ionicons name="folder-open" size={18} color={theme.colors.text} />
            </View>
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.text }]}>Device Data</Text>
              <Text style={[styles.settingCaption, { color: theme.colors.textMuted }]}>
                View local books, progress, and generated audio.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.colors.textMuted }]} />
          <Pressable disabled={isResetting} onPress={handleResetLocalData} style={styles.navRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
              <Ionicons name="trash" size={18} color={theme.colors.danger} />
            </View>
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.danger }]}>
                {isResetting ? 'Resetting...' : 'Reset Local Data'}
              </Text>
              <Text style={[styles.settingCaption, { color: theme.colors.textMuted }]}>
                Remove imported books and generated files.
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: tokens.spacing.md,
    paddingBottom: 120,
  },
  header: {
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  titleGem: {
    width: 24,
    height: 24,
    opacity: 0.55,
    resizeMode: 'contain',
    transform: [{ translateY: 2 }],
  },
  title: {
    fontSize: tokens.typography.title,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: tokens.typography.caption,
  },
  group: {
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: 52,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: {
    flex: 1,
    gap: 2,
  },
  settingTitle: {
    fontSize: tokens.typography.body,
    fontWeight: '700',
  },
  settingCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: tokens.radius.sm,
    backgroundColor: 'rgba(16, 32, 42, 0.06)',
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.spacing.xs,
  },
  segmentText: {
    fontSize: tokens.typography.caption,
    fontWeight: '700',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  iconButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedValue: {
    minWidth: 48,
    textAlign: 'center',
    fontSize: tokens.typography.caption,
    fontWeight: '800',
  },
  optionList: {
    gap: tokens.spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: 34,
  },
  optionLabel: {
    flex: 1,
    fontSize: tokens.typography.caption,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    opacity: 0.25,
  },
});
