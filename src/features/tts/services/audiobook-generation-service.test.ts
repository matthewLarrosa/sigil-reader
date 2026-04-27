import { Chapter } from '@/features/library/types';
import { filterAudiobookChaptersForNarration } from '@/features/tts/services/audiobook-chapters';

function chapter(id: string, title: string, text = ''): Chapter {
  return {
    id,
    book_id: 'book_1',
    order_index: 0,
    title,
    href: `${id}.xhtml`,
    html_content: '',
    text_content: text,
  };
}

describe('filterAudiobookChaptersForNarration', () => {
  it('skips preliminary pages before chapter 1', () => {
    const chapters = [
      chapter('cover', 'Cover'),
      chapter('toc', 'Contents'),
      chapter('chapter_1', 'Chapter 1'),
      chapter('chapter_2', 'Chapter 2'),
    ];

    expect(filterAudiobookChaptersForNarration(chapters).map((item) => item.id)).toEqual([
      'chapter_1',
      'chapter_2',
    ]);
  });

  it('does not treat a contents page mention as chapter 1', () => {
    const chapters = [
      chapter('toc', 'Contents', 'Chapter 1 The Beginning Chapter 2 The Road'),
      chapter('chapter_1', 'Chapter 1', 'Chapter 1 The Beginning'),
    ];

    expect(filterAudiobookChaptersForNarration(chapters).map((item) => item.id)).toEqual([
      'chapter_1',
    ]);
  });

  it('prefers a real chapter 1 title with a subtitle over earlier text mentions', () => {
    const chapters = [
      chapter('intro', 'Illustrations', 'Chapter 1 preview art and captions'),
      chapter('fake', 'Opening Notes', 'Chapter 1 is listed here before the story'),
      chapter('real', 'Chapter 1: Crimson', 'The story starts here.'),
      chapter('chapter_2', 'Chapter 2', 'The story continues.'),
    ];

    expect(filterAudiobookChaptersForNarration(chapters).map((item) => item.id)).toEqual([
      'real',
      'chapter_2',
    ]);
  });

  it('falls back to every chapter if no chapter 1 marker is found', () => {
    const chapters = [chapter('opening', 'Opening'), chapter('body', 'The Story')];

    expect(filterAudiobookChaptersForNarration(chapters)).toEqual(chapters);
  });
});
