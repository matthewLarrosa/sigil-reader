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

interface ManifestEntry {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
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
  if (Array.isArray(value) && value.length > 0) {
    return nodeText(value[0]);
  }
  return '';
}

function sanitizeResourcePath(path: string): string {
  const withoutFragment = path.split('#')[0]?.split('?')[0] ?? '';
  return decodeURIComponent(withoutFragment.replace(/\\/g, '/'));
}

export function resolveRelativePath(baseFilePath: string, relativePath: string): string {
  const normalizedRelativePath = sanitizeResourcePath(relativePath);
  if (!normalizedRelativePath) {
    return '';
  }

  if (normalizedRelativePath.startsWith('/')) {
    return normalizedRelativePath.slice(1);
  }

  const baseParts = sanitizeResourcePath(baseFilePath).split('/').filter(Boolean);
  baseParts.pop();
  const relativeParts = normalizedRelativePath.split('/').filter(Boolean);

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
    const rootFileEntries = asArray(container?.container?.rootfiles?.rootfile);
    const rootFile = sanitizeResourcePath(rootFileEntries[0]?.['full-path'] ?? '');
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

    const manifestEntries = asArray(pkg.manifest?.item)
      .map((item): ManifestEntry | null => {
        if (!item?.id || !item?.href) {
          return null;
        }
        return {
          id: String(item.id),
          href: sanitizeResourcePath(String(item.href)),
          mediaType: String(item['media-type'] ?? ''),
          properties: item.properties ? String(item.properties) : undefined,
        };
      })
      .filter((item): item is ManifestEntry => Boolean(item));
    const spineEntries = asArray(pkg.spine?.itemref);
    if (manifestEntries.length === 0) {
      throw new Error('EPUB manifest is empty.');
    }

    const manifestById = new Map<string, ManifestEntry>();
    for (const item of manifestEntries) {
      manifestById.set(item.id, item);
    }

    const readingOrderManifest = spineEntries
      .map((itemRef) => manifestById.get(String(itemRef?.idref ?? '')))
      .filter((item): item is ManifestEntry => Boolean(item));
    const fallbackManifest = manifestEntries.filter((item) =>
      /(xhtml|html|xml)/i.test(item.mediaType),
    );
    const readingItems = readingOrderManifest.length > 0 ? readingOrderManifest : fallbackManifest;

    const chapters: ParsedChapter[] = [];
    for (const [index, readingItem] of readingItems.entries()) {
      const chapterPath = resolveRelativePath(rootFile, readingItem.href);
      let chapterHtml: string;
      try {
        chapterHtml = await this.readZipText(zip, chapterPath);
      } catch {
        continue;
      }
      const chapterText = stripHtml(chapterHtml);
      if (!chapterText) {
        continue;
      }
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
    const normalizedPath = sanitizeResourcePath(path);
    const file =
      zip.file(normalizedPath) ??
      zip.file(normalizedPath.toLowerCase()) ??
      zip.file(new RegExp(`^${normalizedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))[0];
    if (!file) {
      throw new Error(`Missing EPUB resource: ${normalizedPath}`);
    }
    return file.async('text');
  }

  private async extractCoverImage(
    bookId: string,
    zip: JSZip,
    opfPath: string,
    manifestEntries: ManifestEntry[],
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
