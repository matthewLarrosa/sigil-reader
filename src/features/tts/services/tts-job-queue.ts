import * as FileSystem from 'expo-file-system/legacy';

import {
  TtsBookSummary,
  TtsChunk,
  TtsJob,
  TtsJobScope,
  TtsManifest,
} from '@/features/tts/types';
import { createId } from '@/utils/id';

interface TtsStore {
  jobs: TtsJob[];
  chunks: TtsChunk[];
  manifests: TtsManifest[];
}

const emptyStore: TtsStore = {
  jobs: [],
  chunks: [],
  manifests: [],
};

let operationQueue: Promise<void> = Promise.resolve();

function storePath(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('App document directory is unavailable on this device.');
  }

  return `${FileSystem.documentDirectory}sigil-tts.json`;
}

export function ttsAudioDirectory(bookId: string, chapterId: string): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('App document directory is unavailable on this device.');
  }

  return `${FileSystem.documentDirectory}tts/${bookId}/${chapterId}`;
}

function cloneStore(store: TtsStore): TtsStore {
  return {
    jobs: [...store.jobs],
    chunks: [...store.chunks],
    manifests: [...store.manifests],
  };
}

function queueStoreOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function readStore(): Promise<TtsStore> {
  const path = storePath();
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    return cloneStore(emptyStore);
  }

  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as Partial<TtsStore>;
    return {
      jobs: parsed.jobs ?? [],
      chunks: parsed.chunks ?? [],
      manifests: parsed.manifests ?? [],
    };
  } catch {
    return cloneStore(emptyStore);
  }
}

async function writeStore(store: TtsStore): Promise<void> {
  await FileSystem.writeAsStringAsync(storePath(), JSON.stringify(store));
}

async function updateStore<T>(updater: (store: TtsStore) => T | Promise<T>): Promise<T> {
  return queueStoreOperation(async () => {
    const store = await readStore();
    const result = await updater(store);
    await writeStore(store);
    return result;
  });
}

export async function enqueueTtsJob(
  bookId: string,
  scope: TtsJobScope,
  chapterId: string | null = null,
): Promise<TtsJob> {
  return updateStore((store) => {
    const job: TtsJob = {
      id: createId('tts_job'),
      bookId,
      scope,
      chapterId,
      status: 'queued',
      error: null,
      startedAt: null,
      completedAt: null,
      totalChapters: null,
      completedChapters: 0,
      currentChapterId: chapterId,
      currentChapterTitle: null,
      totalChunks: null,
      completedChunks: 0,
      readyChunks: 0,
      failedChunks: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    store.jobs = [job, ...store.jobs];
    return job;
  });
}

export async function updateTtsJob(
  jobId: string,
  updates: Partial<
    Pick<
      TtsJob,
      | 'status'
      | 'error'
      | 'startedAt'
      | 'completedAt'
      | 'totalChapters'
      | 'completedChapters'
      | 'currentChapterId'
      | 'currentChapterTitle'
      | 'totalChunks'
      | 'completedChunks'
      | 'readyChunks'
      | 'failedChunks'
    >
  >,
): Promise<TtsJob | null> {
  return updateStore((store) => {
    let updatedJob: TtsJob | null = null;
    store.jobs = store.jobs.map((job) => {
      if (job.id !== jobId) {
        return job;
      }

      updatedJob = {
        ...job,
        ...updates,
        updatedAt: Date.now(),
      };
      return updatedJob;
    });
    return updatedJob;
  });
}

export async function upsertTtsChunks(chunks: TtsChunk[]): Promise<void> {
  await updateStore((store) => {
    for (const chunk of chunks) {
      const index = store.chunks.findIndex((storedChunk) => storedChunk.id === chunk.id);
      if (index >= 0) {
        store.chunks[index] = chunk;
      } else {
        store.chunks.push(chunk);
      }
    }
  });
}

export async function replaceChapterTtsChunks(
  bookId: string,
  chapterId: string,
  chunks: TtsChunk[],
): Promise<void> {
  await updateStore((store) => {
    store.chunks = [
      ...store.chunks.filter(
        (chunk) => !(chunk.bookId === bookId && chunk.chapterId === chapterId),
      ),
      ...chunks,
    ];
  });
}

export async function updateTtsChunk(chunkId: string, updates: Partial<TtsChunk>): Promise<TtsChunk | null> {
  return updateStore((store) => {
    let updatedChunk: TtsChunk | null = null;
    store.chunks = store.chunks.map((chunk) => {
      if (chunk.id !== chunkId) {
        return chunk;
      }

      updatedChunk = {
        ...chunk,
        ...updates,
      };
      return updatedChunk;
    });

    return updatedChunk;
  });
}

export async function upsertTtsManifest(manifest: TtsManifest): Promise<void> {
  await updateStore((store) => {
    store.manifests = [
      manifest,
      ...store.manifests.filter((storedManifest) => storedManifest.id !== manifest.id),
    ];
  });
}

export async function listTtsChunks(bookId: string, chapterId?: string): Promise<TtsChunk[]> {
  const store = await readStore();
  return store.chunks
    .filter((chunk) => chunk.bookId === bookId && (!chapterId || chunk.chapterId === chapterId))
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
}

export async function getTtsBookSummary(bookId: string): Promise<TtsBookSummary> {
  const store = await readStore();
  const chunks = store.chunks.filter((chunk) => chunk.bookId === bookId);
  const manifests = store.manifests.filter((manifest) => manifest.bookId === bookId);
  const jobs = store.jobs
    .filter((job) => job.bookId === bookId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    bookId,
    totalChunks: chunks.length,
    readyChunks: chunks.filter((chunk) => chunk.status === 'ready').length,
    failedChunks: chunks.filter((chunk) => chunk.status === 'failed').length,
    pendingChunks: chunks.filter((chunk) => chunk.status === 'pending').length,
    latestJob: jobs[0] ?? null,
    manifests,
  };
}

export async function getTtsJob(jobId: string): Promise<TtsJob | null> {
  const store = await readStore();
  return store.jobs.find((job) => job.id === jobId) ?? null;
}

export async function resetTtsData(): Promise<void> {
  await writeStore(cloneStore(emptyStore));
  if (FileSystem.documentDirectory) {
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}tts`, { idempotent: true });
  }
}

export async function deleteTtsDataForBook(bookId: string): Promise<void> {
  await updateStore((store) => {
    store.jobs = store.jobs.filter((job) => job.bookId !== bookId);
    store.chunks = store.chunks.filter((chunk) => chunk.bookId !== bookId);
    store.manifests = store.manifests.filter((manifest) => manifest.bookId !== bookId);
  });

  if (FileSystem.documentDirectory) {
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}tts/${bookId}`, {
      idempotent: true,
    });
  }
}
