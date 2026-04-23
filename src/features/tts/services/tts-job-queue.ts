import { TtsChunk, TtsJob, TtsJobScope } from '@/features/tts/types';
import { createId } from '@/utils/id';

const jobs: TtsJob[] = [];
const storedChunks: TtsChunk[] = [];

export async function enqueueTtsJob(bookId: string, scope: TtsJobScope): Promise<TtsJob> {
  const job: TtsJob = {
    id: createId('tts_job'),
    bookId,
    scope,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  jobs.unshift(job);
  return job;
}

export async function upsertTtsChunks(chunks: TtsChunk[]): Promise<void> {
  for (const chunk of chunks) {
    const index = storedChunks.findIndex((storedChunk) => storedChunk.id === chunk.id);
    if (index >= 0) {
      storedChunks[index] = chunk;
    } else {
      storedChunks.push(chunk);
    }
  }
}
