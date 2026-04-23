import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/screen';
import { bookRepository } from '@/features/library/json-book-repository';
import { Chapter } from '@/features/library/types';
import {
  defaultReaderPreferences,
  getReaderPreferences,
} from '@/features/reader/services/reader-preferences';
import { ReaderPreferences } from '@/features/reader/types';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';
import { createId } from '@/utils/id';

export function ReaderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
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
  const [progressRatio, setProgressRatio] = useState(0);
  const [bookmarkMessage, setBookmarkMessage] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const latestProgressRef = useRef({ ratio: 0, offset: 0, savedAt: 0 });
  const restoreOffsetRef = useRef(0);
  const didRestoreScrollRef = useRef(false);

  const load = useCallback(async () => {
    const [chapterRow, prefRow, progressRow] = await Promise.all([
      bookRepository.getChapter(bookId, chapterId),
      getReaderPreferences(),
      bookRepository.getReadingProgress(bookId),
    ]);
    setPreferences(prefRow);
    setChapter(chapterRow);
    if (progressRow?.chapter_id === chapterId) {
      setProgressRatio(progressRow.progress_ratio);
      restoreOffsetRef.current = progressRow.scroll_offset;
      didRestoreScrollRef.current = false;
      latestProgressRef.current = {
        ratio: progressRow.progress_ratio,
        offset: progressRow.scroll_offset,
        savedAt: Date.now(),
      };
    } else {
      setProgressRatio(0);
      restoreOffsetRef.current = 0;
      didRestoreScrollRef.current = true;
      latestProgressRef.current = { ratio: 0, offset: 0, savedAt: 0 };
    }
  }, [bookId, chapterId]);

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

  const persistProgress = useCallback(
    async (ratio: number, offset: number) => {
      await bookRepository.saveReadingProgress({
        book_id: bookId,
        chapter_id: chapterId,
        progress_ratio: ratio,
        scroll_offset: offset,
        updated_at: Date.now(),
      });
    },
    [bookId, chapterId],
  );

  const updateProgressFromScroll = useCallback(
    async (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!didRestoreScrollRef.current) {
        return;
      }
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const maxScroll = Math.max(contentSize.height - layoutMeasurement.height, 1);
      const ratio = Math.min(1, Math.max(0, contentOffset.y / maxScroll));
      setProgressRatio(ratio);
      latestProgressRef.current = {
        ratio,
        offset: contentOffset.y,
        savedAt: latestProgressRef.current.savedAt,
      };

      const now = Date.now();
      if (now - latestProgressRef.current.savedAt > 1000) {
        latestProgressRef.current.savedAt = now;
        await persistProgress(ratio, contentOffset.y);
      }
    },
    [persistProgress],
  );

  const restoreScrollPosition = useCallback(() => {
    if (didRestoreScrollRef.current) {
      return;
    }

    didRestoreScrollRef.current = true;
    if (restoreOffsetRef.current <= 0) {
      return;
    }

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: restoreOffsetRef.current,
        animated: false,
      });
    });
  }, []);

  const addBookmark = useCallback(async () => {
    const ratio = latestProgressRef.current.ratio;
    await bookRepository.addBookmark({
      id: createId('bookmark'),
      bookId,
      chapterId,
      label: chapter?.title ?? 'Bookmark',
      progressRatio: ratio,
      createdAt: Date.now(),
    });
    await persistProgress(ratio, latestProgressRef.current.offset);
    setBookmarkMessage('Bookmark saved');
    setTimeout(() => setBookmarkMessage(null), 1600);
  }, [bookId, chapter?.title, chapterId, persistProgress]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {chapter?.title ?? 'Loading chapter...'}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={addBookmark}
            style={[
              styles.chip,
              {
                borderColor: bookmarkMessage ? theme.colors.success : theme.colors.border,
                backgroundColor: bookmarkMessage ? theme.colors.highlight : 'transparent',
              },
            ]}
          >
            <Text style={{ color: bookmarkMessage ? theme.colors.success : theme.colors.text }}>
              {bookmarkMessage ?? 'Save'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/reader-menu/[bookId]/[chapterId]',
                params: { bookId, chapterId },
              })
            }
            style={[styles.chip, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text }}>Menu</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.progressText, { color: theme.colors.textMuted }]}>
        {Math.round(progressRatio * 100)}% through this chapter
      </Text>

      <ScrollView
        ref={scrollViewRef}
        onMomentumScrollEnd={updateProgressFromScroll}
        onScroll={updateProgressFromScroll}
        onScrollEndDrag={updateProgressFromScroll}
        onContentSizeChange={restoreScrollPosition}
        scrollEventThrottle={500}
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

      <View style={[styles.footerControls, { paddingBottom: Math.max(insets.bottom, tokens.spacing.md) }]}>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: tokens.typography.heading,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
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
    paddingTop: tokens.spacing.sm,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  progressText: {
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
});
