export interface ThemeColors {
  bg: string;
  surface: string;
  'surface-2': string;
  'surface-3': string;
  primary: string;
  'primary-strong': string;
  accent: string;
  muted: string;
  'muted-2': string;
  border: string;
  success: string;
  danger: string;
  warning: string;
  'shadow-strong': string;
  'shadow-soft': string;
  'color-scheme': 'dark' | 'light';
}

export interface ThemeWidgets {
  'border-radius-sm': string;
  'border-radius-md': string;
  'border-radius-lg': string;
  'border-width': string;
  'surface-gradient': string;
  'glow-intensity': string;
  'transition-speed': string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  colors: ThemeColors;
  widgets: ThemeWidgets;
}
