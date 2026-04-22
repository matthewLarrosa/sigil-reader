export type TtsJobScope = 'selection' | 'chapter' | 'next_chapter' | 'full_book';
export type TtsJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TtsChunkStatus = 'pending' | 'ready' | 'failed';

export interface TtsChunk {
  id: string;
  bookId: string;
  chapterId: string;
  chunkIndex: number;
  text: string;
  audioPath: string | null;
  durationMs: number | null;
  status: TtsChunkStatus;
}

export interface TtsManifest {
  id: string;
  bookId: string;
  chapterId: string;
  totalChunks: number;
  totalDurationMs: number | null;
  updatedAt: number;
}

export interface TtsJob {
  id: string;
  bookId: string;
  scope: TtsJobScope;
  status: TtsJobStatus;
  createdAt: number;
  updatedAt: number;
}

export interface TtsEngine {
  isAvailable(): Promise<boolean>;
  synthesize(
    text: string,
    options?: { voice?: string; rate?: number },
  ): Promise<{ audioPath: string; durationMs: number }>;
  cancel(jobId: string): Promise<void>;
}
