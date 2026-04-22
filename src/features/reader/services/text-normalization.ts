import { ReaderChunk } from '@/features/reader/types';
import { createId } from '@/utils/id';

const ABBREVIATION_MAP: [RegExp, string][] = [
  [/\bDr\./g, 'Doctor'],
  [/\bMr\./g, 'Mister'],
  [/\bMrs\./g, 'Misses'],
  [/\betc\./gi, 'etcetera'],
];

export function normalizeChapterText(rawText: string): string {
  let normalized = rawText.replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of ABBREVIATION_MAP) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(/\s+([,.;!?])/g, '$1');
  return normalized;
}

export function splitIntoTtsChunks(
  chapterId: string,
  normalizedText: string,
  maxChars = 300,
): ReaderChunk[] {
  const sentences = normalizedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const chunks: ReaderChunk[] = [];
  let buffer = '';
  let startChar = 0;

  for (const sentence of sentences) {
    const next = sentence.trim();
    if (!next) {
      continue;
    }

    if (buffer.length + next.length + 1 > maxChars && buffer.length > 0) {
      const endChar = startChar + buffer.length;
      chunks.push({
        id: createId('chunk'),
        chapterId,
        index: chunks.length,
        text: buffer.trim(),
        startChar,
        endChar,
      });
      startChar = endChar;
      buffer = next;
    } else {
      buffer = `${buffer} ${next}`.trim();
    }
  }

  if (buffer.length > 0) {
    chunks.push({
      id: createId('chunk'),
      chapterId,
      index: chunks.length,
      text: buffer.trim(),
      startChar,
      endChar: startChar + buffer.length,
    });
  }

  return chunks;
}
