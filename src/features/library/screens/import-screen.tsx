import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { libraryImportService } from '@/features/library/services/import-epub';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

export function ImportScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    setMessage(null);
    try {
      const importedIds = await libraryImportService.pickAndImportEpubs();
      setMessage(
        importedIds.length === 1
          ? 'Imported 1 EPUB. Parsing will continue in your library.'
          : `Imported ${importedIds.length} EPUBs. Parsing will continue in your library.`,
      );
      router.replace('/');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  }, [router]);

  return (
    <Screen>
      <View style={styles.content}>
        <Pressable
          disabled={isImporting}
          onPress={handleImport}
          style={[
            styles.importButton,
            {
              backgroundColor: theme.colors.primary,
              opacity: isImporting ? 0.6 : 1,
            },
          ]}
        >
          {isImporting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.importButtonLabel}>Import EPUB</Text>
          )}
        </Pressable>
        {message ? <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  importButton: {
    minWidth: 180,
    alignItems: 'center',
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.md,
  },
  importButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  message: {
    textAlign: 'center',
    fontSize: tokens.typography.caption,
  },
});
