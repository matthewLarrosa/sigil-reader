export type TtsJobScope = 'selection' | 'chapter' | 'next_chapter' | 'full_book';
export type TtsJobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type TtsChunkStatus = 'pending' | 'ready' | 'failed';

export type KokoroModelAssetKind = 'model' | 'voice';

export interface KokoroModelStatus {
  modelPath: string;
  voicePath: string;
  hasModel: boolean;
  hasVoice: boolean;
  voiceName: string | null;
  voiceIsAmerican: boolean;
  runtimeInstalled: boolean;
  readyForModelLoad: boolean;
  readyForSynthesis: boolean;
  message: string;
  missing: string[];
}

export interface TtsChunk {
  id: string;
  bookId: string;
  chapterId: string;
  chunkIndex: number;
  text: string;
  startChar: number;
  endChar: number;
  audioPath: string | null;
  durationMs: number | null;
  status: TtsChunkStatus;
  error: string | null;
}

export interface TtsManifest {
  id: string;
  bookId: string;
  chapterId: string;
  totalChunks: number;
  totalDurationMs: number | null;
  synthesisVersion: number;
  updatedAt: number;
}

export interface TtsJob {
  id: string;
  bookId: string;
  scope: TtsJobScope;
  chapterId: string | null;
  status: TtsJobStatus;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
  totalChapters: number | null;
  completedChapters: number;
  currentChapterId: string | null;
  currentChapterTitle: string | null;
  totalChunks: number | null;
  completedChunks: number;
  readyChunks: number;
  failedChunks: number;
  createdAt: number;
  updatedAt: number;
}

export interface TtsBookSummary {
  bookId: string;
  totalChunks: number;
  readyChunks: number;
  failedChunks: number;
  pendingChunks: number;
  latestJob: TtsJob | null;
  manifests: TtsManifest[];
}

export interface TtsEngine {
  isAvailable(): Promise<boolean>;
  synthesize(
    text: string,
    options?: { voice?: string; rate?: number; outputPath?: string },
  ): Promise<{ audioPath: string; durationMs: number }>;
  cancel(jobId: string): Promise<void>;
}
