import { Chapter } from '@/features/library/types';

const FIRST_CHAPTER_PATTERN = /^chapter\s+(?:1|one|i)\b/i;
const STRUCTURAL_TITLE_PATTERN =
  /\b(?:about the author|acknowledgements?|bibliography|contents|copyright|cover|endnotes?|footnotes?|glossary|guide|half title|illustrations?|index|landmarks|list of (?:figures|illustrations|tables)|nav(?:igation)?|notes|table of contents|title page|toc)\b/i;
const STRUCTURAL_HREF_PATTERN =
  /(?:^|[/_-])(?:acknowledgements?|bibliography|contents?|copyright|cover|endnotes?|footnotes?|glossary|guide|index|landmarks|nav(?:igation)?|notes?|toc|titlepage)(?:[/_.-]|$)/i;
const STRUCTURAL_HTML_PATTERN =
  /(?:epub:type|role|type)=["'][^"']*(?:toc|cover|copyright|endnotes?|footnotes?|glossary|index|landmarks|nav(?:igation)?|notes)[^"']*["']|<nav\b[^>]*(?:epub:type=["']toc["']|role=["']doc-toc["'])/i;
const CHAPTER_REFERENCE_PATTERN = /\bchapter\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi;

function isFirstChapterTitle(title: string): boolean {
  return FIRST_CHAPTER_PATTERN.test(title.trim());
}

function isStructuralTitle(title: string): boolean {
  return STRUCTURAL_TITLE_PATTERN.test(title.trim());
}

function isFirstChapterText(chapter: Pick<Chapter, 'title' | 'text_content'>): boolean {
  const title = chapter.title.trim();
  if (isStructuralTitle(title)) {
    return false;
  }

  const textPreview = chapter.text_content.slice(0, 240).trim();
  return FIRST_CHAPTER_PATTERN.test(textPreview);
}

function looksLikeTableOfContentsText(text: string): boolean {
  const compactText = text.replace(/\s+/g, ' ').trim();
  if (compactText.length === 0 || compactText.length > 1800) {
    return false;
  }

  const chapterReferences = compactText.match(CHAPTER_REFERENCE_PATTERN) ?? [];
  if (chapterReferences.length < 3) {
    return false;
  }

  const dottedPageLeaders = (compactText.match(/\.{2,}\s*\d+/g) ?? []).length;
  const pageNumberEntries = (compactText.match(/\b(?:chapter\s+)?(?:\d+|[ivxlcdm]+)\b[^.!?]{0,80}\b\d{1,4}\b/gi) ?? []).length;
  return dottedPageLeaders > 0 || pageNumberEntries >= 3 || compactText.length < 700;
}

function isStructuralChapter(chapter: Chapter): boolean {
  if (isFirstChapterTitle(chapter.title)) {
    return false;
  }

  return (
    isStructuralTitle(chapter.title) ||
    STRUCTURAL_HREF_PATTERN.test(chapter.href) ||
    STRUCTURAL_HTML_PATTERN.test(chapter.html_content) ||
    looksLikeTableOfContentsText(chapter.text_content)
  );
}

export function filterAudiobookChaptersForNarration(chapters: Chapter[]): Chapter[] {
  const firstChapterIndexByTitle = chapters.findIndex((chapter) =>
    !isStructuralChapter(chapter) && isFirstChapterTitle(chapter.title),
  );
  const firstChapterIndex =
    firstChapterIndexByTitle >= 0
      ? firstChapterIndexByTitle
      : chapters.findIndex((chapter) => !isStructuralChapter(chapter) && isFirstChapterText(chapter));

  const candidateChapters = firstChapterIndex >= 0 ? chapters.slice(firstChapterIndex) : chapters;
  return candidateChapters.filter((chapter) => !isStructuralChapter(chapter));
}
