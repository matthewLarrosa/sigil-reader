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
  targetChars = 800,
  maxChars = targetChars,
): ReaderChunk[] {
  const sentences = normalizedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const chunks: ReaderChunk[] = [];
  let buffer = '';
  let startChar = 0;

  function pushChunk(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const endChar = startChar + trimmed.length;
    chunks.push({
      id: createId('chunk'),
      chapterId,
      index: chunks.length,
      text: trimmed,
      startChar,
      endChar,
    });
    startChar = endChar;
  }

  function splitLongSentence(sentence: string): string[] {
    if (sentence.length <= maxChars) {
      return [sentence];
    }

    const clauses = sentence.match(/[^,;:]+[,;:]?|[^,;:]+$/g) ?? [sentence];
    const parts: string[] = [];
    let clauseBuffer = '';

    for (const clause of clauses) {
      const nextClause = clause.trim();
      if (!nextClause) {
        continue;
      }

      if (clauseBuffer && clauseBuffer.length + nextClause.length + 1 > maxChars) {
        parts.push(clauseBuffer);
        clauseBuffer = nextClause;
      } else {
        clauseBuffer = `${clauseBuffer} ${nextClause}`.trim();
      }
    }

    if (clauseBuffer) {
      parts.push(clauseBuffer);
    }

    return parts.flatMap((part) => {
      if (part.length <= maxChars) {
        return [part];
      }

      const words = part.split(/\s+/);
      const wordParts: string[] = [];
      let wordBuffer = '';

      for (const word of words) {
        if (wordBuffer && wordBuffer.length + word.length + 1 > maxChars) {
          wordParts.push(wordBuffer);
          wordBuffer = word;
        } else {
          wordBuffer = `${wordBuffer} ${word}`.trim();
        }
      }

      if (wordBuffer) {
        wordParts.push(wordBuffer);
      }

      return wordParts;
    });
  }

  for (const sentence of sentences) {
    for (const next of splitLongSentence(sentence.trim())) {
      if (!next) {
        continue;
      }

      const nextBufferLength = buffer.length + next.length + 1;
      const wouldExceedHardCap = nextBufferLength > maxChars;
      const shouldPreferNewChunk = buffer.length >= targetChars && nextBufferLength > targetChars;

      if ((wouldExceedHardCap || shouldPreferNewChunk) && buffer.length > 0) {
        pushChunk(buffer);
        buffer = next;
      } else {
        buffer = `${buffer} ${next}`.trim();
      }
    }
  }

  if (buffer.length > 0) {
    pushChunk(buffer);
  }

  return chunks;
}
