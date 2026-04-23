import { PlaybackState, PlayerService, PlayerTrack } from '@/features/player/types';

type TrackPlayerModule = typeof import('react-native-track-player');

class TrackPlayerService implements PlayerService {
  private initialized = false;
  private module: TrackPlayerModule | null = null;

  private async getModule(): Promise<TrackPlayerModule | null> {
    if (this.module) {
      return this.module;
    }

    try {
      const mod = await import('react-native-track-player');
      if (!mod?.default) {
        return null;
      }
      this.module = mod;
      return mod;
    } catch {
      return null;
    }
  }

  async setup(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const mod = await this.getModule();
    if (!mod) {
      return;
    }

    const TrackPlayer = mod.default;
    const { Capability, Event, RepeatMode } = mod;
    if (!Capability || !Event || !RepeatMode) {
      return;
    }

    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SeekTo,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SeekTo,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      progressUpdateEventInterval: 1,
    });
    await TrackPlayer.setRepeatMode(RepeatMode.Off);

    TrackPlayer.addEventListener(Event.RemotePause, () => {
      void TrackPlayer.pause();
    });
    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      void TrackPlayer.play();
    });

    this.initialized = true;
  }

  async playQueue(tracks: PlayerTrack[]): Promise<void> {
    await this.setup();
    const mod = await this.getModule();
    if (!mod) {
      return;
    }
    const TrackPlayer = mod.default;
    await TrackPlayer.reset();
    await TrackPlayer.add(
      tracks.map((track) => ({
        id: track.id,
        url: track.url,
        title: track.title,
        artist: track.artist ?? 'Sigil Reader',
        artwork: track.artwork,
      })),
    );
    await TrackPlayer.play();
  }

  async pause(): Promise<void> {
    const mod = await this.getModule();
    if (!mod) {
      return;
    }
    const TrackPlayer = mod.default;
    await TrackPlayer.pause();
  }

  async resume(): Promise<void> {
    const mod = await this.getModule();
    if (!mod) {
      return;
    }
    const TrackPlayer = mod.default;
    await TrackPlayer.play();
  }

  async seekTo(positionSeconds: number): Promise<void> {
    const mod = await this.getModule();
    if (!mod) {
      return;
    }
    const TrackPlayer = mod.default;
    await TrackPlayer.seekTo(positionSeconds);
  }

  async skipToNext(): Promise<void> {
    const mod = await this.getModule();
    if (!mod) {
      return;
    }
    const TrackPlayer = mod.default;
    await TrackPlayer.skipToNext();
  }

  async skipToPrevious(): Promise<void> {
    const mod = await this.getModule();
    if (!mod) {
      return;
    }
    const TrackPlayer = mod.default;
    await TrackPlayer.skipToPrevious();
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

export const playerService: PlayerService = new TrackPlayerService();
