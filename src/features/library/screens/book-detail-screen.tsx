import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { libraryImportService } from '@/features/library/services/import-epub';
import { bookRepository } from '@/features/library/sqlite-book-repository';
import { Book, Chapter } from '@/features/library/types';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

export function BookDetailScreen() {
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

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [bookRecord, chapterRows] = await Promise.all([
        bookRepository.getBookById(bookId),
        bookRepository.listChapters(bookId),
      ]);
      setBook(bookRecord);
      setChapters(chapterRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load book details.');
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [bookId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const handleRetryParse = useCallback(async () => {
    setIsRetrying(true);
    setError(null);
    try {
      await libraryImportService.retryParse(bookId);
      await load();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Retry parse failed.');
      setIsRetrying(false);
    }
  }, [bookId, load]);

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
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {book.title ?? book.original_filename}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          {book.author ?? 'Unknown author'}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: theme.colors.highlight }]}>
          <Text style={[styles.statusText, { color: theme.colors.text }]}>
            Parse status: {book.parsing_status}
          </Text>
        </View>
        {book.parsing_status === 'failed' ? (
          <View style={styles.errorBlock}>
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              {book.parse_error ?? 'Parsing failed.'}
            </Text>
            <Pressable
              disabled={isRetrying}
              onPress={handleRetryParse}
              style={[styles.button, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.buttonLabel}>{isRetrying ? 'Retrying...' : 'Retry Parse'}</Text>
            </Pressable>
          </View>
        ) : null}
        {book.parsing_status === 'ready' && chapters.length > 0 ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/reader/[bookId]/[chapterId]',
                params: { bookId: book.id, chapterId: chapters[0].id },
              })
            }
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
          >
            <Text style={styles.buttonLabel}>Start Reading</Text>
          </Pressable>
        ) : null}
        <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
          Chapters ({chapters.length})
        </Text>
        {chapters.map((chapter) => (
          <Pressable
            key={chapter.id}
            onPress={() =>
              router.push({
                pathname: '/reader/[bookId]/[chapterId]',
                params: { bookId: book.id, chapterId: chapter.id },
              })
            }
            style={[styles.chapterItem, { borderColor: theme.colors.border }]}
          >
            <Text style={[styles.chapterTitle, { color: theme.colors.text }]}>{chapter.title}</Text>
          </Pressable>
        ))}
        {error ? (
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
        ) : null}
      </ScrollView>
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
    paddingBottom: tokens.spacing.xxl,
  },
  title: {
    fontSize: tokens.typography.title,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: tokens.typography.body,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  statusText: {
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: tokens.typography.heading,
    fontWeight: '700',
    marginTop: tokens.spacing.sm,
  },
  chapterItem: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
  chapterTitle: {
    fontSize: tokens.typography.body,
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
});
