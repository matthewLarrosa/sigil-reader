import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/components/layout/screen';
import { libraryImportService } from '@/features/library/services/import-epub';
import { bookRepository } from '@/features/library/sqlite-book-repository';
import { Book, ReadingProgressRecord } from '@/features/library/types';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

export function LibraryScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();

  const [books, setBooks] = useState<Book[]>([]);
  const [continueReading, setContinueReading] = useState<ReadingProgressRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [bookRows, continueRows] = await Promise.all([
        bookRepository.listBooks(),
        bookRepository.listContinueReading(),
      ]);
      setBooks(bookRows);
      setContinueReading(continueRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load library.');
    } finally {
      setIsLoading(false);
      setIsImporting(false);
    }
  }, []);

  useEffect(() => {
    loadData().catch(() => undefined);
  }, [loadData]);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    setError(null);
    try {
      const importedBookId = await libraryImportService.pickAndImportEpub();
      await loadData();
      if (importedBookId) {
        router.push({
          pathname: '/books/[bookId]',
          params: { bookId: importedBookId },
        });
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.');
      setIsImporting(false);
    }
  }, [loadData, router]);

  const content = isLoading ? (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  ) : (
    <FlatList
      refreshControl={<RefreshControl refreshing={isImporting} onRefresh={handleImport} />}
      data={books}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.sectionContainer}>
          <Text style={[styles.heading, { color: theme.colors.text }]}>Your Library</Text>
          <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
            Import EPUB files and keep everything offline.
          </Text>
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
            <Text style={styles.importButtonLabel}>
              {isImporting ? 'Importing...' : 'Import EPUB'}
            </Text>
          </Pressable>
          {continueReading.length > 0 ? (
            <View
              style={[
                styles.panel,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.panelTitle, { color: theme.colors.text }]}>
                Continue Reading
              </Text>
              {continueReading.map((progress) => (
                <Pressable
                  key={progress.book_id}
                  style={styles.inlineRow}
                  onPress={() =>
                    router.push({
                      pathname: '/reader/[bookId]/[chapterId]',
                      params: { bookId: progress.book_id, chapterId: progress.chapter_id },
                    })
                  }
                >
                  <Text style={[styles.caption, { color: theme.colors.text }]}>
                    {progress.book_id}
                  </Text>
                  <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                    {Math.round(progress.progress_ratio * 100)}%
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {error ? (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={[styles.heading, { color: theme.colors.text }]}>No books yet</Text>
          <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
            Import your first EPUB to get started.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/books/[bookId]',
              params: { bookId: item.id },
            })
          }
          style={[
            styles.bookCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.bookTitle, { color: theme.colors.text }]}>
            {item.title ?? item.original_filename}
          </Text>
          <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
            {item.author ?? 'Unknown author'}
          </Text>
          <Text
            style={[
              styles.status,
              {
                color:
                  item.parsing_status === 'failed'
                    ? theme.colors.danger
                    : item.parsing_status === 'ready'
                      ? theme.colors.success
                      : theme.colors.textMuted,
              },
            ]}
          >
            {item.parsing_status.toUpperCase()}
          </Text>
        </Pressable>
      )}
      contentContainerStyle={styles.listContent}
    />
  );

  return <Screen>{content}</Screen>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    gap: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl,
  },
  sectionContainer: {
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  heading: {
    fontSize: tokens.typography.heading,
    fontWeight: '700',
  },
  caption: {
    fontSize: tokens.typography.caption,
  },
  importButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
  },
  importButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bookCard: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  bookTitle: {
    fontSize: tokens.typography.bodyLarge,
    fontWeight: '600',
  },
  status: {
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
  emptyState: {
    paddingTop: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  errorText: {
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
  panel: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  panelTitle: {
    fontSize: tokens.typography.body,
    fontWeight: '700',
  },
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
