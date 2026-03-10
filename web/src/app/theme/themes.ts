import type { Theme, ThemeColors } from './types';

type ThemeTone = {
  interactive: string;
  hover: string;
  active: string;
  accent: string;
  info?: string;
  warning?: string;
  success?: string;
  danger?: string;
};

const baseWidgets = {
  'border-radius-sm': '0px',
  'border-radius-md': '0px',
  'border-radius-lg': '4px',
  'border-width': '1px',
  'surface-gradient': 'none',
  'glow-intensity': '0',
  'transition-speed': '0.12s',
} as const;

function createThemeColors(tone: ThemeTone): ThemeColors {
  const interactive = tone.interactive;
  const info = tone.info ?? tone.accent;
  const warning = tone.warning ?? '#f1c21b';
  const success = tone.success ?? '#24a148';
  const danger = tone.danger ?? '#da1e28';

  return {
    bg: '#161616',
    surface: '#262626',
    'surface-2': '#333333',
    'surface-3': '#3d3d3d',
    'surface-overlay': '#262626',
    interactive,
    'interactive-hover': tone.hover,
    'interactive-active': tone.active,
    'interactive-disabled': '#525252',
    primary: interactive,
    'primary-strong': tone.active,
    accent: tone.accent,
    'text-primary': '#f4f4f4',
    'text-secondary': '#c6c6c6',
    'text-tertiary': '#8d8d8d',
    'text-inverse': '#161616',
    muted: '#c6c6c6',
    'muted-2': '#8d8d8d',
    border: '#525252',
    'border-strong': '#8d8d8d',
    'support-success': success,
    'support-warning': warning,
    'support-danger': danger,
    'support-info': info,
    success,
    warning,
    danger,
    'bg-empty': '#262626',
    'bg-offline': 'rgba(218, 30, 40, 0.12)',
    'bg-fault': 'rgba(218, 30, 40, 0.2)',
    'bg-warning': 'rgba(241, 194, 27, 0.16)',
    'focus-ring': interactive,
    'shadow-strong': 'none',
    'shadow-soft': 'none',
    'color-scheme': 'dark',
  };
}

function createTheme(id: string, name: string, description: string, tone: ThemeTone): Theme {
  return {
    id,
    name,
    description,
    colors: createThemeColors(tone),
    widgets: { ...baseWidgets },
  };
}

export const themes: Record<string, Theme> = {
  default: createTheme(
    'default',
    'Carbon Blue',
    'IBM Carbon flat dark baseline with disciplined interactive blue',
    {
      interactive: '#0f62fe',
      hover: '#0353e9',
      active: '#002d9c',
      accent: '#78a9ff',
      info: '#4589ff',
    },
  ),
  'midnight-studio': createTheme(
    'midnight-studio',
    'Midnight Studio',
    'Flat dark studio theme with restrained indigo interaction',
    {
      interactive: '#5e5ce6',
      hover: '#4b49d7',
      active: '#3021a7',
      accent: '#a6a0ff',
      info: '#8a84ff',
    },
  ),
  'sunset-warmth': createTheme(
    'sunset-warmth',
    'Sunset Warmth',
    'Carbon flat shell with amber interaction for staging and utilities',
    {
      interactive: '#ff832b',
      hover: '#eb6200',
      active: '#8a3800',
      accent: '#ffb784',
      warning: '#f1c21b',
    },
  ),
  'forest-calm': createTheme(
    'forest-calm',
    'Forest Calm',
    'Flat enterprise layout with green interaction for monitoring-heavy work',
    {
      interactive: '#24a148',
      hover: '#198038',
      active: '#0e6027',
      accent: '#6fdc8c',
      success: '#24a148',
    },
  ),
  'eventide-eclipse': createTheme(
    'eventide-eclipse',
    'Eclipse Cyan',
    'Dark carbon system with cyan interaction accents',
    {
      interactive: '#08bdba',
      hover: '#009d9a',
      active: '#005d5d',
      accent: '#82f4f1',
      info: '#08bdba',
    },
  ),
  'material-dark': createTheme(
    'material-dark',
    'Slate Violet',
    'Flat dark theme with controlled violet interaction',
    {
      interactive: '#8a3ffc',
      hover: '#6929c4',
      active: '#491d8b',
      accent: '#be95ff',
      info: '#a56eff',
    },
  ),
  'material-blue': createTheme(
    'material-blue',
    'Signal Blue',
    'Flat blue variant for routing and infrastructure workflows',
    {
      interactive: '#1192e8',
      hover: '#0072c3',
      active: '#00539a',
      accent: '#82cfff',
      info: '#1192e8',
    },
  ),
  'material-teal': createTheme(
    'material-teal',
    'Teal Command',
    'Flat teal command-center variant with subdued cyan highlights',
    {
      interactive: '#009d9a',
      hover: '#007d79',
      active: '#005d5d',
      accent: '#6fdcda',
      info: '#33b1ff',
    },
  ),
  'material-pink': createTheme(
    'material-pink',
    'Rose Signal',
    'Flat magenta variant for high-contrast creative views',
    {
      interactive: '#ee5396',
      hover: '#d02670',
      active: '#9f1853',
      accent: '#ffafd2',
      danger: '#fa4d56',
    },
  ),
  'material-amber': createTheme(
    'material-amber',
    'Amber Control',
    'Flat amber variant tuned for warning-rich hardware control views',
    {
      interactive: '#ffb000',
      hover: '#d98e00',
      active: '#8e5a00',
      accent: '#ffd87c',
      warning: '#ffb000',
    },
  ),
};

export const themeOrder = [
  'default',
  'midnight-studio',
  'sunset-warmth',
  'forest-calm',
  'eventide-eclipse',
  'material-dark',
  'material-blue',
  'material-teal',
  'material-pink',
  'material-amber',
];
