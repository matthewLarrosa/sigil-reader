import { getLocalSetting, upsertLocalSetting } from '@/config/local-settings';
import { ReaderPreferences } from '@/features/reader/types';

const KEY = 'reader_preferences';

export const defaultReaderPreferences: ReaderPreferences = {
  fontSize: 18,
  lineHeight: 1.7,
  margin: 16,
  theme: 'sepia',
};

export async function getReaderPreferences(): Promise<ReaderPreferences> {
  const raw = await getLocalSetting(KEY);
  if (!raw) {
    return defaultReaderPreferences;
  }

  try {
    return {
      ...defaultReaderPreferences,
      ...(JSON.parse(raw) as Partial<ReaderPreferences>),
    };
  } catch {
    return defaultReaderPreferences;
  }
}

export async function saveReaderPreferences(preferences: ReaderPreferences): Promise<void> {
  await upsertLocalSetting(KEY, JSON.stringify(preferences));
}
