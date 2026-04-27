import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Screen } from '@/components/layout/screen';
import { bookRepository } from '@/features/library/json-book-repository';
import { Book } from '@/features/library/types';
import {
  AudiobookGenerationEstimate,
  audiobookGenerationService,
} from '@/features/tts/services/audiobook-generation-service';
import { getKokoroModelStatus } from '@/features/tts/services/kokoro-model-pack';
import { deleteTtsDataForBook } from '@/features/tts/services/tts-job-queue';
import { KokoroModelStatus, TtsBookSummary } from '@/features/tts/types';
import { kokoroBridge } from '@/native/kokoro-bridge';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) {
    return '--:--';
  }

  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function AudiobooksScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const backgroundGemSize = 190;
  const [audiobooks, setAudiobooks] = useState<Book[]>([]);
  const [libraryBooks, setLibraryBooks] = useState<Book[]>([]);
  const [summaries, setSummaries] = useState<Record<string, TtsBookSummary>>({});
  const [estimates, setEstimates] = useState<Record<string, AudiobookGenerationEstimate>>({});
  const [modelStatus, setModelStatus] = useState<KokoroModelStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [backgroundBookIds, setBackgroundBookIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [audiobookRows, bookRows, audiobookEntries] = await Promise.all([
        bookRepository.listAudiobookBooks(),
        bookRepository.listBooks(),
        bookRepository.listAudiobookEntries(),
      ]);
      const audiobookIds = new Set(audiobookEntries.map((entry) => entry.book_id));
      const availableLibraryBooks = bookRows.filter((book) => !audiobookIds.has(book.id));
      const estimateBooks = [...audiobookRows, ...availableLibraryBooks].filter(
        (book) => book.parsing_status === 'ready',
      );
      const bookSummaries = await Promise.all(
        audiobookRows.map(
          async (book) =>
            [book.id, await audiobookGenerationService.getBookSummary(book.id)] as const,
        ),
      );
      const bookEstimates = await Promise.all(
        estimateBooks.map(async (book) => {
          try {
            return [book.id, await audiobookGenerationService.estimateBook(book.id)] as const;
          } catch {
            return null;
          }
        }),
      );
      const runtimeStatus = await kokoroBridge
        .getStatus()
        .catch(async () => getKokoroModelStatus(false));

      setAudiobooks(audiobookRows);
      setLibraryBooks(availableLibraryBooks);
      setSummaries(Object.fromEntries(bookSummaries));
      setEstimates(Object.fromEntries(bookEstimates.filter((entry) => entry !== null)));
      setModelStatus(runtimeStatus);
      setBackgroundBookIds(
        audiobookRows
          .filter((book) => audiobookGenerationService.isPreparingInBackground(book.id))
          .map((book) => book.id),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load audiobooks.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const addFromLibrary = useCallback(
    async (bookId: string) => {
      await bookRepository.addAudiobook(bookId);
      await load();
    },
    [load],
  );

  useEffect(() => {
    const hasActiveGeneration = Object.values(summaries).some(
      (summary) =>
        summary.latestJob?.status === 'running' || summary.latestJob?.status === 'paused',
    );

    if (!hasActiveGeneration && !busyBookId && backgroundBookIds.length === 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      load().catch(() => undefined);
    }, 1000);

    return () => clearInterval(interval);
  }, [backgroundBookIds.length, busyBookId, load, summaries]);

  const removeAudiobook = useCallback(
    async (bookId: string) => {
      await deleteTtsDataForBook(bookId);
      await bookRepository.removeAudiobook(bookId);
      setMessage('Audiobook audio removed from this device.');
      await load();
    },
    [load],
  );

  const openAudiobookMenu = useCallback(
    (book: Book) => {
      Alert.alert(book.title ?? book.original_filename ?? 'Audiobook', undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Audiobook',
          style: 'destructive',
          onPress: () => {
            removeAudiobook(book.id).catch((error) => {
              setMessage(error instanceof Error ? error.message : 'Unable to remove audiobook.');
            });
          },
        },
      ]);
    },
    [removeAudiobook],
  );

  const generateAudiobook = useCallback(
    async (bookId: string) => {
      setBusyBookId(bookId);
      setMessage(null);
      try {
        const result = await audiobookGenerationService.prepareListeningStart(bookId);
        setMessage(result.statusMessage);
        await load();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to prepare audiobook.');
      } finally {
        setBusyBookId(null);
      }
    },
    [load],
  );

  const pauseAudiobook = useCallback(
    async (bookId: string) => {
      await audiobookGenerationService.pauseBook(bookId);
      setMessage('Audiobook generation will pause after the current chunk.');
      await load();
    },
    [load],
  );

  const resumeAudiobook = useCallback(
    async (bookId: string) => {
      await audiobookGenerationService.resumeBook(bookId);
      setMessage('Audiobook generation resumed.');
      await load();
    },
    [load],
  );

  const getGenerationProgress = useCallback(
    (bookId: string) => {
      const summary = summaries[bookId];
      const job = summary?.latestJob;
      if (job?.status === 'running' && job.totalChunks && job.totalChunks > 0) {
        return Math.max(0, Math.min(1, job.completedChunks / job.totalChunks));
      }

      if (!summary || summary.totalChunks === 0) {
        return busyBookId === bookId ? 0.12 : 0;
      }

      const completedChunks = summary.readyChunks + summary.failedChunks;
      const total = summary.totalChunks || 1;
      return Math.max(0, Math.min(1, completedChunks / total));
    },
    [busyBookId, summaries],
  );

  const getGenerationTiming = useCallback(
    (bookId: string) => {
      const summary = summaries[bookId];
      const job = summary?.latestJob;
      if (!job || job.status !== 'running' || !job.startedAt) {
        return null;
      }

      const elapsedMs = Math.max(0, Date.now() - job.startedAt);
      const completedChunks = job.completedChunks;
      const totalChunks = job.totalChunks ?? 0;
      const remainingChunks = Math.max(0, totalChunks - completedChunks);
      const averageChunkMs = completedChunks > 0 ? elapsedMs / completedChunks : null;
      const remainingMs = averageChunkMs ? remainingChunks * averageChunkMs : null;

      return {
        elapsedMs,
        remainingMs,
      };
    },
    [summaries],
  );

  const renderSummary = useCallback(
    (bookId: string) => {
      const summary = summaries[bookId];
      const job = summary?.latestJob;
      const isBackgroundPreparing = backgroundBookIds.includes(bookId);
      const timing = getGenerationTiming(bookId);

      if (job?.status === 'running') {
        const chapterProgress =
          job.totalChapters && job.totalChapters > 0
            ? `Chapter ${Math.min(job.completedChapters + 1, job.totalChapters)} of ${job.totalChapters}`
            : 'Generating audiobook';
        const chunkProgress =
          job.totalChunks && job.totalChunks > 0
            ? `${job.completedChunks} of ${job.totalChunks} chunks done`
            : `${job.completedChunks} chunks done`;
        const chapterTitle = job.currentChapterTitle ? ` - ${job.currentChapterTitle}` : '';
        const timingLabel = `Elapsed ${formatDuration(timing?.elapsedMs ?? null)} - Left ${formatDuration(
          timing?.remainingMs ?? null,
        )}`;

        return `${chapterProgress}${chapterTitle}\n${chunkProgress}\n${timingLabel}`;
      }

      if (job?.status === 'paused') {
        const chunkProgress =
          job.totalChunks && job.totalChunks > 0
            ? `${job.completedChunks} of ${job.totalChunks} chunks done`
            : `${job.completedChunks} chunks done`;
        return `Paused\n${chunkProgress}`;
      }

      if (!summary || summary.totalChunks === 0) {
        return isBackgroundPreparing ? 'Preparing chapter audio...' : 'Audiobook not generated yet';
      }

      const latestError = summary.latestJob?.error ? ` - ${summary.latestJob.error}` : '';
      const backgroundLabel = isBackgroundPreparing ? '\nCaching following chapters...' : '';
      return `${summary.readyChunks}/${summary.totalChunks} chunks ready - ${summary.failedChunks} blocked${latestError}${backgroundLabel}`;
    },
    [backgroundBookIds, getGenerationTiming, summaries],
  );

  const renderEstimate = useCallback(
    (bookId: string) => {
      const estimate = estimates[bookId];
      if (!estimate) {
        return null;
      }

      const chapterLabel = `${estimate.chapterCount} narratable chapter${estimate.chapterCount === 1 ? '' : 's'}`;
      const chunkLabel = `${estimate.chunkCount} estimated chunk${estimate.chunkCount === 1 ? '' : 's'}`;
      return `${chapterLabel} - ${chunkLabel}`;
    },
    [estimates],
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
      <FlatList
        data={audiobooks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Image
                source={require('../../../../assets/images/gem-background.png')}
                style={styles.titleGem}
              />
              <Text style={[styles.heading, { color: theme.colors.text }]}>Audiobooks</Text>
            </View>
            <Pressable
              onPress={() => router.push('/kokoro-setup')}
              style={[
                styles.setupButton,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <View style={styles.setupButtonText}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Kokoro Setup
                </Text>
                <Text style={[styles.caption, { color: theme.colors.textMuted }]} numberOfLines={2}>
                  {modelStatus?.readyForSynthesis
                    ? 'Model and voice are ready.'
                    : 'Manage model, voice, and runtime test.'}
                </Text>
              </View>
              <Text style={[styles.setupChevron, { color: theme.colors.textMuted }]}>
                {String.fromCharCode(8250)}
              </Text>
            </Pressable>
            {message ? (
              <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
            ) : null}
            <View
              style={[
                styles.insetDivider,
                styles.headerDivider,
                { backgroundColor: theme.colors.textMuted },
              ]}
            />
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
              Add one from your library below.
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={[styles.insetDivider, { backgroundColor: theme.colors.textMuted }]} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Add from Library
            </Text>
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
                    <Text
                      style={[styles.bookTitle, { color: theme.colors.text }]}
                      numberOfLines={2}
                    >
                      {book.title ?? book.original_filename}
                    </Text>
                    <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                      {book.author ?? 'Unknown author'} - {book.parsing_status}
                    </Text>
                    {book.parsing_status === 'ready' ? (
                      <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                        {renderEstimate(book.id) ?? 'Estimating audiobook size...'}
                      </Text>
                    ) : null}
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
        renderItem={({ item }) => {
          const isBookPreparing = busyBookId === item.id || backgroundBookIds.includes(item.id);
          const summary = summaries[item.id];
          const job = summary?.latestJob;
          const isGenerationPaused = job?.status === 'paused';
          const isGenerationRunning =
            isBookPreparing || job?.status === 'running' || isGenerationPaused;
          const hasPreparedAudio = Boolean(summary && summary.readyChunks > 0);
          const canPrepare =
            item.parsing_status === 'ready' && !hasPreparedAudio && !isGenerationRunning;

          return (
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
                    pathname: '/player/[bookId]',
                    params: { bookId: item.id },
                  })
                }
              >
                <Text style={[styles.bookTitle, { color: theme.colors.text }]} numberOfLines={2}>
                  {item.title ?? item.original_filename}
                </Text>
                <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                  {item.author ?? 'Unknown author'} - {item.parsing_status}
                </Text>
                {canPrepare ? (
                  <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                    {renderEstimate(item.id) ?? 'Estimating audiobook size...'}
                  </Text>
                ) : null}
                {isGenerationRunning ? (
                  <>
                    <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                      {renderSummary(item.id)}
                    </Text>
                    <View
                      style={[
                        styles.progressTrack,
                        {
                          backgroundColor: theme.colors.background,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: theme.colors.primary,
                            width: `${Math.round(getGenerationProgress(item.id) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                      Generation {Math.round(getGenerationProgress(item.id) * 100)}%
                    </Text>
                  </>
                ) : null}
              </Pressable>
              <View style={styles.cardActions}>
                {canPrepare ? (
                  <Pressable
                    onPress={() => generateAudiobook(item.id)}
                    style={[
                      styles.secondaryButton,
                      {
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: theme.colors.text }}>Prepare</Text>
                  </Pressable>
                ) : null}
                {job?.status === 'running' ? (
                  <Pressable
                    onPress={() => pauseAudiobook(item.id)}
                    style={[
                      styles.menuButton,
                      { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <Ionicons name="pause" size={18} color={theme.colors.text} />
                  </Pressable>
                ) : null}
                {isGenerationPaused ? (
                  <Pressable
                    onPress={() => resumeAudiobook(item.id)}
                    style={[
                      styles.menuButton,
                      { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <Ionicons name="play" size={18} color={theme.colors.text} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => openAudiobookMenu(item)}
                  style={[
                    styles.menuButton,
                    { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                  ]}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text} />
                </Pressable>
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
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
    height: 1,
    marginHorizontal: tokens.spacing.md,
    marginTop: tokens.spacing.sm,
    opacity: 0.35,
  },
  headerDivider: {
    marginBottom: tokens.spacing.xs,
  },
  setupButton: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    justifyContent: 'space-between',
    padding: tokens.spacing.md,
  },
  setupButtonText: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  setupChevron: {
    fontSize: 28,
    fontWeight: '300',
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
  progressTrack: {
    height: 8,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  cardActions: {
    alignItems: 'flex-end',
    gap: tokens.spacing.sm,
  },
  menuButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: tokens.typography.bodyLarge,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
});
