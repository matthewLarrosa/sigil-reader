import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Screen } from '@/components/layout/screen';
import { bookRepository } from '@/features/library/json-book-repository';
import { libraryImportService } from '@/features/library/services/import-epub';
import { Book, ReadingProgressRecord } from '@/features/library/types';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

const coverFadeStops = Array.from({ length: 18 }, (_, index) => index);

export function LibraryScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const backgroundGemSize = 190;

  const [books, setBooks] = useState<Book[]>([]);
  const [continueReading, setContinueReading] = useState<
    (ReadingProgressRecord & { bookTitle: string; chapterTitle: string })[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [bookRows, continueRows] = await Promise.all([
        bookRepository.listBooks(),
        bookRepository.getContinueReadingItems(),
      ]);
      setBooks(bookRows);
      setContinueReading(continueRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load library.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData().catch(() => undefined);
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData().catch(() => undefined);
    }, [loadData]),
  );

  useEffect(() => {
    const hasActiveParsing = books.some(
      (book) => book.parsing_status === 'pending' || book.parsing_status === 'parsing',
    );
    if (!hasActiveParsing) {
      return;
    }

    const interval = setInterval(() => {
      loadData().catch(() => undefined);
    }, 2000);

    return () => clearInterval(interval);
  }, [books, loadData]);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    setError(null);
    try {
      await libraryImportService.pickAndImportEpubs();
      await loadData();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  }, [loadData]);

  const openBookMenu = useCallback(
    (book: Book) => {
      Alert.alert(book.title ?? book.original_filename ?? 'Book', undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Book',
          style: 'destructive',
          onPress: () => {
            libraryImportService
              .removeBook(book.id)
              .then(loadData)
              .catch((removeError) => {
                setError(removeError instanceof Error ? removeError.message : 'Delete failed.');
              });
          },
        },
      ]);
    },
    [loadData],
  );

  const filteredBooks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return books;
    }

    return books.filter((book) =>
      [book.title, book.author, book.original_filename]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery)),
    );
  }, [books, searchQuery]);

  const content = isLoading ? (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  ) : (
    <FlatList
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} />}
      data={filteredBooks}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.bookGridRow}
      ListHeaderComponent={
        <View style={styles.sectionContainer}>
          <View style={styles.titleRow}>
            <Image source={require('../../../../assets/images/gem-background.png')} style={styles.titleGem} />
            <Text style={[styles.heading, { color: theme.colors.text }]}>Library</Text>
          </View>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Ionicons name="search" color={theme.colors.textMuted} size={18} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search library"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="search"
              style={[styles.searchInput, { color: theme.colors.text }]}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" color={theme.colors.textMuted} size={18} />
              </Pressable>
            ) : null}
          </View>
          {continueReading.length > 0 ? (
            <>
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
                    <View style={styles.continueText}>
                      <Text
                        style={[
                          styles.caption,
                          styles.continueTitle,
                          { color: theme.colors.text },
                        ]}
                      >
                        {progress.bookTitle}
                      </Text>
                      <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                        {progress.chapterTitle}
                      </Text>
                    </View>
                    <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                      {Math.round(progress.progress_ratio * 100)}%
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={[styles.insetDivider, { backgroundColor: theme.colors.textMuted }]} />
            </>
          ) : null}
          {error ? (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Add some books</Text>
          <Text style={[styles.emptyCaption, { color: theme.colors.textMuted }]}>
            {books.length === 0 ? 'Add some books from EPUBs.' : 'No books match that search.'}
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
            styles.bookTile,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Pressable
            onPress={() => openBookMenu(item)}
            style={[
              styles.bookMenuButton,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
            hitSlop={8}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.text} />
          </Pressable>
          <View style={[styles.coverFrame, { backgroundColor: '#EEF2F5' }]}>
            {item.cover_path ? (
              <Image source={{ uri: item.cover_path }} style={styles.coverImage} />
            ) : (
              <Image
                source={require('../../../../assets/images/gem-background.png')}
                style={styles.fallbackCoverGem}
              />
            )}
            {item.cover_path ? (
              <View pointerEvents="none" style={styles.coverTextFade}>
                {coverFadeStops.map((stop) => (
                  <View
                    key={stop}
                    style={[
                      styles.coverFadeStop,
                      {
                        backgroundColor: `rgba(16, 32, 42, ${Math.pow(
                          (stop + 1) / coverFadeStops.length,
                          1.8,
                        ) * 0.72})`,
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
            <Text
              style={item.cover_path ? styles.coverTitle : styles.fallbackCoverTitle}
              numberOfLines={3}
            >
              {item.title ?? item.original_filename}
            </Text>
          </View>
        </Pressable>
      )}
      contentContainerStyle={styles.listContent}
    />
  );

  return (
    <Screen style={styles.screen}>
      <View
        pointerEvents="none"
        style={[
          styles.backgroundGem,
          {
            height: backgroundGemSize,
            left: (windowWidth - backgroundGemSize) / 2,
            top: (windowHeight - backgroundGemSize) / 2,
            width: backgroundGemSize,
          },
        ]}
      >
        <Image
          source={require('../../../../assets/images/gem-background.png')}
          style={styles.backgroundGemImage}
        />
      </View>
      {content}
      <Pressable
        disabled={isImporting}
        onPress={handleImport}
        style={[
          styles.importButton,
          {
            backgroundColor: theme.colors.primary,
            opacity: isImporting ? 0.65 : 1,
          },
        ]}
      >
        {isImporting ? (
          <ActivityIndicator color="#10202A" />
        ) : (
          <Text style={styles.importButtonLabel}>Import</Text>
        )}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'relative',
  },
  backgroundGem: {
    position: 'absolute',
  },
  backgroundGemImage: {
    width: '100%',
    height: '100%',
    opacity: 0.16,
    resizeMode: 'contain',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    gap: tokens.spacing.md,
    flexGrow: 1,
    paddingBottom: 116,
  },
  bookGridRow: {
    gap: tokens.spacing.md,
  },
  sectionContainer: {
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  heading: {
    fontSize: 23,
    fontWeight: '800',
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
  caption: {
    fontSize: tokens.typography.caption,
  },
  searchBar: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: tokens.spacing.sm,
  },
  bookTile: {
    flex: 1,
    maxWidth: '48%',
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  bookMenuButton: {
    position: 'absolute',
    top: tokens.spacing.xs,
    right: tokens.spacing.xs,
    zIndex: 2,
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFrame: {
    aspectRatio: 0.68,
    width: '100%',
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing.sm,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  fallbackCoverGem: {
    width: '68%',
    height: '68%',
    opacity: 0.5,
    resizeMode: 'contain',
  },
  coverTextFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '26%',
  },
  coverFadeStop: {
    flex: 1,
  },
  coverTitle: {
    position: 'absolute',
    left: tokens.spacing.sm,
    right: tokens.spacing.sm,
    bottom: tokens.spacing.sm,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  fallbackCoverTitle: {
    position: 'absolute',
    left: tokens.spacing.sm,
    right: tokens.spacing.sm,
    bottom: tokens.spacing.sm,
    color: '#10202A',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    minHeight: 330,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyCaption: {
    fontSize: 14,
    textAlign: 'center',
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
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  continueText: {
    flex: 1,
  },
  continueTitle: {
    fontWeight: '700',
  },
  insetDivider: {
    height: 1,
    marginHorizontal: tokens.spacing.md,
    marginTop: tokens.spacing.md,
    marginBottom: 0,
    opacity: 0.35,
  },
  importButton: {
    position: 'absolute',
    right: tokens.spacing.lg,
    bottom: tokens.spacing.md,
    minWidth: 96,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    shadowColor: '#10202A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: tokens.elevation.floating,
  },
  importButtonLabel: {
    color: '#10202A',
    fontSize: 13,
    fontWeight: '800',
  },
});
