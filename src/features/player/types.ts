export enum PlaybackState {
  IDLE = 'idle',
  PREPARING = 'preparing',
  PLAYING = 'playing',
  PAUSED = 'paused',
  BUFFERING = 'buffering',
  COMPLETED = 'completed',
}

export interface PlayerTrack {
  id: string;
  url: string;
  title: string;
  artist?: string;
  artwork?: string;
}

export interface PersistedPlaybackState {
  bookId: string;
  chapterId: string | null;
  chunkId: string | null;
  playbackPositionMs: number;
  playbackState: PlaybackState;
}

export interface PlayerService {
  setup(): Promise<void>;
  playQueue(tracks: PlayerTrack[]): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seekTo(positionSeconds: number): Promise<void>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
}
