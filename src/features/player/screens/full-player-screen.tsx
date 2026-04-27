import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/components/layout/screen';
import { bookRepository } from '@/features/library/json-book-repository';
import { Book, Chapter, ReadingProgressRecord } from '@/features/library/types';
import { playerService } from '@/features/player/services-track-player';
import { audiobookGenerationService } from '@/features/tts/services/audiobook-generation-service';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

function formatProgressLabel(progressRatio: number): string {
  return `${Math.round(progressRatio * 100)}%`;
}

export function FullPlayerScreen() {
  const params = useLocalSearchParams();
  const { theme } = useAppTheme();
  const bookId = useMemo(() => {
    const value = params.bookId;
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value ?? '';
  }, [params.bookId]);

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progress, setProgress] = useState<ReadingProgressRecord | null>(null);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [sliderWidth, setSliderWidth] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePlaybackChapterId, setActivePlaybackChapterId] = useState<string | null>(null);
  const screenStyle = useMemo(
    () => ({ ...styles.screen, backgroundColor: theme.colors.background }),
    [theme.colors.background],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [bookRow, chapterRows, progressRow] = await Promise.all([
        bookRepository.getBookById(bookId),
        audiobookGenerationService.listChapters(bookId),
        bookRepository.getReadingProgress(bookId),
      ]);

      setBook(bookRow);
      setChapters(chapterRows);
      setProgress(progressRow);

      const progressIndex = progressRow
        ? chapterRows.findIndex((chapter) => chapter.id === progressRow.chapter_id)
        : 0;
      setSelectedChapterIndex(progressIndex >= 0 ? progressIndex : 0);
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const selectedChapter = chapters[selectedChapterIndex] ?? null;
  const readingRatio = progress?.progress_ratio ?? 0;
  const readingPercent = Math.round(readingRatio * 100);
  const canGoPrevious = selectedChapterIndex > 0;
  const canGoNext = selectedChapterIndex < chapters.length - 1;
  const isCurrentChapterPlaying =
    Boolean(selectedChapter) &&
    selectedChapter?.id === activePlaybackChapterId &&
    isPlaying;

  const handleSliderLayout = useCallback((event: LayoutChangeEvent) => {
    setSliderWidth(event.nativeEvent.layout.width);
  }, []);

  const saveProgressRatio = useCallback(
    async (nextRatio: number) => {
      if (!selectedChapter) {
        return;
      }

      const normalizedRatio = Math.max(0, Math.min(1, nextRatio));
      const scrollOffset = Math.round(normalizedRatio * 1000);
      const updatedProgress: ReadingProgressRecord = {
        book_id: bookId,
        chapter_id: selectedChapter.id,
        progress_ratio: normalizedRatio,
        scroll_offset: scrollOffset,
        updated_at: Date.now(),
      };

      await bookRepository.saveReadingProgress(updatedProgress);
      setProgress(updatedProgress);
    },
    [bookId, selectedChapter],
  );

  const handleSliderPress = useCallback(
    async (pressX: number) => {
      if (sliderWidth <= 0) {
        return;
      }

      await saveProgressRatio(pressX / sliderWidth);
    },
    [saveProgressRatio, sliderWidth],
  );

  const togglePlayback = useCallback(async () => {
    if (!selectedChapter) {
      setStatusMessage('This audiobook has no selected chapter.');
      return;
    }

    try {
      if (activePlaybackChapterId === selectedChapter.id) {
        if (isPlaying) {
          await playerService.pause();
          setIsPlaying(false);
          setStatusMessage(`Paused ${selectedChapter.title}.`);
          return;
        }

        await playerService.resume();
        setIsPlaying(true);
        setStatusMessage(`Playing ${selectedChapter.title}.`);
        return;
      }

      const result = await audiobookGenerationService.playChapter(bookId, selectedChapter.id);
      setActivePlaybackChapterId(selectedChapter.id);
      setIsPlaying(true);
      setStatusMessage(result.statusMessage);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to start playback.');
      setIsPlaying(false);
    }
  }, [activePlaybackChapterId, bookId, isPlaying, selectedChapter]);

  if (isLoading) {
    return (
      <Screen style={screenStyle}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={screenStyle}>
      <View style={styles.container}>
        {book?.cover_path ? (
          <>
            <Image
              source={{ uri: book.cover_path }}
              style={styles.backgroundArt}
              contentFit="cover"
              blurRadius={28}
            />
            <View
              style={[
                styles.backgroundOverlay,
                {
                  backgroundColor:
                    theme.name === 'dark' ? 'rgba(17,22,27,0.96)' : 'rgba(243,233,216,0.98)',
                },
              ]}
            />
          </>
        ) : null}

        <View style={styles.heroBlock}>
          {book?.cover_path ? (
            <Image source={{ uri: book.cover_path }} style={styles.cover} contentFit="cover" />
          ) : (
            <View
              style={[
                styles.coverFallback,
                { backgroundColor: theme.colors.highlight, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.coverFallbackText, { color: theme.colors.text }]}>
                {(book?.title ?? book?.original_filename ?? 'Book').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}

          <Text style={[styles.bookTitle, { color: theme.colors.text }]} numberOfLines={2}>
            {book?.title ?? 'Audiobook'}
          </Text>
          <Text style={[styles.bookAuthor, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {book?.author ?? 'Unknown author'}
          </Text>
        </View>

        <View style={styles.chapterRow}>
          <Ionicons name="list" size={18} color={theme.colors.text} />
          <Text style={[styles.chapterLabel, { color: theme.colors.text }]} numberOfLines={2}>
            {selectedChapter?.title ?? 'No chapter selected'}
          </Text>
        </View>

        <Pressable
          onLayout={handleSliderLayout}
          onPress={(event) => handleSliderPress(event.nativeEvent.locationX)}
          style={[
            styles.sliderTrack,
            { backgroundColor: theme.colors.border },
          ]}
        >
          <View
            style={[
              styles.sliderProgress,
              { backgroundColor: theme.colors.primary, width: `${readingPercent}%` },
            ]}
          />
          <View
            style={[
              styles.sliderThumb,
              {
                backgroundColor: theme.colors.text,
                left: `${readingRatio * 100}%`,
              },
            ]}
          />
        </Pressable>

        <View style={styles.sliderMetaRow}>
          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>00:00</Text>
          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
            Position {formatProgressLabel(readingRatio)}
          </Text>
          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>--:--</Text>
        </View>

        <View style={styles.transportRow}>
          <Pressable
            disabled={!canGoPrevious}
            onPress={() => setSelectedChapterIndex((index) => Math.max(0, index - 1))}
            style={[styles.transportIconButton, { opacity: canGoPrevious ? 1 : 0.35 }]}
          >
            <Ionicons name="play-skip-back" size={24} color={theme.colors.text} />
          </Pressable>

          <Pressable
            onPress={() => saveProgressRatio(Math.max(0, readingRatio - 0.1))}
            style={styles.smallCircleButton}
          >
            <Ionicons name="play-back" size={18} color={theme.colors.text} />
            <Text style={[styles.smallCircleText, { color: theme.colors.text }]}>10</Text>
          </Pressable>

          <Pressable
            onPress={() => togglePlayback()}
            style={[styles.playCircle, { backgroundColor: theme.colors.text }]}
          >
            <Ionicons
              name={isCurrentChapterPlaying ? 'pause' : 'play'}
              size={30}
              color={theme.colors.background}
            />
          </Pressable>

          <Pressable
            onPress={() => saveProgressRatio(Math.min(1, readingRatio + 0.1))}
            style={styles.smallCircleButton}
          >
            <Ionicons name="play-forward" size={18} color={theme.colors.text} />
            <Text style={[styles.smallCircleText, { color: theme.colors.text }]}>10</Text>
          </Pressable>

          <Pressable
            disabled={!canGoNext}
            onPress={() =>
              setSelectedChapterIndex((index) => Math.min(chapters.length - 1, index + 1))
            }
            style={[styles.transportIconButton, { opacity: canGoNext ? 1 : 0.35 }]}
          >
            <Ionicons name="play-skip-forward" size={24} color={theme.colors.text} />
          </Pressable>
        </View>

        {statusMessage ? (
          <View
            style={[
              styles.statusCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.statusText, { color: theme.colors.text }]}>{statusMessage}</Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    gap: tokens.spacing.md,
    justifyContent: 'center',
    paddingTop: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xxl,
    paddingBottom: tokens.spacing.md,
  },
  backgroundArt: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    left: 0,
    right: 0,
    height: '58%',
    opacity: 0.5,
    transform: [{ scale: 1.06 }],
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBlock: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.lg,
    zIndex: 1,
  },
  cover: {
    width: 232,
    height: 232,
    borderRadius: tokens.radius.lg,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
  },
  coverFallback: {
    width: 232,
    height: 232,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackText: {
    fontSize: 72,
    fontWeight: '700',
  },
  bookTitle: {
    fontSize: tokens.typography.heading,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  bookAuthor: {
    fontSize: tokens.typography.caption,
    textAlign: 'center',
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    zIndex: 1,
  },
  chapterLabel: {
    flex: 1,
    fontSize: tokens.typography.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  sliderTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'visible',
    zIndex: 1,
  },
  sliderProgress: {
    height: '100%',
    borderRadius: 999,
  },
  sliderThumb: {
    position: 'absolute',
    top: '50%',
    width: 14,
    height: 14,
    marginLeft: -7,
    marginTop: -7,
    borderRadius: 999,
  },
  sliderMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  metaText: {
    fontSize: tokens.typography.caption,
    fontWeight: '500',
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  transportIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallCircleButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallCircleText: {
    fontSize: 10,
    fontWeight: '700',
  },
  playCircle: {
    width: 72,
    height: 72,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    zIndex: 1,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 17,
  },
});
