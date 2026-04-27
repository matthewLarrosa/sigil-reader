type AppEnv = 'development' | 'preview' | 'production';
type ReaderThemeName = 'light' | 'sepia' | 'dark';

export interface RuntimeConfig {
  appEnv: AppEnv;
  defaultTheme: ReaderThemeName;
  internalLogLevel: string;
}

function getPublicEnv(name: string): string | undefined {
  return process.env[name];
}

function withDefault<T extends string>(value: string | undefined, fallback: T): T | string {
  return value ?? fallback;
}

export const runtimeConfig: RuntimeConfig = {
  appEnv: withDefault(getPublicEnv('EXPO_PUBLIC_APP_ENV'), 'development') as AppEnv,
  defaultTheme: withDefault(getPublicEnv('EXPO_PUBLIC_DEFAULT_THEME'), 'light') as ReaderThemeName,
  internalLogLevel: withDefault(process.env.SIGIL_INTERNAL_LOG_LEVEL, 'info'),
};
