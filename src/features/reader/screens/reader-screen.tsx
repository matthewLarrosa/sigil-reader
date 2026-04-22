import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/layout/screen';
import { bookRepository } from '@/features/library/sqlite-book-repository';
import { Chapter } from '@/features/library/types';
import {
  defaultReaderPreferences,
  getReaderPreferences,
  saveReaderPreferences,
} from '@/features/reader/services/reader-preferences';
import { ReaderPreferences } from '@/features/reader/types';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';
import { createId } from '@/utils/id';

export function ReaderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useAppTheme();
  const bookId = useMemo(() => {
    const value = params.bookId;
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value ?? '';
  }, [params.bookId]);
  const chapterId = useMemo(() => {
    const value = params.chapterId;
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value ?? '';
  }, [params.chapterId]);

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [preferences, setPreferences] = useState<ReaderPreferences>(defaultReaderPreferences);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<Chapter[]>([]);

  const load = useCallback(async () => {
    const [chapterRow, progressRow, prefRow] = await Promise.all([
      bookRepository.getChapter(bookId, chapterId),
      bookRepository.getReadingProgress(bookId),
      getReaderPreferences(),
    ]);
    setPreferences(prefRow);
    setChapter(chapterRow);
    if (progressRow && progressRow.chapter_id !== chapterId) {
      router.replace({
        pathname: '/reader/[bookId]/[chapterId]',
        params: { bookId, chapterId: progressRow.chapter_id },
      });
    }
  }, [bookId, chapterId, router]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const goToChapter = useCallback(
    async (direction: 'previous' | 'next') => {
      const adjacent = await bookRepository.getAdjacentChapter(bookId, chapterId, direction);
      if (adjacent) {
        router.replace({
          pathname: '/reader/[bookId]/[chapterId]',
          params: { bookId, chapterId: adjacent.id },
        });
      }
    },
    [bookId, chapterId, router],
  );

  const saveProgressFromScroll = useCallback(
    async (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const maxScroll = Math.max(contentSize.height - layoutMeasurement.height, 1);
      const ratio = Math.min(1, Math.max(0, contentOffset.y / maxScroll));
      await bookRepository.saveReadingProgress({
        book_id: bookId,
        chapter_id: chapterId,
        progress_ratio: ratio,
        scroll_offset: contentOffset.y,
        updated_at: Date.now(),
      });
    },
    [bookId, chapterId],
  );

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchHits([]);
      return;
    }
    const results = await bookRepository.searchBook(bookId, searchQuery.trim());
    setSearchHits(results);
  }, [bookId, searchQuery]);

  const addBookmark = useCallback(async () => {
    await bookRepository.addBookmark({
      id: createId('bookmark'),
      bookId,
      chapterId,
      label: chapter?.title ?? 'Bookmark',
      progressRatio: 0,
      createdAt: Date.now(),
    });
  }, [bookId, chapter?.title, chapterId]);

  const updateFontSize = useCallback(
    async (delta: number) => {
      const next = {
        ...preferences,
        fontSize: Math.min(30, Math.max(14, preferences.fontSize + delta)),
      };
      setPreferences(next);
      await saveReaderPreferences(next);
    },
    [preferences],
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {chapter?.title ?? 'Loading chapter...'}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => updateFontSize(-1)}
            style={[styles.chip, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text }}>A-</Text>
          </Pressable>
          <Pressable
            onPress={() => updateFontSize(1)}
            style={[styles.chip, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text }}>A+</Text>
          </Pressable>
          <Pressable
            onPress={addBookmark}
            style={[styles.chip, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text }}>Bookmark</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/player/[bookId]',
                params: { bookId },
              })
            }
            style={[styles.chip, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text }}>Listen</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          placeholder="Search this book"
          placeholderTextColor={theme.colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          style={[
            styles.searchInput,
            {
              color: theme.colors.text,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            },
          ]}
        />
        <Pressable
          onPress={handleSearch}
          style={[styles.searchButton, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={styles.searchButtonLabel}>Find</Text>
        </Pressable>
      </View>

      {searchHits.length > 0 ? (
        <View style={styles.searchResults}>
          {searchHits.slice(0, 3).map((result) => (
            <Pressable
              key={result.id}
              onPress={() =>
                router.replace({
                  pathname: '/reader/[bookId]/[chapterId]',
                  params: { bookId, chapterId: result.id },
                })
              }
            >
              <Text style={[styles.searchResultText, { color: theme.colors.primary }]}>
                {result.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView
        onMomentumScrollEnd={saveProgressFromScroll}
        onScrollEndDrag={saveProgressFromScroll}
        contentContainerStyle={styles.chapterContent}
      >
        <Text
          style={{
            color: theme.colors.text,
            fontSize: preferences.fontSize,
            lineHeight: preferences.fontSize * preferences.lineHeight,
            marginHorizontal: preferences.margin,
          }}
        >
          {chapter?.text_content ?? 'Preparing chapter content...'}
        </Text>
      </ScrollView>

      <View style={styles.footerControls}>
        <Pressable
          onPress={() => goToChapter('previous')}
          style={[styles.navButton, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.text }}>Previous</Text>
        </Pressable>
        <Pressable
          onPress={() => goToChapter('next')}
          style={[styles.navButton, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.text }}>Next</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: tokens.spacing.sm,
  },
  title: {
    fontSize: tokens.typography.heading,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  chapterContent: {
    paddingBottom: tokens.spacing.xxl,
  },
  footerControls: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    justifyContent: 'space-between',
  },
  navButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  searchButton: {
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  searchButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  searchResults: {
    gap: tokens.spacing.xs,
  },
  searchResultText: {
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
});
