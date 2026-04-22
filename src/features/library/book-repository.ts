import {
  Book,
  Chapter,
  ParsedBookManifest,
  ParsingStatus,
  ReadingProgressRecord,
} from '@/features/library/types';

export interface BookRepository {
  listBooks(): Promise<Book[]>;
  getBookById(bookId: string): Promise<Book | null>;
  createImportedBook(params: {
    id: string;
    originalFilename: string;
    epubPath: string;
    importedAt: number;
  }): Promise<void>;
  setParsingStatus(
    bookId: string,
    status: ParsingStatus,
    parseError?: string | null,
  ): Promise<void>;
  updateBookMetadata(bookId: string, manifest: ParsedBookManifest): Promise<void>;
  replaceChapters(bookId: string, chapters: ParsedBookManifest['chapters']): Promise<void>;
  listChapters(bookId: string): Promise<Chapter[]>;
  getChapter(bookId: string, chapterId: string): Promise<Chapter | null>;
  getAdjacentChapter(
    bookId: string,
    chapterId: string,
    direction: 'previous' | 'next',
  ): Promise<Chapter | null>;
  searchBook(bookId: string, query: string): Promise<Chapter[]>;
  saveReadingProgress(progress: ReadingProgressRecord): Promise<void>;
  getReadingProgress(bookId: string): Promise<ReadingProgressRecord | null>;
  listContinueReading(limit?: number): Promise<ReadingProgressRecord[]>;
  addBookmark(params: {
    id: string;
    bookId: string;
    chapterId: string;
    label: string;
    progressRatio: number;
    createdAt: number;
  }): Promise<void>;
}
