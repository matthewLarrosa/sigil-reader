import { getDatabase } from '@/db/client';
import { BookRepository } from '@/features/library/book-repository';
import {
  Book,
  Chapter,
  ParsedBookManifest,
  ParsingStatus,
  ReadingProgressRecord,
} from '@/features/library/types';

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return fallback;
  }
  return String(value);
}

function asNullableText(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return asText(value, '');
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const coerced = Number(value);
  return Number.isFinite(coerced) ? coerced : fallback;
}

export class SqliteBookRepository implements BookRepository {
  async listBooks(): Promise<Book[]> {
    const db = await getDatabase();
    return db.getAllAsync<Book>('SELECT * FROM books ORDER BY imported_at DESC;');
  }

  async getBookById(bookId: string): Promise<Book | null> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<Book>(
      'SELECT * FROM books WHERE id = ? LIMIT 1;',
      bookId,
    );
    return result ?? null;
  }

  async createImportedBook(params: {
    id: string;
    originalFilename: string;
    epubPath: string;
    importedAt: number;
  }): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO books
       (id, original_filename, title, author, cover_path, epub_path, language, imported_at, parsing_status, parse_error)
       VALUES (?, ?, NULL, NULL, NULL, ?, NULL, ?, 'pending', NULL);`,
      asText(params.id),
      asText(params.originalFilename, 'imported.epub'),
      asText(params.epubPath),
      asNumber(params.importedAt, Date.now()),
    );
  }

  async setParsingStatus(
    bookId: string,
    status: ParsingStatus,
    parseError?: string | null,
  ): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE books SET parsing_status = ?, parse_error = ? WHERE id = ?;',
      asText(status, 'failed'),
      asNullableText(parseError),
      asText(bookId),
    );
  }

  async updateBookMetadata(bookId: string, manifest: ParsedBookManifest): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE books
       SET title = ?, author = ?, language = ?, cover_path = ?
       WHERE id = ?;`,
      asText(manifest.title, 'Untitled'),
      asText(manifest.author, 'Unknown author'),
      asText(manifest.language, 'und'),
      asNullableText(manifest.coverPath),
      asText(bookId),
    );
  }

  async replaceChapters(bookId: string, chapters: ParsedBookManifest['chapters']): Promise<void> {
    const db = await getDatabase();
    await db.execAsync('BEGIN;');
    try {
      await db.runAsync('DELETE FROM chapters WHERE book_id = ?;', asText(bookId));
      for (const chapter of chapters) {
        await db.runAsync(
          `INSERT INTO chapters
          (id, book_id, order_index, title, href, html_content, text_content)
          VALUES (?, ?, ?, ?, ?, ?, ?);`,
          asText(chapter.id),
          asText(bookId),
          asNumber(chapter.order),
          asText(chapter.title, `Chapter ${asNumber(chapter.order) + 1}`),
          asText(chapter.href),
          asText(chapter.html),
          asText(chapter.text),
        );
      }
      await db.execAsync('COMMIT;');
    } catch (error) {
      await db.execAsync('ROLLBACK;');
      throw error;
    }
  }

  async listChapters(bookId: string): Promise<Chapter[]> {
    const db = await getDatabase();
    return db.getAllAsync<Chapter>(
      'SELECT * FROM chapters WHERE book_id = ? ORDER BY order_index ASC;',
      asText(bookId),
    );
  }

  async getChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<Chapter>(
      'SELECT * FROM chapters WHERE book_id = ? AND id = ? LIMIT 1;',
      asText(bookId),
      asText(chapterId),
    );

    return result ?? null;
  }

  async getAdjacentChapter(
    bookId: string,
    chapterId: string,
    direction: 'previous' | 'next',
  ): Promise<Chapter | null> {
    const db = await getDatabase();
    const current = await this.getChapter(bookId, chapterId);
    if (!current) {
      return null;
    }

    if (direction === 'previous') {
      const result = await db.getFirstAsync<Chapter>(
        `SELECT * FROM chapters
         WHERE book_id = ? AND order_index < ?
         ORDER BY order_index DESC
         LIMIT 1;`,
        asText(bookId),
        asNumber(current.order_index),
      );
      return result ?? null;
    }

    const result = await db.getFirstAsync<Chapter>(
      `SELECT * FROM chapters
       WHERE book_id = ? AND order_index > ?
       ORDER BY order_index ASC
       LIMIT 1;`,
      asText(bookId),
      asNumber(current.order_index),
    );
    return result ?? null;
  }

  async searchBook(bookId: string, query: string): Promise<Chapter[]> {
    const db = await getDatabase();
    return db.getAllAsync<Chapter>(
      `SELECT * FROM chapters
       WHERE book_id = ? AND text_content LIKE ?
       ORDER BY order_index ASC
       LIMIT 20;`,
      asText(bookId),
      `%${asText(query)}%`,
    );
  }

  async saveReadingProgress(progress: ReadingProgressRecord): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO reading_progress (book_id, chapter_id, progress_ratio, scroll_offset, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET
         chapter_id = excluded.chapter_id,
         progress_ratio = excluded.progress_ratio,
         scroll_offset = excluded.scroll_offset,
         updated_at = excluded.updated_at;`,
      asText(progress.book_id),
      asText(progress.chapter_id),
      asNumber(progress.progress_ratio),
      asNumber(progress.scroll_offset),
      asNumber(progress.updated_at, Date.now()),
    );
  }

  async getReadingProgress(bookId: string): Promise<ReadingProgressRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ReadingProgressRecord>(
      'SELECT * FROM reading_progress WHERE book_id = ? LIMIT 1;',
      asText(bookId),
    );
    return row ?? null;
  }

  async listContinueReading(limit = 5): Promise<ReadingProgressRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<ReadingProgressRecord>(
      `SELECT * FROM reading_progress
       ORDER BY updated_at DESC
       LIMIT ?;`,
      asNumber(limit, 5),
    );
  }

  async addBookmark(params: {
    id: string;
    bookId: string;
    chapterId: string;
    label: string;
    progressRatio: number;
    createdAt: number;
  }): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO bookmarks (id, book_id, chapter_id, label, progress_ratio, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      asText(params.id),
      asText(params.bookId),
      asText(params.chapterId),
      asText(params.label, 'Bookmark'),
      asNumber(params.progressRatio),
      asNumber(params.createdAt, Date.now()),
    );
  }
}

export const bookRepository = new SqliteBookRepository();
