import { Chapter } from '@/features/library/types';

const FIRST_CHAPTER_PATTERN = /^chapter\s+(?:1|one|i)\b/i;
const PRELIMINARY_TITLE_PATTERN = /\b(?:contents|table of contents|toc|cover|copyright|title page)\b/i;

function isFirstChapterTitle(title: string): boolean {
  return FIRST_CHAPTER_PATTERN.test(title.trim());
}

function isPreliminaryTitle(title: string): boolean {
  return PRELIMINARY_TITLE_PATTERN.test(title.trim());
}

function isFirstChapterText(chapter: Pick<Chapter, 'title' | 'text_content'>): boolean {
  const title = chapter.title.trim();
  if (isPreliminaryTitle(title)) {
    return false;
  }

  const textPreview = chapter.text_content.slice(0, 240).trim();
  return FIRST_CHAPTER_PATTERN.test(textPreview);
}

export function filterAudiobookChaptersForNarration(chapters: Chapter[]): Chapter[] {
  const firstChapterIndexByTitle = chapters.findIndex((chapter) =>
    isFirstChapterTitle(chapter.title),
  );
  const firstChapterIndex =
    firstChapterIndexByTitle >= 0
      ? firstChapterIndexByTitle
      : chapters.findIndex(isFirstChapterText);

  return firstChapterIndex >= 0 ? chapters.slice(firstChapterIndex) : chapters;
}
