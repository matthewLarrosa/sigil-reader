# Kokoro TTS Integration

Sigil Reader uses a staged Kokoro integration so EPUB parsing, TTS chunking, model setup, and audio caching can be debugged independently.

## Current Flow

1. Add a parsed EPUB to `Audiobooks`.
2. Import a Kokoro ONNX model from the Audiobooks screen.
3. Import the default voice pack from the Audiobooks screen.
4. Use `Test Load` to verify the ONNX model can be opened by the native runtime.
5. Use `Prepare` on an audiobook to normalize the first chapter and persist deterministic TTS chunks.

The app stores TTS metadata in `sigil-tts.json` under the app document directory. Future generated audio files should live under `tts/{bookId}/{chapterId}`.

## Native Runtime

`onnxruntime-react-native` is installed and registered in `app.json`. This requires an Expo dev build or a prebuilt native app. Expo Go cannot load this native module.

## Synthesis Gate

Actual waveform synthesis is intentionally still gated. Kokoro needs more than an ONNX session:

- text normalization,
- tokenizer/phonemizer mapping,
- voice embedding loading,
- model input tensor construction,
- WAV/PCM output writing,
- chunk manifest updates.

Until that adapter is complete, chapter preparation records chunks as blocked with an actionable model/runtime message instead of pretending audio exists.

## Next Implementation Slice

1. Choose the exact Kokoro ONNX export and default English voice asset format.
2. Add tokenizer/phonemizer assets to the model pack.
3. Convert each `TtsChunk.text` into Kokoro input tensors.
4. Write synthesized chunk audio into the TTS cache directory.
5. Queue generated chunk files into `react-native-track-player`.
