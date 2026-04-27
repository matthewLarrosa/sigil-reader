import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import {
  deleteAllLocalData,
  deleteGeneratedAudioData,
  deleteSettingsData,
  getLocalDataSnapshot,
  LocalDataSnapshot,
} from '@/features/settings/services/local-data-inspector';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return '--';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

function prettyJson(raw: string | null): string {
  if (!raw) {
    return 'No saved data.';
  }

  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function LocalDataScreen() {
  const { theme } = useAppTheme();
  const [snapshot, setSnapshot] = useState<LocalDataSnapshot | null>(null);
  const [expandedFilePaths, setExpandedFilePaths] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const totalSize = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    return [...snapshot.files, ...snapshot.directories].reduce(
      (sum, item) => sum + (item.sizeBytes ?? 0),
      0,
    );
  }, [snapshot]);

  const load = useCallback(async () => {
    setSnapshot(await getLocalDataSnapshot());
  }, []);

  useEffect(() => {
    load().catch((error) =>
      setMessage(error instanceof Error ? error.message : 'Unable to read local data.'),
    );
  }, [load]);

  const runDelete = useCallback(
    (title: string, description: string, action: () => Promise<void>) => {
      Alert.alert(title, description, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setIsBusy(true);
            setMessage(null);
            action()
              .then(async () => {
                await load();
                setExpandedFilePaths(new Set());
                setMessage('Device data updated.');
              })
              .catch((error) =>
                setMessage(error instanceof Error ? error.message : 'Unable to delete local data.'),
              )
              .finally(() => setIsBusy(false));
          },
        },
      ]);
    },
    [load],
  );

  const toggleRawFile = useCallback((path: string) => {
    setExpandedFilePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Device Data</Text>
          <Text style={[styles.caption, { color: theme.colors.textMuted }]} numberOfLines={2}>
            {snapshot?.documentDirectory ?? 'App document directory unavailable.'}
          </Text>
          {message ? (
            <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
          ) : null}
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name="folder" size={18} color={theme.colors.primary} />
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {snapshot?.directories.length ?? 0}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.textMuted }]}>folders</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name="document-text" size={18} color={theme.colors.primary} />
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {snapshot?.files.length ?? 0}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.textMuted }]}>files</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name="server" size={18} color={theme.colors.primary} />
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {formatBytes(totalSize)}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.textMuted }]}>used</Text>
          </View>
        </View>

        <View style={[styles.group, { backgroundColor: theme.colors.surface }]}>
          <Pressable disabled={isBusy} onPress={load} style={styles.actionRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
              <Ionicons name="refresh" size={18} color={theme.colors.text} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                {isBusy ? 'Working...' : 'Refresh Snapshot'}
              </Text>
              <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                Re-read local storage usage.
              </Text>
            </View>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.colors.textMuted }]} />
          <Pressable
            disabled={isBusy}
            onPress={() =>
              runDelete(
                'Delete generated audio?',
                'This removes TTS jobs, chunk metadata, and generated audio files.',
                deleteGeneratedAudioData,
              )
            }
            style={styles.actionRow}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
              <Ionicons name="musical-notes" size={18} color={theme.colors.danger} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.danger }]}>Delete Audio</Text>
              <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                Clear generated audiobook files.
              </Text>
            </View>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.colors.textMuted }]} />
          <Pressable
            disabled={isBusy}
            onPress={() =>
              runDelete(
                'Delete settings?',
                'This resets local app settings without deleting imported books.',
                deleteSettingsData,
              )
            }
            style={styles.actionRow}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
              <Ionicons name="settings" size={18} color={theme.colors.danger} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.danger }]}>Delete Settings</Text>
              <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                Reset preferences only.
              </Text>
            </View>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.colors.textMuted }]} />
          <Pressable
            disabled={isBusy}
            onPress={() =>
              runDelete(
                'Delete all local data?',
                'This removes imported books, parsed chapters, progress, TTS data, audio files, and settings.',
                deleteAllLocalData,
              )
            }
            style={styles.actionRow}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
              <Ionicons name="trash" size={18} color={theme.colors.danger} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.danger }]}>Delete All</Text>
              <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                Remove all local app data.
              </Text>
            </View>
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Storage</Text>
        <View style={[styles.group, { backgroundColor: theme.colors.surface }]}>
          {snapshot?.directories.map((directory, index) => (
            <View key={directory.path}>
              {index > 0 ? (
                <View style={[styles.divider, { backgroundColor: theme.colors.textMuted }]} />
              ) : null}
              <View style={styles.dataRow}>
                <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
                  <Ionicons name="folder-open" size={18} color={theme.colors.text} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                    {directory.label}
                  </Text>
                  <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                    {directory.exists
                      ? `${directory.itemCount} items - ${formatBytes(directory.sizeBytes)}`
                      : 'Not saved'}
                  </Text>
                  <Text style={[styles.path, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {directory.path}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Files</Text>
        <View style={[styles.group, { backgroundColor: theme.colors.surface }]}>
          {snapshot?.files.map((file, index) => {
            const isExpanded = expandedFilePaths.has(file.path);
            return (
              <View key={file.path}>
                {index > 0 ? (
                  <View style={[styles.divider, { backgroundColor: theme.colors.textMuted }]} />
                ) : null}
                <Pressable onPress={() => toggleRawFile(file.path)} style={styles.dataRow}>
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.highlight }]}>
                    <Ionicons name="document-text" size={18} color={theme.colors.text} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{file.label}</Text>
                    <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                      {file.exists ? formatBytes(file.sizeBytes) : 'Not saved'}
                    </Text>
                    <Text style={[styles.path, { color: theme.colors.textMuted }]} numberOfLines={1}>
                      {file.path}
                    </Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
                {isExpanded ? (
                  <ScrollView
                    horizontal
                    style={[styles.rawBox, { backgroundColor: theme.colors.background }]}
                  >
                    <Text style={[styles.rawText, { color: theme.colors.text }]}>
                      {prettyJson(file.raw)}
                    </Text>
                  </ScrollView>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: tokens.spacing.md,
    paddingBottom: 120,
  },
  header: {
    gap: tokens.spacing.xs,
  },
  title: {
    fontSize: tokens.typography.title,
    fontWeight: '700',
  },
  caption: {
    fontSize: tokens.typography.caption,
  },
  message: {
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  summaryCard: {
    flex: 1,
    borderRadius: tokens.radius.md,
    gap: 2,
    padding: tokens.spacing.md,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  group: {
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: 52,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: 58,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: tokens.typography.body,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: tokens.typography.body,
    fontWeight: '800',
  },
  path: {
    fontSize: 11,
  },
  divider: {
    height: 1,
    opacity: 0.25,
  },
  rawBox: {
    borderRadius: tokens.radius.sm,
    maxHeight: 220,
    marginTop: tokens.spacing.sm,
    padding: tokens.spacing.sm,
  },
  rawText: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
});
