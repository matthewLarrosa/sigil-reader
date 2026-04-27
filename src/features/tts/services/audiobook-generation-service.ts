import { bookRepository } from '@/features/library/json-book-repository';
import { playerService } from '@/features/player/services-track-player';
import { normalizeChapterText, splitIntoTtsChunks } from '@/features/reader/services/text-normalization';
import { filterAudiobookChaptersForNarration } from '@/features/tts/services/audiobook-chapters';
import {
  deleteTtsDataForBook,
  enqueueTtsJob,
  getTtsBookSummary,
  getTtsJob,
  listTtsChunks,
  replaceChapterTtsChunks,
  ttsAudioDirectory,
  updateTtsChunk,
  updateTtsJob,
  upsertTtsManifest,
} from '@/features/tts/services/tts-job-queue';
import { TtsBookSummary, TtsChunk } from '@/features/tts/types';
import { kokoroBridge } from '@/native/kokoro-bridge';
import { createId } from '@/utils/id';

const CURRENT_SYNTHESIS_VERSION = 2;

export interface PrepareChapterAudioResult {
  jobId: string;
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  chunkCount: number;
  statusMessage: string;
}

export interface PrepareBookAudioResult {
  jobId: string;
  bookId: string;
  chapterCount: number;
  chunkCount: number;
  readyChunkCount: number;
  failedChunkCount: number;
  statusMessage: string;
}

export interface PrepareListeningStartResult {
  jobId: string;
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  chunkCount: number;
  statusMessage: string;
}

export interface PlayChapterAudioResult {
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  trackCount: number;
  statusMessage: string;
}

function buildChunkAudioPath(bookId: string, chapterId: string, chunkId: string, chunkIndex: number): string {
  const paddedIndex = String(chunkIndex).padStart(4, '0');
  return `${ttsAudioDirectory(bookId, chapterId)}/${paddedIndex}-${chunkId}.wav`;
}

interface GeneratedChapterSummary {
  chapterId: string;
  chapterTitle: string;
  chunkCount: number;
  readyCount: number;
  failedCount: number;
  totalDurationMs: number;
  latestError: string | null;
}

interface PlannedChapterAudio {
  chapterId: string;
  chapterTitle: string;
  chunks: TtsChunk[];
}

export class AudiobookGenerationService {
  private backgroundQueue: Promise<void> = Promise.resolve();
  private backgroundRequests = new Set<string>();
  private pausedBooks = new Set<string>();
  private runningChapters = new Set<string>();

  async getBookSummary(bookId: string): Promise<TtsBookSummary> {
    return getTtsBookSummary(bookId);
  }

  isPreparingInBackground(bookId: string): boolean {
    const prefix = `${bookId}:`;
    return (
      [...this.backgroundRequests].some((requestKey) => requestKey.startsWith(prefix)) ||
      [...this.runningChapters].some((runningKey) => runningKey.startsWith(prefix))
    );
  }

  async pauseBook(bookId: string): Promise<void> {
    this.pausedBooks.add(bookId);
    const summary = await this.getBookSummary(bookId);
    if (summary.latestJob?.status === 'running') {
      await updateTtsJob(summary.latestJob.id, { status: 'paused' });
    }
  }

  async resumeBook(bookId: string): Promise<void> {
    this.pausedBooks.delete(bookId);
    const summary = await this.getBookSummary(bookId);
    if (summary.latestJob?.status === 'paused') {
      await updateTtsJob(summary.latestJob.id, { status: 'running' });
    }
  }

  private async waitWhilePaused(bookId: string, jobId: string): Promise<void> {
    let job = await getTtsJob(jobId);
    while (this.pausedBooks.has(bookId) || job?.status === 'paused') {
      if (job?.status === 'paused' && !this.pausedBooks.has(bookId)) {
        this.pausedBooks.add(bookId);
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
      job = await getTtsJob(jobId);
    }
  }

  async listChapters(bookId: string) {
    const chapters = await bookRepository.listChapters(bookId);
    return filterAudiobookChaptersForNarration(chapters);
  }

  private buildChapterChunks(
    bookId: string,
    chapterId: string,
    chapterTitle: string,
    chapterText: string,
  ): PlannedChapterAudio {
    const normalizedText = normalizeChapterText(chapterText);
    const readerChunks = splitIntoTtsChunks(chapterId, normalizedText, 420);
    const chunks: TtsChunk[] = readerChunks.map((chunk) => ({
      id: chunk.id,
      bookId,
      chapterId,
      chunkIndex: chunk.index,
      text: chunk.text,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
      audioPath: null,
      durationMs: null,
      status: 'pending',
      error: null,
    }));

    return {
      chapterId,
      chapterTitle,
      chunks,
    };
  }

  private async hasCurrentChapterAudio(bookId: string, chapterId: string): Promise<boolean> {
    const chunks = await listTtsChunks(bookId, chapterId);
    const summary = await this.getBookSummary(bookId);
    const manifest = summary.manifests.find((entry) => entry.chapterId === chapterId) ?? null;
    const hasReadyAudio = chunks.some((chunk) => chunk.status === 'ready' && chunk.audioPath);
    const isCurrentSynthesis =
      manifest?.synthesisVersion === CURRENT_SYNTHESIS_VERSION &&
      chunks.every((chunk) => chunk.status !== 'ready' || Boolean(chunk.audioPath));

    return hasReadyAudio && isCurrentSynthesis;
  }

  private async isChapterHandledOrReady(bookId: string, chapterId: string): Promise<boolean> {
    if (this.runningChapters.has(`${bookId}:${chapterId}`)) {
      return true;
    }

    return this.hasCurrentChapterAudio(bookId, chapterId);
  }

  private async getFirstMissingChapter(bookId: string) {
    const chapters = await this.listChapters(bookId);
    for (const chapter of chapters) {
      const isHandledOrReady = await this.isChapterHandledOrReady(bookId, chapter.id);
      if (!isHandledOrReady) {
        return chapter;
      }
    }

    return null;
  }

  private enqueueFollowingChapters(bookId: string, currentChapterId: string): void {
    const requestKey = `${bookId}:${currentChapterId}`;
    if (this.backgroundRequests.has(requestKey)) {
      return;
    }

    this.backgroundRequests.add(requestKey);
    this.backgroundQueue = this.backgroundQueue
      .then(async () => {
        const chapters = await this.listChapters(bookId);
        const currentIndex = chapters.findIndex((chapter) => chapter.id === currentChapterId);
        const nextChapters = currentIndex >= 0 ? chapters.slice(currentIndex + 1) : [];

        for (const chapter of nextChapters) {
          const isHandledOrReady = await this.isChapterHandledOrReady(bookId, chapter.id);
          if (!isHandledOrReady) {
            await this.prepareChapter(bookId, chapter.id);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        this.backgroundRequests.delete(requestKey);
      });
  }

  private async generateChapterAudio(
    bookId: string,
    chapterId: string,
    options?: {
      jobId?: string;
      plannedChapter?: PlannedChapterAudio;
      onChunkFinished?: (result: { readyIncrement: number; failedIncrement: number }) => Promise<void>;
    },
  ): Promise<GeneratedChapterSummary> {
    const chapter = await bookRepository.getChapter(bookId, chapterId);
    if (!chapter) {
      throw new Error('Chapter not found. Try reparsing the EPUB first.');
    }

    const plannedChapter =
      options?.plannedChapter ??
      this.buildChapterChunks(bookId, chapter.id, chapter.title, chapter.text_content);
    const { chunks } = plannedChapter;

    await replaceChapterTtsChunks(bookId, chapter.id, chunks);
    let totalDurationMs = 0;
    let readyCount = 0;
    let failedCount = 0;
    let latestError: string | null = null;

    for (const chunk of chunks) {
      if (options?.jobId) {
        await this.waitWhilePaused(bookId, options.jobId);
      }

      try {
        const synthesized = await kokoroBridge.synthesize(chunk.text, {
          outputPath: buildChunkAudioPath(bookId, chapter.id, chunk.id, chunk.chunkIndex),
        });
        totalDurationMs += synthesized.durationMs;
        readyCount += 1;
        await updateTtsChunk(chunk.id, {
          audioPath: synthesized.audioPath,
          durationMs: synthesized.durationMs,
          status: 'ready',
          error: null,
        });
        if (options?.onChunkFinished) {
          await options.onChunkFinished({ readyIncrement: 1, failedIncrement: 0 });
        }
      } catch (error) {
        failedCount += 1;
        latestError = error instanceof Error ? error.message : 'Unable to synthesize chunk.';
        await updateTtsChunk(chunk.id, {
          status: 'failed',
          error: latestError,
        });
        if (options?.onChunkFinished) {
          await options.onChunkFinished({ readyIncrement: 0, failedIncrement: 1 });
        }
      }
    }

    await upsertTtsManifest({
      id: `${bookId}:${chapter.id}`,
      bookId,
      chapterId: chapter.id,
      totalChunks: chunks.length,
      totalDurationMs,
      synthesisVersion: CURRENT_SYNTHESIS_VERSION,
      updatedAt: Date.now(),
    });

    return {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chunkCount: chunks.length,
      readyCount,
      failedCount,
      totalDurationMs,
      latestError,
    };
  }

  async prepareChapter(bookId: string, chapterId: string): Promise<PrepareChapterAudioResult> {
    const runningKey = `${bookId}:${chapterId}`;
    if (this.runningChapters.has(runningKey)) {
      throw new Error('This chapter is already being prepared.');
    }

    const chapter = await bookRepository.getChapter(bookId, chapterId);
    if (!chapter) {
      throw new Error('Chapter not found. Try reparsing the EPUB first.');
    }

    this.runningChapters.add(runningKey);
    const job = await enqueueTtsJob(bookId, 'chapter', chapter.id);
    const plannedChapter = this.buildChapterChunks(bookId, chapter.id, chapter.title, chapter.text_content);
    await updateTtsJob(job.id, {
      status: 'running',
      startedAt: Date.now(),
      totalChapters: 1,
      completedChapters: 0,
      currentChapterId: chapter.id,
      currentChapterTitle: chapter.title,
      totalChunks: plannedChapter.chunks.length,
      completedChunks: 0,
      readyChunks: 0,
      failedChunks: 0,
    });

    try {
      let completedChunks = 0;
      let readyChunks = 0;
      let failedChunks = 0;
      const summary = await this.generateChapterAudio(bookId, chapter.id, {
        jobId: job.id,
        plannedChapter,
        onChunkFinished: async ({ readyIncrement, failedIncrement }) => {
          completedChunks += readyIncrement + failedIncrement;
          readyChunks += readyIncrement;
          failedChunks += failedIncrement;
          await updateTtsJob(job.id, {
            completedChunks,
            readyChunks,
            failedChunks,
          });
        },
      });
      await updateTtsJob(job.id, {
        status: summary.failedCount === summary.chunkCount ? 'failed' : 'completed',
        error: summary.latestError,
        completedAt: Date.now(),
        completedChapters: 1,
        completedChunks: summary.chunkCount,
        readyChunks: summary.readyCount,
        failedChunks: summary.failedCount,
      });

      return {
        jobId: job.id,
        bookId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chunkCount: summary.chunkCount,
        statusMessage:
          summary.failedCount === 0
            ? `Generated ${summary.readyCount} local audio chunks for ${chapter.title}.`
            : `Generated ${summary.readyCount} of ${summary.chunkCount} local audio chunks for ${chapter.title}. ${summary.failedCount} chunk${summary.failedCount === 1 ? '' : 's'} failed${summary.latestError ? `: ${summary.latestError}` : '.'}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to prepare audiobook.';
      await updateTtsJob(job.id, {
        status: 'failed',
        error: message,
        completedAt: Date.now(),
        currentChapterId: null,
        currentChapterTitle: null,
      });
      throw error;
    } finally {
      this.runningChapters.delete(runningKey);
    }
  }

  async prepareBook(bookId: string): Promise<PrepareBookAudioResult> {
    const chapters = await this.listChapters(bookId);
    if (chapters.length === 0) {
      throw new Error('This book has no parsed chapters yet.');
    }

    await deleteTtsDataForBook(bookId);
    const plannedChapters = chapters.map((chapter) =>
      this.buildChapterChunks(bookId, chapter.id, chapter.title, chapter.text_content),
    );
    const totalChunks = plannedChapters.reduce((sum, chapter) => sum + chapter.chunks.length, 0);
    const job = await enqueueTtsJob(bookId, 'full_book', null);
    await updateTtsJob(job.id, {
      status: 'running',
      startedAt: Date.now(),
      totalChapters: plannedChapters.length,
      completedChapters: 0,
      currentChapterId: plannedChapters[0]?.chapterId ?? null,
      currentChapterTitle: plannedChapters[0]?.chapterTitle ?? null,
      totalChunks,
      completedChunks: 0,
      readyChunks: 0,
      failedChunks: 0,
    });

    try {
      let completedChunks = 0;
      let readyChunkCount = 0;
      let failedChunkCount = 0;
      let latestError: string | null = null;
      let completedChapters = 0;

      for (const plannedChapter of plannedChapters) {
        await updateTtsJob(job.id, {
          currentChapterId: plannedChapter.chapterId,
          currentChapterTitle: plannedChapter.chapterTitle,
          totalChunks,
          completedChunks,
          readyChunks: readyChunkCount,
          failedChunks: failedChunkCount,
          completedChapters,
        });

        const summary = await this.generateChapterAudio(bookId, plannedChapter.chapterId, {
          jobId: job.id,
          plannedChapter,
          onChunkFinished: async ({ readyIncrement, failedIncrement }) => {
            completedChunks += readyIncrement + failedIncrement;
            readyChunkCount += readyIncrement;
            failedChunkCount += failedIncrement;
            await updateTtsJob(job.id, {
              completedChunks,
              readyChunks: readyChunkCount,
              failedChunks: failedChunkCount,
            });
          },
        });
        latestError = summary.latestError ?? latestError;
        completedChapters += 1;
        await updateTtsJob(job.id, {
          completedChapters,
          currentChapterId:
            plannedChapters[completedChapters]?.chapterId ?? plannedChapter.chapterId,
          currentChapterTitle:
            plannedChapters[completedChapters]?.chapterTitle ?? plannedChapter.chapterTitle,
        });
      }

      await updateTtsJob(job.id, {
        status: failedChunkCount === totalChunks ? 'failed' : 'completed',
        error: latestError,
        completedAt: Date.now(),
        completedChapters,
        currentChapterId: null,
        currentChapterTitle: null,
        totalChunks,
        completedChunks: totalChunks,
        readyChunks: readyChunkCount,
        failedChunks: failedChunkCount,
      });

      return {
        jobId: job.id,
        bookId,
        chapterCount: chapters.length,
        chunkCount: totalChunks,
        readyChunkCount,
        failedChunkCount,
        statusMessage:
          failedChunkCount === 0
            ? `Generated the full audiobook locally: ${readyChunkCount} chunks across ${chapters.length} chapters.`
            : `Generated ${readyChunkCount} of ${totalChunks} audiobook chunks across ${chapters.length} chapters. ${failedChunkCount} chunk${failedChunkCount === 1 ? '' : 's'} failed${latestError ? `: ${latestError}` : '.'}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate audiobook.';
      await updateTtsJob(job.id, {
        status: 'failed',
        error: message,
        completedAt: Date.now(),
        currentChapterId: null,
        currentChapterTitle: null,
      });
      throw error;
    }
  }

  async prepareListeningStart(bookId: string): Promise<PrepareListeningStartResult> {
    const nextMissingChapter = await this.getFirstMissingChapter(bookId);
    if (!nextMissingChapter) {
      const chapters = await this.listChapters(bookId);
      const firstChapter = chapters[0];
      if (!firstChapter) {
        throw new Error('This book has no parsed chapters yet.');
      }

      this.enqueueFollowingChapters(bookId, firstChapter.id);
      return {
        jobId: 'already_ready',
        bookId,
        chapterId: firstChapter.id,
        chapterTitle: firstChapter.title,
        chunkCount: 0,
        statusMessage: 'All detected audiobook chapters already have cached audio.',
      };
    }

    const result = await this.prepareChapter(bookId, nextMissingChapter.id);
    this.enqueueFollowingChapters(bookId, nextMissingChapter.id);

    return {
      ...result,
      statusMessage: `${result.statusMessage} Preparing following chapters in the background.`,
    };
  }

  async verifyModelLoad(): Promise<string> {
    const result = await kokoroBridge.canLoadModel();
    if (!result.ok) {
      throw new Error(result.message);
    }

    return result.message;
  }

  async createSampleJob(bookId: string): Promise<string> {
    const job = await enqueueTtsJob(bookId, 'selection', null);
    await updateTtsJob(job.id, {
      status: 'failed',
      error: 'Sample synthesis is blocked until Kokoro tokenizer and voice assets are wired.',
    });
    return createId('sample_blocked');
  }

  async playChapter(bookId: string, chapterId: string): Promise<PlayChapterAudioResult> {
    const [book, chapter] = await Promise.all([
      bookRepository.getBookById(bookId),
      bookRepository.getChapter(bookId, chapterId),
    ]);

    if (!chapter) {
      throw new Error('Chapter not found. Try reparsing the EPUB first.');
    }

    const hasReadyAudio = await this.hasCurrentChapterAudio(bookId, chapterId);
    if (!hasReadyAudio) {
      await this.prepareChapter(bookId, chapterId);
    }

    const chunks = await listTtsChunks(bookId, chapterId);
    const tracks = chunks
      .filter((chunk) => chunk.status === 'ready' && chunk.audioPath)
      .sort((left, right) => left.chunkIndex - right.chunkIndex)
      .map((chunk) => ({
        id: chunk.id,
        url: chunk.audioPath!,
        title: `${chapter.title} • Part ${chunk.chunkIndex + 1}`,
        artist: book?.title ?? book?.original_filename ?? 'Sigil Reader',
        artwork: book?.cover_path ?? undefined,
      }));

    if (tracks.length === 0) {
      throw new Error('No playable audio chunks were generated for this chapter.');
    }

    await playerService.playQueue(tracks);
    this.enqueueFollowingChapters(bookId, chapterId);

    return {
      bookId,
      chapterId,
      chapterTitle: chapter.title,
      trackCount: tracks.length,
      statusMessage: `Playing ${chapter.title} with ${tracks.length} cached audio chunk${tracks.length === 1 ? '' : 's'}. Preparing following chapters in the background.`,
    };
  }
}

export const audiobookGenerationService = new AudiobookGenerationService();
