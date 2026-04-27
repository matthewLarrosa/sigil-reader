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

  it('groups short sentences toward the target size', () => {
    const chunks = splitIntoTtsChunks(
      'chapter_1',
      [
        'One short sentence.',
        'Another short sentence.',
        'Third short sentence.',
        'Fourth short sentence.',
      ].join(' '),
      80,
      110,
    );

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('Fourth short sentence.');
  });

  it('splits very long sentences at the hard cap', () => {
    const chunks = splitIntoTtsChunks(
      'chapter_1',
      'This sentence has many words and keeps going without useful punctuation so the splitter needs to break it safely.',
      40,
      45,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 45)).toBe(true);
  });
});
