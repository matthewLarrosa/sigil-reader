import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';

import { PlaybackState, PlayerService, PlayerTrack } from '@/features/player/types';

type AudioSubscription = {
  remove(): void;
};

class ExpoAudioPlayerService implements PlayerService {
  private initialized = false;
  private player: AudioPlayer | null = null;
  private queue: PlayerTrack[] = [];
  private currentIndex = 0;
  private playbackState = PlaybackState.IDLE;
  private statusSubscription: AudioSubscription | null = null;

  private async ensurePlayer(): Promise<AudioPlayer> {
    if (this.player) {
      return this.player;
    }

    const player = createAudioPlayer(null, {
      updateInterval: 250,
      keepAudioSessionActive: true,
    });

    this.statusSubscription?.remove();
    this.statusSubscription = player.addListener?.('playbackStatusUpdate', (status: AudioStatus) => {
      void this.handleStatusUpdate(status);
    }) as AudioSubscription | null;

    this.player = player;
    return player;
  }

  private async handleStatusUpdate(status: AudioStatus): Promise<void> {
    if (status.didJustFinish) {
      if (this.currentIndex < this.queue.length - 1) {
        await this.loadTrack(this.currentIndex + 1, true);
      } else {
        this.playbackState = PlaybackState.COMPLETED;
      }
      return;
    }

    if (status.isBuffering) {
      this.playbackState = PlaybackState.BUFFERING;
      return;
    }

    if (status.playing) {
      this.playbackState = PlaybackState.PLAYING;
      return;
    }

    if (status.isLoaded && status.currentTime > 0) {
      this.playbackState = PlaybackState.PAUSED;
    }
  }

  private async loadTrack(index: number, autoplay: boolean): Promise<void> {
    const track = this.queue[index];
    if (!track) {
      throw new Error('No audio track is available for playback.');
    }

    const player = await this.ensurePlayer();
    this.currentIndex = index;
    this.playbackState = PlaybackState.PREPARING;

    player.replace({ uri: track.url });
    player.setActiveForLockScreen(
      true,
      {
        title: track.title,
        artist: track.artist,
        artworkUrl: track.artwork,
      },
      {
        showSeekBackward: true,
        showSeekForward: true,
      },
    );

    if (autoplay) {
      player.play();
      this.playbackState = PlaybackState.PLAYING;
    }
  }

  async setup(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    });
    await this.ensurePlayer();
    this.initialized = true;
  }

  async playQueue(tracks: PlayerTrack[]): Promise<void> {
    if (tracks.length === 0) {
      throw new Error('No audio tracks were queued for playback.');
    }

    await this.setup();
    this.queue = tracks;
    await this.loadTrack(0, true);
  }

  async pause(): Promise<void> {
    const player = await this.ensurePlayer();
    player.pause();
    this.playbackState = PlaybackState.PAUSED;
  }

  async resume(): Promise<void> {
    const player = await this.ensurePlayer();
    player.play();
    this.playbackState = PlaybackState.PLAYING;
  }

  async seekTo(positionSeconds: number): Promise<void> {
    const player = await this.ensurePlayer();
    await player.seekTo(positionSeconds);
  }

  async skipToNext(): Promise<void> {
    if (this.currentIndex >= this.queue.length - 1) {
      return;
    }

    await this.loadTrack(this.currentIndex + 1, true);
  }

  async skipToPrevious(): Promise<void> {
    if (this.currentIndex <= 0) {
      const player = await this.ensurePlayer();
      await player.seekTo(0);
      return;
    }

    await this.loadTrack(this.currentIndex - 1, true);
  }
}

export async function persistPlaybackState(params: {
  bookId: string;
  chapterId: string | null;
  chunkId: string | null;
  playbackPositionMs: number;
  playbackState: PlaybackState;
}): Promise<void> {
  void params;
}

export const playerService: PlayerService = new ExpoAudioPlayerService();
