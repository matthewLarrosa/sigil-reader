import * as FileSystem from 'expo-file-system/legacy';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';

import { ParsedBookManifest, ParsedChapter } from '@/features/library/types';
import { createId } from '@/utils/id';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: '',
  trimValues: true,
});

export interface EpubParserService {
  parseEpub(bookId: string, epubPath: string): Promise<ParsedBookManifest>;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function nodeText(value: unknown): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'object' && value !== null && '#text' in value) {
    return String((value as Record<string, unknown>)['#text']).trim();
  }
  return '';
}

export function resolveRelativePath(baseFilePath: string, relativePath: string): string {
  if (!relativePath) {
    return '';
  }

  if (relativePath.startsWith('/')) {
    return relativePath.slice(1);
  }

  const baseParts = baseFilePath.split('/').filter(Boolean);
  baseParts.pop();
  const relativeParts = relativePath.split('/').filter(Boolean);

  for (const part of relativeParts) {
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      baseParts.pop();
      continue;
    }
    baseParts.push(part);
  }

  return baseParts.join('/');
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class JsEpubParserService implements EpubParserService {
  async parseEpub(bookId: string, epubPath: string): Promise<ParsedBookManifest> {
    const base64 = await FileSystem.readAsStringAsync(epubPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const zip = await JSZip.loadAsync(base64, { base64: true });

    const containerXml = await this.readZipText(zip, 'META-INF/container.xml');
    const container = xmlParser.parse(containerXml);
    const rootFile = container?.container?.rootfiles?.rootfile?.['full-path'];
    if (!rootFile) {
      throw new Error('EPUB container missing OPF rootfile path.');
    }

    const packageXml = await this.readZipText(zip, rootFile);
    const pkg = xmlParser.parse(packageXml)?.package;
    if (!pkg) {
      throw new Error('OPF package metadata is malformed or missing.');
    }

    const metadata = pkg.metadata ?? {};
    const title = nodeText(metadata.title) || 'Untitled';
    const author = nodeText(metadata.creator) || 'Unknown author';
    const language = nodeText(metadata.language) || 'und';

    const manifestEntries = asArray(pkg.manifest?.item);
    const spineEntries = asArray(pkg.spine?.itemref);
    if (manifestEntries.length === 0 || spineEntries.length === 0) {
      throw new Error('EPUB manifest or spine is empty.');
    }

    const manifestById = new Map<
      string,
      { href: string; mediaType: string; properties: string | undefined }
    >();
    for (const item of manifestEntries) {
      manifestById.set(item.id, {
        href: item.href,
        mediaType: item['media-type'],
        properties: item.properties,
      });
    }

    const chapters: ParsedChapter[] = [];
    for (const [index, itemRef] of spineEntries.entries()) {
      const spineItem = manifestById.get(itemRef.idref);
      if (!spineItem) {
        continue;
      }

      const chapterPath = resolveRelativePath(rootFile, spineItem.href);
      const chapterHtml = await this.readZipText(zip, chapterPath);
      const chapterText = stripHtml(chapterHtml);
      const headingMatch = chapterHtml.match(/<h1[^>]*>(.*?)<\/h1>/i);
      const derivedTitle = headingMatch?.[1]?.replace(/<[^>]+>/g, '').trim();

      chapters.push({
        id: createId('chapter'),
        order: index,
        title: derivedTitle || `Chapter ${index + 1}`,
        href: chapterPath,
        html: chapterHtml,
        text: chapterText,
      });
    }

    if (chapters.length === 0) {
      throw new Error('No readable chapters found in EPUB spine.');
    }

    const coverPath = await this.extractCoverImage(
      bookId,
      zip,
      rootFile,
      manifestEntries,
      metadata,
    );

    return {
      title,
      author,
      language,
      coverPath,
      chapters,
    };
  }

  private async readZipText(zip: JSZip, path: string): Promise<string> {
    const file = zip.file(path);
    if (!file) {
      throw new Error(`Missing EPUB resource: ${path}`);
    }
    return file.async('text');
  }

  private async extractCoverImage(
    bookId: string,
    zip: JSZip,
    opfPath: string,
    manifestEntries: { id: string; href: string; [key: string]: string }[],
    metadata: Record<string, unknown>,
  ): Promise<string | null> {
    const metaEntries = asArray(metadata.meta as { name?: string; content?: string }[]);
    const coverMeta = metaEntries.find((entry) => entry.name === 'cover');
    const coverId = coverMeta?.content;
    const byId = manifestEntries.find((entry) => entry.id === coverId);
    const byProperty = manifestEntries.find((entry) =>
      String(entry.properties ?? '').includes('cover-image'),
    );
    const coverEntry = byId ?? byProperty;
    if (!coverEntry) {
      return null;
    }

    const zipPath = resolveRelativePath(opfPath, coverEntry.href);
    const coverFile = zip.file(zipPath);
    if (!coverFile) {
      return null;
    }

    const coverBase64 = await coverFile.async('base64');
    const extension = coverEntry.href.split('.').pop() ?? 'jpg';
    const dir = `${FileSystem.documentDirectory}books/${bookId}`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const outputPath = `${dir}/cover.${extension}`;
    await FileSystem.writeAsStringAsync(outputPath, coverBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return outputPath;
  }
}

export const epubParserService: EpubParserService = new JsEpubParserService();
