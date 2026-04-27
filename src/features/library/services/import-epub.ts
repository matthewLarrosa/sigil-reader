import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { bookRepository } from '@/features/library/json-book-repository';
import { epubParserService } from '@/features/library/services/epub-parser-service';
import { deleteTtsDataForBook, resetTtsData } from '@/features/tts/services/tts-job-queue';
import { createId } from '@/utils/id';

const PARSE_TIMEOUT_MS = 90_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export class LibraryImportService {
  private parseQueue: Promise<void> = Promise.resolve();

  async pickAndImportEpubs(): Promise<string[]> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/epub+zip',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled || result.assets.length === 0) {
      return [];
    }

    const importedIds: string[] = [];
    for (const asset of result.assets) {
      const originalFilename = asset.name ?? 'imported.epub';
      const extension = originalFilename.toLowerCase().split('.').pop();
      if (extension !== 'epub') {
        continue;
      }
      if (!asset.uri) {
        continue;
      }
      if (!FileSystem.documentDirectory) {
        throw new Error('App document directory is unavailable on this device.');
      }

      const bookId = createId('book');
      const bookDir = `${FileSystem.documentDirectory}books/${bookId}`;
      const epubPath = `${bookDir}/source.epub`;
      await FileSystem.makeDirectoryAsync(bookDir, { intermediates: true });
      await FileSystem.copyAsync({
        from: asset.uri,
        to: epubPath,
      });

      await bookRepository.createImportedBook({
        id: bookId,
        originalFilename,
        epubPath,
        importedAt: Date.now(),
      });
      importedIds.push(bookId);
      this.enqueueParse(bookId, epubPath);
    }

    if (importedIds.length === 0) {
      throw new Error('No valid .epub files were selected.');
    }

    return importedIds;
  }

  async retryParse(bookId: string): Promise<void> {
    const book = await bookRepository.getBookById(bookId);
    if (!book) {
      throw new Error('Book not found.');
    }

    this.enqueueParse(book.id, book.epub_path);
  }

  async removeBook(bookId: string): Promise<void> {
    const book = await bookRepository.getBookById(bookId);
    if (!book) {
      return;
    }

    await bookRepository.deleteBook(bookId);
    await deleteTtsDataForBook(bookId);
    const bookDir = book.epub_path.replace(/\/source\.epub$/i, '').replace(/\\source\.epub$/i, '');
    if (bookDir) {
      await FileSystem.deleteAsync(bookDir, { idempotent: true });
    }
  }

  async resetLocalData(): Promise<void> {
    await bookRepository.reset();
    await resetTtsData();

    if (FileSystem.documentDirectory) {
      const booksPath = `${FileSystem.documentDirectory}books`;
      await FileSystem.deleteAsync(booksPath, { idempotent: true });
      await FileSystem.makeDirectoryAsync(booksPath, { intermediates: true });
    }
  }

  private enqueueParse(bookId: string, epubPath: string): void {
    this.parseQueue = this.parseQueue
      .then(() => this.parseBook(bookId, epubPath))
      .catch(() => undefined);
  }

  private async parseBook(bookId: string, epubPath: string): Promise<void> {
    await bookRepository.setParsingStatus(bookId, 'parsing');
    try {
      const manifest = await withTimeout(
        epubParserService.parseEpub(bookId, epubPath),
        PARSE_TIMEOUT_MS,
        'Parsing timed out. Please retry parse.',
      );
      await bookRepository.updateBookMetadata(bookId, manifest);
      await bookRepository.replaceChapters(bookId, manifest.chapters);
      await bookRepository.setParsingStatus(bookId, 'ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parse failure';
      await bookRepository.setParsingStatus(bookId, 'failed', message);
      throw error;
    }
  }
}

export const libraryImportService = new LibraryImportService();
