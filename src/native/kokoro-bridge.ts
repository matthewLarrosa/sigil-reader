import { TtsEngine } from '@/features/tts/types';

class KokoroBridge implements TtsEngine {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async synthesize(): Promise<{ audioPath: string; durationMs: number }> {
    throw new Error(
      'Kokoro native bridge is not wired yet. Stage 7 dev-build integration required.',
    );
  }

  async cancel(): Promise<void> {
    return Promise.resolve();
  }
}

export const kokoroBridge: TtsEngine = new KokoroBridge();
