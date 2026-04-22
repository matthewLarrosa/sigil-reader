import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { runtimeConfig } from '@/config/env';
import { AppTheme, appThemes, ThemeName } from '@/theme/tokens';

interface ThemeContextValue {
  theme: AppTheme;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [themeName, setThemeName] = useState<ThemeName>(runtimeConfig.defaultTheme);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: appThemes[themeName],
      setThemeName,
    }),
    [themeName],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: appThemes[runtimeConfig.defaultTheme] ?? appThemes.sepia,
      setThemeName: () => undefined,
    };
  }

  return context;
}
