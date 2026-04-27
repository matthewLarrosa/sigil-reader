import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { KokoroModelAssetKind, KokoroModelStatus } from '@/features/tts/types';

const MODEL_FILENAME = 'kokoro.onnx';
const VOICE_FILENAME = 'default-voice.bin';
const VOICE_METADATA_FILENAME = 'voice.json';
const AMERICAN_VOICE_PATTERN = /^(?:af|am)_[a-z0-9_-]+\.bin$/i;

function modelDirectory(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('App document directory is unavailable on this device.');
  }

  return `${FileSystem.documentDirectory}kokoro`;
}

export function kokoroModelPath(): string {
  return `${modelDirectory()}/${MODEL_FILENAME}`;
}

export function kokoroVoicePath(): string {
  return `${modelDirectory()}/${VOICE_FILENAME}`;
}

function kokoroVoiceMetadataPath(): string {
  return `${modelDirectory()}/${VOICE_METADATA_FILENAME}`;
}

function isAmericanVoiceFilename(filename: string): boolean {
  return AMERICAN_VOICE_PATTERN.test(filename);
}

async function copyAssetToModelPack(
  uri: string,
  kind: KokoroModelAssetKind,
  sourceName: string,
): Promise<string> {
  await FileSystem.makeDirectoryAsync(modelDirectory(), { intermediates: true });
  const destination = kind === 'model' ? kokoroModelPath() : kokoroVoicePath();
  await FileSystem.copyAsync({ from: uri, to: destination });
  if (kind === 'voice') {
    await FileSystem.writeAsStringAsync(
      kokoroVoiceMetadataPath(),
      JSON.stringify({
        sourceName,
        installedAt: Date.now(),
      }),
    );
  }
  return destination;
}

async function hasFile(path: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(path);
  return info.exists && !info.isDirectory;
}

async function getInstalledVoiceName(): Promise<string | null> {
  const metadataPath = kokoroVoiceMetadataPath();
  const info = await FileSystem.getInfoAsync(metadataPath);
  if (!info.exists || info.isDirectory) {
    return null;
  }

  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(metadataPath)) as {
      sourceName?: string;
    };
    return parsed.sourceName ?? null;
  } catch {
    return null;
  }
}

export async function getKokoroModelStatus(runtimeInstalled: boolean): Promise<KokoroModelStatus> {
  const modelPath = kokoroModelPath();
  const voicePath = kokoroVoicePath();
  const [hasModel, hasVoice, voiceName] = await Promise.all([
    hasFile(modelPath),
    hasFile(voicePath),
    getInstalledVoiceName(),
  ]);
  const voiceIsAmerican = Boolean(voiceName && isAmericanVoiceFilename(voiceName));
  const missing = [
    ...(runtimeInstalled ? [] : ['ONNX native runtime']),
    ...(hasModel ? [] : ['Kokoro ONNX model']),
    ...(hasVoice ? [] : ['American Kokoro voice pack']),
  ];
  const readyForModelLoad = runtimeInstalled && hasModel;
  const readyForSynthesis = runtimeInstalled && hasModel && hasVoice;
  const voiceDescription = hasVoice
    ? voiceName
      ? voiceIsAmerican
        ? `American voice ${voiceName}`
        : `Non-American voice ${voiceName}; import an af_*.bin or am_*.bin voice for a US accent`
      : 'Voice pack source is unknown; import af_heart.bin, af_bella.bin, or am_puck.bin for a US accent'
    : null;

  return {
    modelPath,
    voicePath,
    hasModel,
    hasVoice,
    voiceName,
    voiceIsAmerican,
    runtimeInstalled,
    readyForModelLoad,
    readyForSynthesis,
    missing,
    message:
      missing.length === 0
        ? `Model assets are present and ready for local Kokoro synthesis. ${voiceDescription}.`
        : `Missing ${missing.join(', ')}.`,
  };
}

export async function pickAndInstallKokoroAsset(
  kind: KokoroModelAssetKind,
): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: '*/*',
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset.uri) {
    return null;
  }

  const assetName = asset.name ?? (kind === 'voice' ? 'unknown-voice.bin' : MODEL_FILENAME);
  if (kind === 'voice' && !isAmericanVoiceFilename(assetName)) {
    throw new Error(
      'Choose an American Kokoro voice file named af_*.bin or am_*.bin, such as af_heart.bin, af_bella.bin, or am_puck.bin.',
    );
  }

  return copyAssetToModelPack(asset.uri, kind, assetName);
}
