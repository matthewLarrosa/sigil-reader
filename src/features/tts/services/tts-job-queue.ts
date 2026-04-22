import { getDatabase } from '@/db/client';
import { TtsChunk, TtsJob, TtsJobScope } from '@/features/tts/types';
import { createId } from '@/utils/id';

export async function enqueueTtsJob(bookId: string, scope: TtsJobScope): Promise<TtsJob> {
  const db = await getDatabase();
  const job: TtsJob = {
    id: createId('tts_job'),
    bookId,
    scope,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.runAsync(
    `INSERT INTO tts_jobs (id, book_id, scope, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    job.id,
    job.bookId,
    job.scope,
    job.status,
    job.createdAt,
    job.updatedAt,
  );

  return job;
}

export async function upsertTtsChunks(chunks: TtsChunk[]): Promise<void> {
  const db = await getDatabase();
  await db.execAsync('BEGIN;');
  try {
    for (const chunk of chunks) {
      await db.runAsync(
        `INSERT INTO tts_chunks
          (id, book_id, chapter_id, chunk_index, text, audio_path, duration_ms, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           audio_path = excluded.audio_path,
           duration_ms = excluded.duration_ms,
           status = excluded.status;`,
        chunk.id,
        chunk.bookId,
        chunk.chapterId,
        chunk.chunkIndex,
        chunk.text,
        chunk.audioPath,
        chunk.durationMs,
        chunk.status,
      );
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}
