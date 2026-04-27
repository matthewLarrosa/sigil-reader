import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/screen';
import { bookRepository } from '@/features/library/json-book-repository';
import { libraryImportService } from '@/features/library/services/import-epub';
import { Book, Chapter } from '@/features/library/types';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

export function BookDetailScreen() {
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

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [readChapterIds, setReadChapterIds] = useState<Set<string>>(new Set());
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (!bookId) {
      setBook(null);
      setChapters([]);
      setIsLoading(false);
      setError('Missing book id.');
      return;
    }
    try {
      const [bookRecord, chapterRows] = await Promise.all([
        bookRepository.getBookById(bookId),
        bookRepository.listChapters(bookId),
      ]);
      const readChapters = await bookRepository.listReadChapters(bookId);
      setBook(bookRecord);
      setChapters(chapterRows);
      setReadChapterIds(new Set(readChapters.map((chapter) => chapter.chapter_id)));
      setSelectedChapterIds(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load book details.');
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const handleDelete = useCallback(() => {
    Alert.alert('Remove book?', 'This will delete the EPUB and all parsed data for this book.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          libraryImportService
            .removeBook(bookId)
            .then(() => router.replace('/'))
            .catch((deleteError) => {
              setError(deleteError instanceof Error ? deleteError.message : 'Delete failed.');
            });
        },
      },
    ]);
  }, [bookId, router]);

  const openChapter = useCallback(
    (chapterId: string) => {
      router.push({
        pathname: '/reader/[bookId]/[chapterId]',
        params: { bookId, chapterId },
      });
    },
    [bookId, router],
  );

  const markChapterUnread = useCallback(
    (chapterIds: string[]) => {
      setReadChapterIds((current) => {
        const next = new Set(current);
        chapterIds.forEach((chapterId) => next.delete(chapterId));
        return next;
      });
      setSelectedChapterIds(new Set());
      Promise.all(
        chapterIds.map((chapterId) => bookRepository.markChapterUnread(bookId, chapterId)),
      ).catch((markError) => {
        setError(markError instanceof Error ? markError.message : 'Unable to update chapters.');
        load().catch(() => undefined);
      });
    },
    [bookId, load],
  );

  const markChapterRead = useCallback(
    (chapterIds: string[]) => {
      setReadChapterIds((current) => {
        const next = new Set(current);
        chapterIds.forEach((chapterId) => next.add(chapterId));
        return next;
      });
      setSelectedChapterIds(new Set());
      Promise.all(
        chapterIds.map((chapterId) => bookRepository.markChapterRead(bookId, chapterId)),
      ).catch((markError) => {
        setError(markError instanceof Error ? markError.message : 'Unable to update chapters.');
        load().catch(() => undefined);
      });
    },
    [bookId, load],
  );

  const resetAllChaptersUnread = useCallback(() => {
    Alert.alert(
      'Reset chapter status?',
      'All chapters in this book will be marked unread.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => markChapterUnread(chapters.map((chapter) => chapter.id)),
        },
      ],
    );
  }, [chapters, markChapterUnread]);

  const markAboveSelectionRead = useCallback(() => {
    const selectedIndexes = chapters
      .map((chapter, index) => (selectedChapterIds.has(chapter.id) ? index : -1))
      .filter((index) => index >= 0);
    const firstSelectedIndex = Math.min(...selectedIndexes);
    if (!Number.isFinite(firstSelectedIndex) || firstSelectedIndex <= 0) {
      return;
    }

    markChapterRead(chapters.slice(0, firstSelectedIndex).map((chapter) => chapter.id));
  }, [chapters, markChapterRead, selectedChapterIds]);

  const toggleChapterSelection = useCallback((chapterId: string) => {
    setSelectedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }, []);

  const selectedIds = useMemo(() => [...selectedChapterIds], [selectedChapterIds]);

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!book) {
    return (
      <Screen>
        <Text style={[styles.title, { color: theme.colors.text }]}>Book not found.</Text>
        {error ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text> : null}
        <Pressable onPress={() => router.replace('/')} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.buttonLabel}>Back to Library</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.bookHero}>
          <View
            style={[
              styles.coverFrame,
              { backgroundColor: theme.colors.highlight, borderColor: theme.colors.border },
            ]}
          >
            {book.cover_path ? (
              <Image source={{ uri: book.cover_path }} style={styles.coverImage} />
            ) : (
              <Image
                source={require('../../../../assets/images/gem-background.png')}
                style={styles.fallbackCoverGem}
              />
            )}
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={3}>
            {book.title ?? book.original_filename}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]} numberOfLines={2}>
            {book.author ?? 'Unknown author'}
          </Text>
        </View>
        {book.parsing_status === 'failed' ? (
          <View style={styles.errorBlock}>
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              {book.parse_error ?? 'Parsing failed.'}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
          Chapters ({chapters.length})
        </Text>
        {chapters.map((chapter) => {
          const isRead = readChapterIds.has(chapter.id);
          const isSelected = selectedChapterIds.has(chapter.id);
          return (
            <Pressable
              key={chapter.id}
              onLongPress={() => toggleChapterSelection(chapter.id)}
              onPress={() =>
                selectedChapterIds.size > 0
                  ? toggleChapterSelection(chapter.id)
                  : openChapter(chapter.id)
              }
              style={[
                styles.chapterItem,
                {
                  backgroundColor: isRead ? theme.colors.border : theme.colors.surface,
                  borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.chapterDot,
                  { backgroundColor: isRead ? theme.colors.textMuted : theme.colors.primary },
                ]}
              />
              <Text
                style={[
                  styles.chapterTitle,
                  { color: isRead ? theme.colors.textMuted : theme.colors.text },
                ]}
                numberOfLines={2}
              >
                {chapter.title}
              </Text>
            </Pressable>
          );
        })}
        {error ? (
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
        ) : null}
        <Pressable onPress={handleDelete} style={[styles.button, { backgroundColor: theme.colors.danger }]}>
          <Text style={styles.buttonLabel}>Delete EPUB</Text>
        </Pressable>
      </ScrollView>
      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.colors.background,
            paddingBottom: Math.max(insets.bottom + tokens.spacing.sm, tokens.spacing.xl),
          },
        ]}
      >
        <Pressable
          disabled={selectedIds.length === 0}
          onPress={() => markChapterUnread(selectedIds)}
          style={[
            styles.footerButton,
            { borderColor: theme.colors.border, opacity: selectedIds.length === 0 ? 0.45 : 1 },
          ]}
        >
          <Ionicons name="checkmark" size={22} color={theme.colors.text} />
        </Pressable>
        <Pressable
          disabled={selectedIds.length === 0}
          onPress={() => markChapterRead(selectedIds)}
          style={[
            styles.footerButton,
            { borderColor: theme.colors.border, opacity: selectedIds.length === 0 ? 0.45 : 1 },
          ]}
        >
          <Ionicons name="checkmark-done" size={22} color={theme.colors.text} />
        </Pressable>
        <Pressable
          disabled={selectedIds.length === 0}
          onPress={markAboveSelectionRead}
          style={[
            styles.footerButton,
            { borderColor: theme.colors.border, opacity: selectedIds.length === 0 ? 0.45 : 1 },
          ]}
        >
          <View style={styles.combinedIcon}>
            <Ionicons name="checkmark-done" size={20} color={theme.colors.text} />
            <Ionicons name="arrow-up" size={17} color={theme.colors.text} />
          </View>
        </Pressable>
        <Pressable
          disabled={chapters.length === 0}
          onPress={resetAllChaptersUnread}
          style={[
            styles.footerButton,
            { borderColor: theme.colors.border, opacity: chapters.length === 0 ? 0.45 : 1 },
          ]}
        >
          <Ionicons name="refresh" size={21} color={theme.colors.text} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: tokens.spacing.md,
    paddingBottom: 112,
  },
  bookHero: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  coverFrame: {
    width: 176,
    aspectRatio: 0.68,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  fallbackCoverGem: {
    width: '70%',
    height: '70%',
    opacity: 0.5,
    resizeMode: 'contain',
  },
  title: {
    fontSize: tokens.typography.title,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: tokens.typography.body,
    textAlign: 'center',
  },
  sectionHeading: {
    fontSize: tokens.typography.heading,
    fontWeight: '700',
    marginTop: tokens.spacing.sm,
  },
  chapterItem: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
  },
  chapterDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  chapterTitle: {
    flex: 1,
    fontSize: tokens.typography.body,
    fontWeight: '600',
  },
  button: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorBlock: {
    gap: tokens.spacing.sm,
  },
  errorText: {
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.xs,
  },
  footerButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  combinedIcon: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
  },
});
