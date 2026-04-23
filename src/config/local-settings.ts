import * as FileSystem from 'expo-file-system/legacy';

type SettingsStore = Record<string, string>;

function settingsPath(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('App document directory is unavailable on this device.');
  }

  return `${FileSystem.documentDirectory}sigil-settings.json`;
}

async function readSettings(): Promise<SettingsStore> {
  const path = settingsPath();
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    return {};
  }

  try {
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as SettingsStore;
  } catch {
    return {};
  }
}

async function writeSettings(settings: SettingsStore): Promise<void> {
  await FileSystem.writeAsStringAsync(settingsPath(), JSON.stringify(settings));
}

export async function getLocalSetting(key: string): Promise<string | null> {
  const settings = await readSettings();
  return settings[key] ?? null;
}

export async function upsertLocalSetting(key: string, value: string): Promise<void> {
  const settings = await readSettings();
  settings[key] = value;
  await writeSettings(settings);
}

export async function resetLocalSettings(): Promise<void> {
  await writeSettings({});
}
