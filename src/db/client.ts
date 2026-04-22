import * as SQLite from 'expo-sqlite';

import { schemaStatements } from '@/db/schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initialized = false;
let initializationPromise: Promise<void> | null = null;

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('BEGIN;');
  try {
    for (const statement of schemaStatements) {
      await db.execAsync(statement);
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('sigil-reader.db');
  }

  if (!initialized) {
    if (!initializationPromise) {
      initializationPromise = runMigrations(dbInstance)
        .then(() => {
          initialized = true;
        })
        .finally(() => {
          initializationPromise = null;
        });
    }
    await initializationPromise;
  }

  return dbInstance;
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
    key,
    value,
    Date.now(),
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ? LIMIT 1;',
    key,
  );

  return row?.value ?? null;
}
