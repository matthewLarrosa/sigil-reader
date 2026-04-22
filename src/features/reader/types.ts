export interface ReaderPreferences {
  fontSize: number;
  lineHeight: number;
  margin: number;
  theme: 'light' | 'sepia' | 'dark';
}

export interface ReaderChunk {
  id: string;
  chapterId: string;
  index: number;
  text: string;
  startChar: number;
  endChar: number;
}
