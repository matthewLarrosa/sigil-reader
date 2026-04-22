import {
  normalizeChapterText,
  splitIntoTtsChunks,
} from '@/features/reader/services/text-normalization';

describe('text normalization', () => {
  it('normalizes abbreviations and spacing', () => {
    const normalized = normalizeChapterText('Dr.  Smith  said  hello  .');
    expect(normalized).toBe('Doctor Smith said hello.');
  });

  it('splits into deterministic chunks', () => {
    const chunks = splitIntoTtsChunks(
      'chapter_1',
      'One short sentence. Another short sentence. Third short sentence.',
      25,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chapterId).toBe('chapter_1');
    expect(chunks[0].text.length).toBeLessThanOrEqual(25);
  });
});
