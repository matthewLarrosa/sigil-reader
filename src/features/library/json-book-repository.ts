import * as FileSystem from 'expo-file-system/legacy';

import { BookRepository } from '@/features/library/book-repository';
import {
  AudiobookEntry,
  Book,
  Chapter,
  ChapterReadRecord,
  ParsedBookManifest,
  ParsingStatus,
  ReadingProgressRecord,
} from '@/features/library/types';

interface BookmarkRecord {
  id: string;
  book_id: string;
  chapter_id: string;
  label: string;
  progress_ratio: number;
  created_at: number;
}

interface LibraryStore {
  books: Book[];
  chapters: Chapter[];
  readingProgress: ReadingProgressRecord[];
  readChapters: ChapterReadRecord[];
  bookmarks: BookmarkRecord[];
  audiobooks: AudiobookEntry[];
}

const emptyStore: LibraryStore = {
  books: [],
  chapters: [],
  readingProgress: [],
  readChapters: [],
  bookmarks: [],
  audiobooks: [],
};

let operationQueue: Promise<void> = Promise.resolve();

function storePath(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('App document directory is unavailable on this device.');
  }

  return `${FileSystem.documentDirectory}sigil-library.json`;
}

function cloneStore(store: LibraryStore): LibraryStore {
  return {
    books: [...store.books],
    chapters: [...store.chapters],
    readingProgress: [...store.readingProgress],
    readChapters: [...store.readChapters],
    bookmarks: [...store.bookmarks],
    audiobooks: [...store.audiobooks],
  };
}

function queueStoreOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function readStore(): Promise<LibraryStore> {
  const path = storePath();
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    return cloneStore(emptyStore);
  }

  try {
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as Partial<LibraryStore>;
    return {
      books: parsed.books ?? [],
      chapters: parsed.chapters ?? [],
      readingProgress: parsed.readingProgress ?? [],
      readChapters: parsed.readChapters ?? [],
      bookmarks: parsed.bookmarks ?? [],
      audiobooks: parsed.audiobooks ?? [],
    };
  } catch {
    return cloneStore(emptyStore);
  }
}

async function writeStore(store: LibraryStore): Promise<void> {
  await FileSystem.writeAsStringAsync(storePath(), JSON.stringify(store));
}

async function updateStore<T>(updater: (store: LibraryStore) => T | Promise<T>): Promise<T> {
  return queueStoreOperation(async () => {
    const store = await readStore();
    const result = await updater(store);
    await writeStore(store);
    return result;
  });
}

export class JsonBookRepository implements BookRepository {
  async recoverInterruptedParses(): Promise<void> {
    await updateStore((store) => {
      store.books = store.books.map((book) =>
        book.parsing_status === 'parsing'
          ? {
              ...book,
              parsing_status: 'failed',
              parse_error: 'Parsing was interrupted. Please retry parse.',
            }
          : book,
      );
    });
  }

  async deleteBook(bookId: string): Promise<void> {
    await updateStore((store) => {
      store.books = store.books.filter((book) => book.id !== bookId);
      store.chapters = store.chapters.filter((chapter) => chapter.book_id !== bookId);
      store.readingProgress = store.readingProgress.filter((progress) => progress.book_id !== bookId);
      store.readChapters = store.readChapters.filter((chapter) => chapter.book_id !== bookId);
      store.bookmarks = store.bookmarks.filter((bookmark) => bookmark.book_id !== bookId);
      store.audiobooks = store.audiobooks.filter((entry) => entry.book_id !== bookId);
    });
  }

  async listBooks(): Promise<Book[]> {
    const store = await readStore();
    return [...store.books].sort((a, b) => b.imported_at - a.imported_at);
  }

  async getBookById(bookId: string): Promise<Book | null> {
    const store = await readStore();
    return store.books.find((book) => book.id === bookId) ?? null;
  }

  async createImportedBook(params: {
    id: string;
    originalFilename: string;
    epubPath: string;
    importedAt: number;
  }): Promise<void> {
    await updateStore((store) => {
      store.books = [
        {
          id: params.id,
          original_filename: params.originalFilename || 'imported.epub',
          title: null,
          author: null,
          cover_path: null,
          epub_path: params.epubPath,
          language: null,
          imported_at: params.importedAt || Date.now(),
          parsing_status: 'pending',
          parse_error: null,
        },
        ...store.books.filter((book) => book.id !== params.id),
      ];
    });
  }

  async setParsingStatus(
    bookId: string,
    status: ParsingStatus,
    parseError?: string | null,
  ): Promise<void> {
    await updateStore((store) => {
      store.books = store.books.map((book) =>
        book.id === bookId
          ? {
              ...book,
              parsing_status: status,
              parse_error: parseError ?? null,
            }
          : book,
      );
    });
  }

  async updateBookMetadata(bookId: string, manifest: ParsedBookManifest): Promise<void> {
    await updateStore((store) => {
      store.books = store.books.map((book) =>
        book.id === bookId
          ? {
              ...book,
              title: manifest.title,
              author: manifest.author,
              language: manifest.language,
              cover_path: manifest.coverPath,
            }
          : book,
      );
    });
  }

  async replaceChapters(bookId: string, chapters: ParsedBookManifest['chapters']): Promise<void> {
    await updateStore((store) => {
      const mapped: Chapter[] = chapters.map((chapter) => ({
        id: chapter.id,
        book_id: bookId,
        order_index: chapter.order,
        title: chapter.title,
        href: chapter.href,
        html_content: chapter.html,
        text_content: chapter.text,
      }));
      store.chapters = [
        ...store.chapters.filter((chapter) => chapter.book_id !== bookId),
        ...mapped,
      ];
    });
  }

  async listChapters(bookId: string): Promise<Chapter[]> {
    const store = await readStore();
    return store.chapters
      .filter((chapter) => chapter.book_id === bookId)
      .sort((a, b) => a.order_index - b.order_index);
  }

  async getChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
    const store = await readStore();
    return (
      store.chapters.find((chapter) => chapter.book_id === bookId && chapter.id === chapterId) ??
      null
    );
  }

  async getAdjacentChapter(
    bookId: string,
    chapterId: string,
    direction: 'previous' | 'next',
  ): Promise<Chapter | null> {
    const chapters = await this.listChapters(bookId);
    const index = chapters.findIndex((chapter) => chapter.id === chapterId);
    if (index < 0) {
      return null;
    }

    return chapters[direction === 'previous' ? index - 1 : index + 1] ?? null;
  }

  async searchBook(bookId: string, query: string): Promise<Chapter[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const chapters = await this.listChapters(bookId);
    return chapters
      .filter((chapter) => chapter.text_content.toLowerCase().includes(normalizedQuery))
      .slice(0, 20);
  }

  async saveReadingProgress(progress: ReadingProgressRecord): Promise<void> {
    await updateStore((store) => {
      store.readingProgress = [
        progress,
        ...store.readingProgress.filter((item) => item.book_id !== progress.book_id),
      ];
    });
  }

  async getReadingProgress(bookId: string): Promise<ReadingProgressRecord | null> {
    const store = await readStore();
    return store.readingProgress.find((progress) => progress.book_id === bookId) ?? null;
  }

  async listReadChapters(bookId: string): Promise<ChapterReadRecord[]> {
    const store = await readStore();
    return store.readChapters.filter((chapter) => chapter.book_id === bookId);
  }

  async markChapterRead(bookId: string, chapterId: string): Promise<void> {
    await updateStore((store) => {
      const exists = store.readChapters.some(
        (chapter) => chapter.book_id === bookId && chapter.chapter_id === chapterId,
      );
      if (exists) {
        return;
      }

      store.readChapters = [
        { book_id: bookId, chapter_id: chapterId, read_at: Date.now() },
        ...store.readChapters,
      ];
    });
  }

  async markChapterUnread(bookId: string, chapterId: string): Promise<void> {
    await updateStore((store) => {
      store.readChapters = store.readChapters.filter(
        (chapter) => !(chapter.book_id === bookId && chapter.chapter_id === chapterId),
      );
    });
  }

  async listContinueReading(limit = 5): Promise<ReadingProgressRecord[]> {
    const store = await readStore();
    return [...store.readingProgress]
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, limit);
  }

  async getContinueReadingItems(limit = 5): Promise<
    (ReadingProgressRecord & { bookTitle: string; chapterTitle: string })[]
  > {
    const store = await readStore();
    return [...store.readingProgress]
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, limit)
      .map((progress) => {
        const book = store.books.find((item) => item.id === progress.book_id);
        const chapter = store.chapters.find((item) => item.id === progress.chapter_id);

        return {
          ...progress,
          bookTitle: book?.title ?? book?.original_filename ?? 'Untitled book',
          chapterTitle: chapter?.title ?? 'Saved position',
        };
      });
  }

  async addBookmark(params: {
    id: string;
    bookId: string;
    chapterId: string;
    label: string;
    progressRatio: number;
    createdAt: number;
  }): Promise<void> {
    await updateStore((store) => {
      store.bookmarks = [
        {
          id: params.id,
          book_id: params.bookId,
          chapter_id: params.chapterId,
          label: params.label,
          progress_ratio: params.progressRatio,
          created_at: params.createdAt,
        },
        ...store.bookmarks,
      ];
    });
  }

  async listBookmarks(bookId: string): Promise<
    {
      id: string;
      chapterId: string;
      label: string;
      progressRatio: number;
      createdAt: number;
    }[]
  > {
    const store = await readStore();
    return store.bookmarks
      .filter((bookmark) => bookmark.book_id === bookId)
      .sort((a, b) => b.created_at - a.created_at)
      .map((bookmark) => ({
        id: bookmark.id,
        chapterId: bookmark.chapter_id,
        label: bookmark.label,
        progressRatio: bookmark.progress_ratio,
        createdAt: bookmark.created_at,
      }));
  }

  async addAudiobook(bookId: string): Promise<void> {
    await updateStore((store) => {
      if (store.audiobooks.some((entry) => entry.book_id === bookId)) {
        return;
      }

      store.audiobooks = [{ book_id: bookId, added_at: Date.now() }, ...store.audiobooks];
    });
  }

  async removeAudiobook(bookId: string): Promise<void> {
    await updateStore((store) => {
      store.audiobooks = store.audiobooks.filter((entry) => entry.book_id !== bookId);
    });
  }

  async listAudiobookEntries(): Promise<AudiobookEntry[]> {
    const store = await readStore();
    return [...store.audiobooks].sort((a, b) => b.added_at - a.added_at);
  }

  async listAudiobookBooks(): Promise<Book[]> {
    const store = await readStore();
    const booksById = new Map(store.books.map((book) => [book.id, book]));

    return [...store.audiobooks]
      .sort((a, b) => b.added_at - a.added_at)
      .map((entry) => booksById.get(entry.book_id))
      .filter((book): book is Book => Boolean(book));
  }

  async isAudiobook(bookId: string): Promise<boolean> {
    const store = await readStore();
    return store.audiobooks.some((entry) => entry.book_id === bookId);
  }

  async reset(): Promise<void> {
    await writeStore(cloneStore(emptyStore));
  }
}

export const bookRepository = new JsonBookRepository();
