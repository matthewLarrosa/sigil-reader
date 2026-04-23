import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { bookRepository } from '@/features/library/json-book-repository';
import { libraryImportService } from '@/features/library/services/import-epub';
import { Book } from '@/features/library/types';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

export function AudiobooksScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [audiobooks, setAudiobooks] = useState<Book[]>([]);
  const [libraryBooks, setLibraryBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const [audiobookRows, bookRows, audiobookEntries] = await Promise.all([
        bookRepository.listAudiobookBooks(),
        bookRepository.listBooks(),
        bookRepository.listAudiobookEntries(),
      ]);
      const audiobookIds = new Set(audiobookEntries.map((entry) => entry.book_id));
      setAudiobooks(audiobookRows);
      setLibraryBooks(bookRows.filter((book) => !audiobookIds.has(book.id)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load audiobooks.');
    } finally {
      setIsLoading(false);
      setIsImporting(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const importAudiobooks = useCallback(async () => {
    setIsImporting(true);
    setMessage(null);
    try {
      const importedIds = await libraryImportService.pickAndImportEpubs();
      await Promise.all(importedIds.map((bookId) => bookRepository.addAudiobook(bookId)));
      setMessage(
        importedIds.length === 1
          ? 'Added 1 imported EPUB to Audiobooks.'
          : `Added ${importedIds.length} imported EPUBs to Audiobooks.`,
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.');
      setIsImporting(false);
    }
  }, [load]);

  const addFromLibrary = useCallback(
    async (bookId: string) => {
      await bookRepository.addAudiobook(bookId);
      await load();
    },
    [load],
  );

  const removeAudiobook = useCallback(
    async (bookId: string) => {
      await bookRepository.removeAudiobook(bookId);
      await load();
    },
    [load],
  );

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={audiobooks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isImporting} onRefresh={importAudiobooks} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.heading, { color: theme.colors.text }]}>Audiobooks</Text>
            <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
              Choose EPUBs to prepare for listening.
            </Text>
            <Pressable
              disabled={isImporting}
              onPress={importAudiobooks}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: isImporting ? 0.6 : 1,
                },
              ]}
            >
              <Text style={styles.primaryButtonLabel}>
                {isImporting ? 'Importing...' : 'Import EPUB'}
              </Text>
            </Pressable>
            {message ? (
              <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
            ) : null}
            {audiobooks.length > 0 ? (
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>In Audiobooks</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              No audiobooks yet
            </Text>
            <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
              Import an EPUB or add one from your library below.
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={[styles.insetDivider, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Add from Library</Text>
            {libraryBooks.length === 0 ? (
              <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                Every library book is already in Audiobooks.
              </Text>
            ) : (
              libraryBooks.map((book) => (
                <View
                  key={book.id}
                  style={[
                    styles.bookCard,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  ]}
                >
                  <View style={styles.bookText}>
                    <Text style={[styles.bookTitle, { color: theme.colors.text }]} numberOfLines={2}>
                      {book.title ?? book.original_filename}
                    </Text>
                    <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                      {book.author ?? 'Unknown author'} · {book.parsing_status}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => addFromLibrary(book.id)}
                    style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                  >
                    <Text style={{ color: theme.colors.text }}>Add</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.bookCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Pressable
              style={styles.bookText}
              onPress={() =>
                router.push({
                  pathname: '/books/[bookId]',
                  params: { bookId: item.id },
                })
              }
            >
              <Text style={[styles.bookTitle, { color: theme.colors.text }]} numberOfLines={2}>
                {item.title ?? item.original_filename}
              </Text>
              <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                {item.author ?? 'Unknown author'} · {item.parsing_status}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => removeAudiobook(item.id)}
              style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.text }}>Remove</Text>
            </Pressable>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    </Screen>
  );
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
  header: {
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  heading: {
    fontSize: tokens.typography.heading,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: tokens.typography.body,
    fontWeight: '700',
  },
  caption: {
    fontSize: tokens.typography.caption,
  },
  message: {
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
  emptyState: {
    gap: tokens.spacing.xs,
  },
  footer: {
    gap: tokens.spacing.md,
  },
  insetDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: tokens.spacing.md,
    marginTop: tokens.spacing.sm,
  },
  bookCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
  },
  bookText: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  bookTitle: {
    fontSize: tokens.typography.bodyLarge,
    fontWeight: '700',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
});
