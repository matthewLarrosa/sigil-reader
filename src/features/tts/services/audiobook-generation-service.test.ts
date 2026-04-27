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

function chapterWithMetadata(params: Partial<Chapter> & Pick<Chapter, 'id' | 'title'>): Chapter {
  return {
    id: params.id,
    book_id: 'book_1',
    order_index: 0,
    title: params.title,
    href: params.href ?? `${params.id}.xhtml`,
    html_content: params.html_content ?? '',
    text_content: params.text_content ?? '',
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

  it('skips table of contents pages even when they appear after chapter 1', () => {
    const chapters = [
      chapter('chapter_1', 'Chapter 1', 'The story starts here.'),
      chapter(
        'toc_late',
        'Table of Contents',
        'Chapter 1 Loomings 1 Chapter 2 The Carpet-Bag 12 Chapter 3 The Spouter-Inn 24',
      ),
      chapter('chapter_2', 'Chapter 2', 'The story continues.'),
    ];

    expect(filterAudiobookChaptersForNarration(chapters).map((item) => item.id)).toEqual([
      'chapter_1',
      'chapter_2',
    ]);
  });

  it('skips structural pages identified by href or EPUB nav markup', () => {
    const chapters = [
      chapter('chapter_1', 'Chapter 1', 'The story starts here.'),
      chapterWithMetadata({
        id: 'generated_toc',
        title: 'Chapter 2',
        href: 'Text/nav.xhtml',
        html_content: '<nav epub:type="toc"><ol><li>Chapter 1</li><li>Chapter 2</li></ol></nav>',
        text_content: 'Chapter 1 Chapter 2',
      }),
      chapter('chapter_2', 'Chapter 2', 'The story continues.'),
      chapterWithMetadata({
        id: 'back_index',
        title: 'Index',
        href: 'Text/backmatter.xhtml',
        text_content: 'Ahab 4 18 77 Ishmael 1 42 108',
      }),
    ];

    expect(filterAudiobookChaptersForNarration(chapters).map((item) => item.id)).toEqual([
      'chapter_1',
      'chapter_2',
    ]);
  });

  it('filters structural pages even without a chapter 1 marker', () => {
    const chapters = [
      chapter('cover', 'Cover'),
      chapter('contents', 'Contents', 'Chapter 1 Start 1 Chapter 2 Middle 8 Chapter 3 End 19'),
      chapter('opening', 'Opening', 'The story begins without a chapter marker.'),
      chapter('body', 'The Story', 'The story continues.'),
    ];

    expect(filterAudiobookChaptersForNarration(chapters).map((item) => item.id)).toEqual([
      'opening',
      'body',
    ]);
  });
});
