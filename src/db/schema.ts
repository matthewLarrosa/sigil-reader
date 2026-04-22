export const schemaStatements: string[] = [
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY NOT NULL,
    original_filename TEXT NOT NULL,
    title TEXT,
    author TEXT,
    cover_path TEXT,
    epub_path TEXT NOT NULL,
    language TEXT,
    imported_at INTEGER NOT NULL,
    parsing_status TEXT NOT NULL,
    parse_error TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    href TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS reading_progress (
    book_id TEXT PRIMARY KEY NOT NULL,
    chapter_id TEXT NOT NULL,
    progress_ratio REAL NOT NULL DEFAULT 0,
    scroll_offset REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    label TEXT,
    progress_ratio REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS highlights_placeholder (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    selected_text TEXT NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS playback_progress (
    book_id TEXT PRIMARY KEY NOT NULL,
    chapter_id TEXT,
    chunk_id TEXT,
    playback_position_ms INTEGER NOT NULL DEFAULT 0,
    playback_state TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS tts_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS tts_chunks (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    audio_path TEXT,
    duration_ms INTEGER,
    status TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS tts_manifests (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    total_chunks INTEGER NOT NULL,
    total_duration_ms INTEGER,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  'CREATE INDEX IF NOT EXISTS idx_books_imported_at ON books(imported_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_chapters_book_order ON chapters(book_id, order_index);',
  'CREATE INDEX IF NOT EXISTS idx_tts_chunks_book_chapter ON tts_chunks(book_id, chapter_id, chunk_index);',
];
