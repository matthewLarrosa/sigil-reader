import { fromByteArray, toByteArray } from 'base64-js';
import * as FileSystem from 'expo-file-system/legacy';

import { getKokoroModelStatus, kokoroModelPath } from '@/features/tts/services/kokoro-model-pack';
import { normalizeTextToPhonemes, tokenizeKokoroPhonemes } from '@/features/tts/services/kokoro-text';
import { KokoroModelStatus, TtsEngine } from '@/features/tts/types';

type OnnxRuntimeModule = typeof import('onnxruntime-react-native');
type OnnxRuntimeCommonModule = typeof import('onnxruntime-common');
type InferenceSessionFactory = {
  create(
    modelPath: string,
    options?: { executionProviders?: readonly string[] },
  ): Promise<{
    release?: () => Promise<void>;
    run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array | Promise<Float32Array> }>>;
    inputMetadata?: readonly { name: string; type?: string }[];
    outputNames?: readonly string[];
  }>;
};

const OUTPUT_SAMPLE_RATE = 24000;

function writePcmWavHeader(view: DataView, dataLength: number, sampleRate: number): void {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataLength, true);
}

function encodeFloat32ToWav(audio: Float32Array, sampleRate: number): Uint8Array {
  const dataLength = audio.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  writePcmWavHeader(view, dataLength, sampleRate);

  for (let index = 0; index < audio.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, audio[index] ?? 0));
    view.setInt16(44 + index * 2, sample * 32767, true);
  }

  return new Uint8Array(buffer);
}

function decodeBase64ToFloat32Array(base64: string): Float32Array {
  const bytes = toByteArray(base64);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Float32Array(arrayBuffer);
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  return fromByteArray(bytes);
}

async function ensureDirectoryForFile(path: string): Promise<void> {
  const directory = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  if (!directory) {
    return;
  }

  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
}

class KokoroBridge implements TtsEngine {
  private runtime: OnnxRuntimeModule | null | undefined;
  private commonRuntime: OnnxRuntimeCommonModule | null | undefined;
  private session:
    | {
        release?: () => Promise<void>;
        run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array | Promise<Float32Array> }>>;
        inputMetadata?: readonly { name: string; type?: string }[];
        outputNames?: readonly string[];
      }
    | null = null;
  private loadedVoice: Float32Array | null = null;

  private async getRuntime(): Promise<OnnxRuntimeModule | null> {
    if (this.runtime !== undefined) {
      return this.runtime;
    }

    try {
      this.runtime = await import('onnxruntime-react-native');
    } catch {
      this.runtime = null;
    }

    return this.runtime;
  }

  private async getCommonRuntime(): Promise<OnnxRuntimeCommonModule | null> {
    if (this.commonRuntime !== undefined) {
      return this.commonRuntime;
    }

    try {
      this.commonRuntime = await import('onnxruntime-common');
    } catch {
      this.commonRuntime = null;
    }

    return this.commonRuntime;
  }

  private async ensureNativeBackendRegistered(): Promise<string[]> {
    const runtime = await this.getRuntime();
    const supportedBackends = runtime?.listSupportedBackends?.() ?? [];
    return supportedBackends.map((backend) => backend.name);
  }

  private async getInferenceSessionFactory(): Promise<InferenceSessionFactory | null> {
    const runtime = await this.getRuntime();
    const commonRuntime = await this.getCommonRuntime();
    const candidate = {
      ...(runtime ?? {}),
      ...(commonRuntime ?? {}),
    } as unknown as {
      InferenceSession?: InferenceSessionFactory;
      default?: { InferenceSession?: InferenceSessionFactory };
    };

    return candidate.InferenceSession ?? candidate.default?.InferenceSession ?? null;
  }

  async getStatus(): Promise<KokoroModelStatus> {
    const runtime = await this.getRuntime();
    return getKokoroModelStatus(Boolean(runtime));
  }

  private async getTensorConstructor(): Promise<OnnxRuntimeCommonModule['Tensor']> {
    const commonRuntime = await this.getCommonRuntime();
    if (!commonRuntime?.Tensor) {
      throw new Error('ONNX Runtime Tensor constructor is unavailable in this build.');
    }

    return commonRuntime.Tensor;
  }

  private async getSession(): Promise<NonNullable<KokoroBridge['session']>> {
    if (this.session) {
      return this.session;
    }

    const status = await this.getStatus();
    if (!status.readyForModelLoad) {
      throw new Error(status.message);
    }

    const backends = await this.ensureNativeBackendRegistered();
    if (backends.length === 0) {
      throw new Error(
        'ONNX Runtime native module loaded, but it reported no supported execution backends. Rebuild the native app after installing onnxruntime-react-native.',
      );
    }

    const inferenceSession = await this.getInferenceSessionFactory();
    if (!inferenceSession?.create) {
      throw new Error(
        'ONNX Runtime loaded, but InferenceSession.create was not exported by onnxruntime-common.',
      );
    }

    this.session = await inferenceSession.create(kokoroModelPath(), {
      executionProviders: [backends[0]],
    });

    return this.session;
  }

  private async getVoiceEmbedding(): Promise<Float32Array> {
    if (this.loadedVoice) {
      return this.loadedVoice;
    }

    const status = await this.getStatus();
    if (!status.readyForSynthesis) {
      throw new Error(status.message);
    }

    const base64 = await FileSystem.readAsStringAsync(status.voicePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    this.loadedVoice = decodeBase64ToFloat32Array(base64);
    return this.loadedVoice;
  }

  private createInputIdTensor = async (inputIds: number[], inputType?: string) => {
    const Tensor = await this.getTensorConstructor();
    if (inputType === 'int32') {
      return new Tensor('int32', Int32Array.from(inputIds), [1, inputIds.length]);
    }

    return new Tensor(
      'int64',
      BigInt64Array.from(inputIds.map((value) => BigInt(value))),
      [1, inputIds.length],
    );
  };

  async canLoadModel(): Promise<{ ok: boolean; message: string }> {
    try {
      const session = await this.getSession();
      await session.release?.();
      this.session = null;
      return {
        ok: true,
        message: 'Kokoro ONNX model loaded successfully.',
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unable to load Kokoro model.',
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    const status = await this.getStatus();
    return status.readyForSynthesis;
  }

  async synthesize(
    text: string,
    options?: { voice?: string; rate?: number; outputPath?: string },
  ): Promise<{ audioPath: string; durationMs: number }> {
    if (!FileSystem.documentDirectory) {
      throw new Error('App document directory is unavailable on this device.');
    }

    const status = await this.getStatus();
    if (!status.readyForSynthesis) {
      throw new Error(status.message);
    }

    const session = await this.getSession();
    const voiceEmbedding = await this.getVoiceEmbedding();
    const phonemes = await normalizeTextToPhonemes(text, 'a');
    const inputIds = tokenizeKokoroPhonemes(phonemes);
    if (inputIds.length <= 2) {
      throw new Error('Kokoro could not tokenize this text into a playable utterance.');
    }

    const styleOffset = 256 * Math.min(Math.max(inputIds.length - 2, 0), 509);
    const styleSlice = voiceEmbedding.slice(styleOffset, styleOffset + 256);
    if (styleSlice.length !== 256) {
      throw new Error('The selected Kokoro voice pack is not compatible with this model.');
    }

    const Tensor = await this.getTensorConstructor();
    const inputType = session.inputMetadata?.find((metadata) => metadata.name === 'input_ids')?.type;
    const feeds: Record<string, unknown> = {
      input_ids: await this.createInputIdTensor(inputIds, inputType),
      style: new Tensor('float32', styleSlice, [1, 256]),
      speed: new Tensor('float32', [options?.rate ?? 1], [1]),
    };

    const outputs = await session.run(feeds);
    const outputName = session.outputNames?.[0] ?? Object.keys(outputs)[0];
    const waveformTensor = outputs[outputName];
    if (!waveformTensor) {
      throw new Error('Kokoro inference completed without an audio output tensor.');
    }

    const waveformData = waveformTensor.data instanceof Float32Array
      ? waveformTensor.data
      : await waveformTensor.data;
    if (!(waveformData instanceof Float32Array) || waveformData.length === 0) {
      throw new Error('Kokoro returned an empty waveform.');
    }

    const outputPath =
      options?.outputPath ?? `${FileSystem.documentDirectory}tts-preview-${Date.now()}.wav`;
    const wavBytes = encodeFloat32ToWav(waveformData, OUTPUT_SAMPLE_RATE);
    const base64 = encodeBytesToBase64(wavBytes);

    await ensureDirectoryForFile(outputPath);
    await FileSystem.writeAsStringAsync(outputPath, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return {
      audioPath: outputPath,
      durationMs: Math.round((waveformData.length / OUTPUT_SAMPLE_RATE) * 1000),
    };
  }

  async cancel(): Promise<void> {
    return Promise.resolve();
  }
}

export const kokoroBridge = new KokoroBridge();
