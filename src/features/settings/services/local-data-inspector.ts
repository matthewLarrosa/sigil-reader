import * as FileSystem from 'expo-file-system/legacy';

import { resetLocalSettings } from '@/config/local-settings';
import { libraryImportService } from '@/features/library/services/import-epub';
import { resetTtsData } from '@/features/tts/services/tts-job-queue';

export interface LocalDataFileSnapshot {
  label: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  raw: string | null;
}

export interface LocalDataDirectorySnapshot {
  label: string;
  path: string;
  exists: boolean;
  itemCount: number;
  sizeBytes: number | null;
}

export interface LocalDataSnapshot {
  documentDirectory: string | null;
  files: LocalDataFileSnapshot[];
  directories: LocalDataDirectorySnapshot[];
}

const DATA_FILES = [
  { label: 'Library', filename: 'sigil-library.json' },
  { label: 'TTS', filename: 'sigil-tts.json' },
  { label: 'Settings', filename: 'sigil-settings.json' },
];

const DATA_DIRECTORIES = [
  { label: 'Imported EPUBs', dirname: 'books' },
  { label: 'Generated audio', dirname: 'tts' },
  { label: 'Kokoro assets', dirname: 'kokoro' },
];

function dataPath(name: string): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('App document directory is unavailable on this device.');
  }

  return `${FileSystem.documentDirectory}${name}`;
}

async function getFileSize(path: string): Promise<number | null> {
  const info = await FileSystem.getInfoAsync(path);
  return info.exists && !info.isDirectory && 'size' in info ? info.size ?? null : null;
}

async function getDirectorySize(path: string): Promise<number | null> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || !info.isDirectory) {
    return null;
  }

  let total = 0;
  const pending = [path];

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) {
      continue;
    }

    const children = await FileSystem.readDirectoryAsync(directory);
    for (const child of children) {
      const childPath = `${directory}/${child}`;
      const childInfo = await FileSystem.getInfoAsync(childPath);
      if (!childInfo.exists) {
        continue;
      }
      if (childInfo.isDirectory) {
        pending.push(childPath);
      } else if ('size' in childInfo && typeof childInfo.size === 'number') {
        total += childInfo.size;
      }
    }
  }

  return total;
}

async function readFileSnapshot(label: string, path: string): Promise<LocalDataFileSnapshot> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.isDirectory) {
    return {
      label,
      path,
      exists: false,
      sizeBytes: null,
      raw: null,
    };
  }

  return {
    label,
    path,
    exists: true,
    sizeBytes: await getFileSize(path),
    raw: await FileSystem.readAsStringAsync(path),
  };
}

async function readDirectorySnapshot(
  label: string,
  path: string,
): Promise<LocalDataDirectorySnapshot> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || !info.isDirectory) {
    return {
      label,
      path,
      exists: false,
      itemCount: 0,
      sizeBytes: null,
    };
  }

  const children = await FileSystem.readDirectoryAsync(path);
  return {
    label,
    path,
    exists: true,
    itemCount: children.length,
    sizeBytes: await getDirectorySize(path),
  };
}

export async function getLocalDataSnapshot(): Promise<LocalDataSnapshot> {
  if (!FileSystem.documentDirectory) {
    return {
      documentDirectory: null,
      files: [],
      directories: [],
    };
  }

  const files = await Promise.all(
    DATA_FILES.map((file) => readFileSnapshot(file.label, dataPath(file.filename))),
  );
  const directories = await Promise.all(
    DATA_DIRECTORIES.map((directory) =>
      readDirectorySnapshot(directory.label, dataPath(directory.dirname)),
    ),
  );

  return {
    documentDirectory: FileSystem.documentDirectory,
    files,
    directories,
  };
}

export async function deleteGeneratedAudioData(): Promise<void> {
  await resetTtsData();
}

export async function deleteSettingsData(): Promise<void> {
  await resetLocalSettings();
}

export async function deleteAllLocalData(): Promise<void> {
  await libraryImportService.resetLocalData();
  await resetLocalSettings();
}
