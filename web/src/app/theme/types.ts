export interface ThemeColors {
  bg: string;
  surface: string;
  'surface-2': string;
  'surface-3': string;
  'surface-overlay': string;
  interactive: string;
  'interactive-hover': string;
  'interactive-active': string;
  'interactive-disabled': string;
  primary: string;
  'primary-strong': string;
  accent: string;
  'text-primary': string;
  'text-secondary': string;
  'text-tertiary': string;
  'text-inverse': string;
  muted: string;
  'muted-2': string;
  border: string;
  'border-strong': string;
  'support-success': string;
  'support-warning': string;
  'support-danger': string;
  'support-info': string;
  success: string;
  warning: string;
  danger: string;
  'bg-empty': string;
  'bg-offline': string;
  'bg-fault': string;
  'bg-warning': string;
  'focus-ring': string;
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
