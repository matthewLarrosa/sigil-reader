import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { epubParserService } from '@/features/library/services/epub-parser-service';
import { bookRepository } from '@/features/library/sqlite-book-repository';
import { createId } from '@/utils/id';

export class LibraryImportService {
  async pickAndImportEpub(): Promise<string | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/epub+zip',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const originalFilename = asset.name ?? 'imported.epub';
    const extension = originalFilename.toLowerCase().split('.').pop();
    if (extension !== 'epub') {
      throw new Error('Only .epub files are supported.');
    }
    if (!asset.uri) {
      throw new Error('Imported file URI is missing.');
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

    await this.parseBook(bookId, epubPath);
    return bookId;
  }

  async retryParse(bookId: string): Promise<void> {
    const book = await bookRepository.getBookById(bookId);
    if (!book) {
      throw new Error('Book not found.');
    }

    await this.parseBook(book.id, book.epub_path);
  }

  private async parseBook(bookId: string, epubPath: string): Promise<void> {
    await bookRepository.setParsingStatus(bookId, 'parsing');
    try {
      const manifest = await epubParserService.parseEpub(bookId, epubPath);
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
