import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { bookRepository } from '@/features/library/json-book-repository';
import { Chapter } from '@/features/library/types';
import {
  defaultReaderPreferences,
  getReaderPreferences,
  saveReaderPreferences,
} from '@/features/reader/services/reader-preferences';
import { ReaderPreferences } from '@/features/reader/types';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function ReaderMenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useAppTheme();
  const bookId = useMemo(() => firstParam(params.bookId), [params.bookId]);
  const chapterId = useMemo(() => firstParam(params.chapterId), [params.chapterId]);

  const [preferences, setPreferences] = useState<ReaderPreferences>(defaultReaderPreferences);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<Chapter[]>([]);
  const [bookmarks, setBookmarks] = useState<
    { id: string; chapterId: string; label: string; progressRatio: number; createdAt: number }[]
  >([]);

  const load = useCallback(async () => {
    const [prefRow, bookmarkRows] = await Promise.all([
      getReaderPreferences(),
      bookRepository.listBookmarks(bookId),
    ]);
    setPreferences(prefRow);
    setBookmarks(bookmarkRows);
  }, [bookId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

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

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchHits([]);
      return;
    }
    const results = await bookRepository.searchBook(bookId, searchQuery.trim());
    setSearchHits(results);
  }, [bookId, searchQuery]);

  const openChapter = useCallback(
    (nextChapterId: string) => {
      router.replace({
        pathname: '/reader/[bookId]/[chapterId]',
        params: { bookId, chapterId: nextChapterId },
      });
    },
    [bookId, router],
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Reader Menu</Text>
          <Pressable
            onPress={() => openChapter(chapterId)}
            style={[styles.textButton, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text }}>Back to chapter</Text>
          </Pressable>
        </View>

        <View style={[styles.panel, { borderColor: theme.colors.border }]}>
          <Text style={[styles.panelTitle, { color: theme.colors.text }]}>Text Size</Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => updateFontSize(-1)}
              style={[styles.controlButton, { borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.text }}>A-</Text>
            </Pressable>
            <Text style={[styles.valueText, { color: theme.colors.text }]}>
              {preferences.fontSize}px
            </Text>
            <Pressable
              onPress={() => updateFontSize(1)}
              style={[styles.controlButton, { borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.text }}>A+</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.panel, { borderColor: theme.colors.border }]}>
          <Text style={[styles.panelTitle, { color: theme.colors.text }]}>Search</Text>
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
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.primaryButtonLabel}>Find</Text>
            </Pressable>
          </View>
          {searchHits.map((result) => (
            <Pressable key={result.id} onPress={() => openChapter(result.id)} style={styles.menuRow}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{result.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.panel, { borderColor: theme.colors.border }]}>
          <Text style={[styles.panelTitle, { color: theme.colors.text }]}>Bookmarks</Text>
          {bookmarks.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>No bookmarks yet.</Text>
          ) : (
            bookmarks.map((bookmark) => (
              <Pressable
                key={bookmark.id}
                onPress={() => openChapter(bookmark.chapterId)}
                style={styles.menuRow}
              >
                <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{bookmark.label}</Text>
                <Text style={[styles.rowMeta, { color: theme.colors.textMuted }]}>
                  {Math.round(bookmark.progressRatio * 100)}%
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/player/[bookId]',
              params: { bookId },
            })
          }
          style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={styles.primaryButtonLabel}>Listen</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  title: {
    flex: 1,
    fontSize: tokens.typography.title,
    fontWeight: '700',
  },
  panel: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  panelTitle: {
    fontSize: tokens.typography.body,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  textButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  controlButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
  },
  valueText: {
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  rowTitle: {
    flex: 1,
    fontSize: tokens.typography.body,
  },
  rowMeta: {
    fontSize: tokens.typography.caption,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: tokens.typography.caption,
  },
});
