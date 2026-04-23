export type ParsingStatus = 'pending' | 'parsing' | 'ready' | 'failed';

export interface Book {
  id: string;
  original_filename: string;
  title: string | null;
  author: string | null;
  cover_path: string | null;
  epub_path: string;
  language: string | null;
  imported_at: number;
  parsing_status: ParsingStatus;
  parse_error: string | null;
}

export interface Chapter {
  id: string;
  book_id: string;
  order_index: number;
  title: string;
  href: string;
  html_content: string;
  text_content: string;
}

export interface ParsedChapter {
  id: string;
  order: number;
  title: string;
  href: string;
  html: string;
  text: string;
}

export interface ParsedBookManifest {
  title: string;
  author: string;
  language: string;
  coverPath: string | null;
  chapters: ParsedChapter[];
}

export interface ReadingProgressRecord {
  book_id: string;
  chapter_id: string;
  progress_ratio: number;
  scroll_offset: number;
  updated_at: number;
}

export interface AudiobookEntry {
  book_id: string;
  added_at: number;
}
