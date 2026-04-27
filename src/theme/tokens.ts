export type ThemeName = 'light' | 'sepia' | 'dark';

export const tokens = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 18,
  },
  typography: {
    body: 16,
    bodyLarge: 18,
    title: 24,
    heading: 20,
    caption: 13,
  },
  elevation: {
    card: 2,
    floating: 6,
  },
} as const;

export interface AppTheme {
  name: ThemeName;
  colors: {
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    primary: string;
    border: string;
    success: string;
    danger: string;
    highlight: string;
  };
}

export const appThemes: Record<ThemeName, AppTheme> = {
  light: {
    name: 'light',
    colors: {
      background: '#F7FAFC',
      surface: '#FFFFFF',
      text: '#10202A',
      textMuted: '#697680',
      primary: '#8FD3F4',
      border: '#E5EDF2',
      success: '#0B7A50',
      danger: '#A32424',
      highlight: '#E8F7FE',
    },
  },
  sepia: {
    name: 'sepia',
    colors: {
      background: '#F3E9D8',
      surface: '#FCF4E5',
      text: '#332A22',
      textMuted: '#6D6158',
      primary: '#99662D',
      border: '#DFCDB5',
      success: '#586D3B',
      danger: '#8F2E2E',
      highlight: '#F2DDBA',
    },
  },
  dark: {
    name: 'dark',
    colors: {
      background: '#11161B',
      surface: '#1A222A',
      text: '#E8EEF4',
      textMuted: '#9CA8B3',
      primary: '#6FA8DC',
      border: '#2F3A45',
      success: '#5AB58A',
      danger: '#D98585',
      highlight: '#2D4A64',
    },
  },
};
