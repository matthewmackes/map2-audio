import type { Theme } from './types';

export const themes: Record<string, Theme> = {
  // Default theme - current design
  default: {
    id: 'default',
    name: 'Default',
    description: 'Dark professional theme with cyan accents',
    colors: {
      'bg': '#1a1a1a',
      'surface': '#242424',
      'surface-2': '#2d2d2d',
      'surface-3': '#333333',
      'primary': '#00d4ff',
      'primary-strong': '#0099cc',
      'accent': '#ff6b35',
      'muted': '#a0a0a0',
      'muted-2': '#707070',
      'border': 'rgba(255,255,255,0.15)',
      'success': '#00ff41',
      'danger': '#ff3333',
      'warning': '#ffaa00',
      'shadow-strong': '0 10px 30px rgba(0,0,0,0.5)',
      'shadow-soft': '0 2px 10px rgba(0,0,0,0.3)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '6px',
      'border-radius-md': '12px',
      'border-radius-lg': '16px',
      'border-width': '2px',
      'surface-gradient': 'none',
      'glow-intensity': '1',
      'transition-speed': '0.2s'
    }
  },

  // Midnight Studio - Deep rich studio aesthetic
  'midnight-studio': {
    id: 'midnight-studio',
    name: 'Midnight Studio',
    description: 'Deep professional studio aesthetic with rich blues and purples',
    colors: {
      'bg': '#0d0f1a',
      'surface': '#151829',
      'surface-2': '#1c2038',
      'surface-3': '#252a48',
      'primary': '#7c3aed',
      'primary-strong': '#5b21b6',
      'accent': '#f472b6',
      'muted': '#94a3b8',
      'muted-2': '#64748b',
      'border': 'rgba(124, 58, 237, 0.25)',
      'success': '#10b981',
      'danger': '#ef4444',
      'warning': '#f59e0b',
      'shadow-strong': '0 12px 40px rgba(124, 58, 237, 0.15)',
      'shadow-soft': '0 4px 20px rgba(0, 0, 0, 0.4)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '8px',
      'border-radius-lg': '12px',
      'border-width': '1px',
      'surface-gradient': 'linear-gradient(180deg, rgba(124,58,237,0.03) 0%, transparent 100%)',
      'glow-intensity': '2',
      'transition-speed': '0.15s'
    }
  },

  // Sunset Warmth - Warm creative theme
  'sunset-warmth': {
    id: 'sunset-warmth',
    name: 'Sunset Warmth',
    description: 'Warm creative theme with oranges, reds, and golden tones',
    colors: {
      'bg': '#1a1410',
      'surface': '#261e18',
      'surface-2': '#332720',
      'surface-3': '#403028',
      'primary': '#f97316',
      'primary-strong': '#ea580c',
      'accent': '#fbbf24',
      'muted': '#d4a574',
      'muted-2': '#a67c52',
      'border': 'rgba(249, 115, 22, 0.25)',
      'success': '#84cc16',
      'danger': '#dc2626',
      'warning': '#fcd34d',
      'shadow-strong': '0 10px 35px rgba(249, 115, 22, 0.12)',
      'shadow-soft': '0 3px 15px rgba(0, 0, 0, 0.35)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '8px',
      'border-radius-md': '16px',
      'border-radius-lg': '24px',
      'border-width': '2px',
      'surface-gradient': 'linear-gradient(135deg, rgba(249,115,22,0.05) 0%, rgba(251,191,36,0.03) 100%)',
      'glow-intensity': '1',
      'transition-speed': '0.25s'
    }
  },

  // Forest Calm - Natural organic theme
  'forest-calm': {
    id: 'forest-calm',
    name: 'Forest Calm',
    description: 'Natural organic theme with greens, browns, and earth tones',
    colors: {
      'bg': '#0f1510',
      'surface': '#182018',
      'surface-2': '#1f2b1f',
      'surface-3': '#283628',
      'primary': '#22c55e',
      'primary-strong': '#16a34a',
      'accent': '#a3e635',
      'muted': '#8fac8f',
      'muted-2': '#5c7a5c',
      'border': 'rgba(34, 197, 94, 0.2)',
      'success': '#4ade80',
      'danger': '#f87171',
      'warning': '#fcd34d',
      'shadow-strong': '0 8px 28px rgba(34, 197, 94, 0.08)',
      'shadow-soft': '0 2px 12px rgba(0, 0, 0, 0.3)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '10px',
      'border-radius-md': '14px',
      'border-radius-lg': '20px',
      'border-width': '1px',
      'surface-gradient': 'linear-gradient(180deg, rgba(34,197,94,0.02) 0%, transparent 50%)',
      'glow-intensity': '0',
      'transition-speed': '0.3s'
    }
  },

  // Arctic Frost - Cool minimal light theme
  'arctic-frost': {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    description: 'Cool minimal light theme with whites, light blues, and silver',
    colors: {
      'bg': '#f8fafc',
      'surface': '#ffffff',
      'surface-2': '#f1f5f9',
      'surface-3': '#e2e8f0',
      'primary': '#0ea5e9',
      'primary-strong': '#0284c7',
      'accent': '#6366f1',
      'muted': '#64748b',
      'muted-2': '#94a3b8',
      'border': 'rgba(14, 165, 233, 0.2)',
      'success': '#10b981',
      'danger': '#ef4444',
      'warning': '#f59e0b',
      'shadow-strong': '0 10px 40px rgba(14, 165, 233, 0.1)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.06)',
      'color-scheme': 'light'
    },
    widgets: {
      'border-radius-sm': '6px',
      'border-radius-md': '10px',
      'border-radius-lg': '16px',
      'border-width': '1px',
      'surface-gradient': 'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(241,245,249,0.5) 100%)',
      'glow-intensity': '0',
      'transition-speed': '0.18s'
    }
  },

  // Corporate themes (migrated from AboutPage)
  'corporate-blue': {
    id: 'corporate-blue',
    name: 'Corporate Blue',
    description: 'Professional light blue corporate theme',
    colors: {
      'bg': '#f4f8fb',
      'surface': '#e9eef3',
      'surface-2': '#dbe3ea',
      'surface-3': '#c7d4e2',
      'primary': '#005fa3',
      'primary-strong': '#003e6b',
      'accent': '#f7b32b',
      'muted': '#4a5a6a',
      'muted-2': '#7a8ca3',
      'border': 'rgba(0,95,163,0.15)',
      'success': '#2e7d32',
      'danger': '#c62828',
      'warning': '#fbc02d',
      'shadow-strong': '0 10px 30px rgba(0,95,163,0.08)',
      'shadow-soft': '0 2px 10px rgba(0,95,163,0.05)',
      'color-scheme': 'light'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '8px',
      'border-radius-lg': '12px',
      'border-width': '1px',
      'surface-gradient': 'none',
      'glow-intensity': '0',
      'transition-speed': '0.2s'
    }
  },

  'corporate-gray': {
    id: 'corporate-gray',
    name: 'Corporate Gray',
    description: 'Neutral light gray corporate theme',
    colors: {
      'bg': '#f5f5f5',
      'surface': '#e0e0e0',
      'surface-2': '#bdbdbd',
      'surface-3': '#9e9e9e',
      'primary': '#212121',
      'primary-strong': '#424242',
      'accent': '#ffb300',
      'muted': '#616161',
      'muted-2': '#757575',
      'border': 'rgba(33,33,33,0.15)',
      'success': '#388e3c',
      'danger': '#d32f2f',
      'warning': '#ffa000',
      'shadow-strong': '0 10px 30px rgba(33,33,33,0.08)',
      'shadow-soft': '0 2px 10px rgba(33,33,33,0.05)',
      'color-scheme': 'light'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '8px',
      'border-radius-lg': '12px',
      'border-width': '1px',
      'surface-gradient': 'none',
      'glow-intensity': '0',
      'transition-speed': '0.2s'
    }
  },

  'corporate-green': {
    id: 'corporate-green',
    name: 'Corporate Green',
    description: 'Fresh light green corporate theme',
    colors: {
      'bg': '#e8f5e9',
      'surface': '#c8e6c9',
      'surface-2': '#a5d6a7',
      'surface-3': '#81c784',
      'primary': '#388e3c',
      'primary-strong': '#1b5e20',
      'accent': '#ffb74d',
      'muted': '#4e944f',
      'muted-2': '#81c784',
      'border': 'rgba(56,142,60,0.15)',
      'success': '#388e3c',
      'danger': '#d32f2f',
      'warning': '#ffa000',
      'shadow-strong': '0 10px 30px rgba(56,142,60,0.08)',
      'shadow-soft': '0 2px 10px rgba(56,142,60,0.05)',
      'color-scheme': 'light'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '8px',
      'border-radius-lg': '12px',
      'border-width': '1px',
      'surface-gradient': 'none',
      'glow-intensity': '0',
      'transition-speed': '0.2s'
    }
  },

  'corporate-purple': {
    id: 'corporate-purple',
    name: 'Corporate Purple',
    description: 'Elegant light purple corporate theme',
    colors: {
      'bg': '#f3e5f5',
      'surface': '#e1bee7',
      'surface-2': '#ce93d8',
      'surface-3': '#ba68c8',
      'primary': '#6a1b9a',
      'primary-strong': '#4a148c',
      'accent': '#ffd54f',
      'muted': '#7c43bd',
      'muted-2': '#ba68c8',
      'border': 'rgba(106,27,154,0.15)',
      'success': '#388e3c',
      'danger': '#d32f2f',
      'warning': '#ffa000',
      'shadow-strong': '0 10px 30px rgba(106,27,154,0.08)',
      'shadow-soft': '0 2px 10px rgba(106,27,154,0.05)',
      'color-scheme': 'light'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '8px',
      'border-radius-lg': '12px',
      'border-width': '1px',
      'surface-gradient': 'none',
      'glow-intensity': '0',
      'transition-speed': '0.2s'
    }
  },

  'corporate-gold': {
    id: 'corporate-gold',
    name: 'Corporate Gold',
    description: 'Luxurious light gold corporate theme',
    colors: {
      'bg': '#fffde7',
      'surface': '#fff9c4',
      'surface-2': '#fff59d',
      'surface-3': '#fff176',
      'primary': '#fbc02d',
      'primary-strong': '#f9a825',
      'accent': '#1976d2',
      'muted': '#bfa43a',
      'muted-2': '#fff176',
      'border': 'rgba(251,192,45,0.15)',
      'success': '#388e3c',
      'danger': '#d32f2f',
      'warning': '#ffa000',
      'shadow-strong': '0 10px 30px rgba(251,192,45,0.08)',
      'shadow-soft': '0 2px 10px rgba(251,192,45,0.05)',
      'color-scheme': 'light'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '8px',
      'border-radius-lg': '12px',
      'border-width': '1px',
      'surface-gradient': 'none',
      'glow-intensity': '0',
      'transition-speed': '0.2s'
    }
  },

  // Eventide Eclipse - VFD Display Theme
  'eventide-eclipse': {
    id: 'eventide-eclipse',
    name: 'Eventide Eclipse',
    description: 'Inspired by the classic Eventide Eclipse VFD display',
    colors: {
      'bg': '#0a0a0a',
      'surface': '#0d1210',
      'surface-2': '#101814',
      'surface-3': '#141e18',
      'primary': '#00ff9d',
      'primary-strong': '#00cc7a',
      'accent': '#00e5ff',
      'muted': '#4a7a6a',
      'muted-2': '#2d4a3f',
      'border': 'rgba(0, 255, 157, 0.25)',
      'success': '#00ff9d',
      'danger': '#ff4444',
      'warning': '#ffcc00',
      'shadow-strong': '0 0 30px rgba(0, 255, 157, 0.15)',
      'shadow-soft': '0 0 15px rgba(0, 255, 157, 0.08)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '2px',
      'border-radius-md': '4px',
      'border-radius-lg': '6px',
      'border-width': '1px',
      'surface-gradient': 'linear-gradient(180deg, rgba(0,255,157,0.02) 0%, transparent 100%)',
      'glow-intensity': '2',
      'transition-speed': '0.1s'
    }
  },

  // Material Design Dark - Google's Material Design 3 Dark Theme
  'material-dark': {
    id: 'material-dark',
    name: 'Material Dark',
    description: 'Google Material Design 3 dark theme with Deep Purple primary',
    colors: {
      'bg': '#121212',
      'surface': '#1e1e1e',
      'surface-2': '#2d2d2d',
      'surface-3': '#3d3d3d',
      'primary': '#bb86fc',
      'primary-strong': '#6200ee',
      'accent': '#03dac6',
      'muted': '#b0b0b0',
      'muted-2': '#757575',
      'border': 'rgba(187, 134, 252, 0.24)',
      'success': '#03dac6',
      'danger': '#cf6679',
      'warning': '#ffb74d',
      'shadow-strong': '0 8px 24px rgba(0, 0, 0, 0.4)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.25)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '12px',
      'border-radius-lg': '16px',
      'border-width': '1px',
      'surface-gradient': 'linear-gradient(180deg, rgba(187,134,252,0.05) 0%, transparent 100%)',
      'glow-intensity': '0',
      'transition-speed': '0.2s'
    }
  },

  // Material Design Light - Google's Material Design 3 Light Theme
  'material-light': {
    id: 'material-light',
    name: 'Material Light',
    description: 'Google Material Design 3 light theme with Deep Purple primary',
    colors: {
      'bg': '#fafafa',
      'surface': '#ffffff',
      'surface-2': '#f5f5f5',
      'surface-3': '#eeeeee',
      'primary': '#6200ee',
      'primary-strong': '#3700b3',
      'accent': '#03dac6',
      'muted': '#666666',
      'muted-2': '#9e9e9e',
      'border': 'rgba(98, 0, 238, 0.12)',
      'success': '#00c853',
      'danger': '#b00020',
      'warning': '#ff9800',
      'shadow-strong': '0 8px 24px rgba(0, 0, 0, 0.12)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.08)',
      'color-scheme': 'light'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '12px',
      'border-radius-lg': '16px',
      'border-width': '1px',
      'surface-gradient': 'none',
      'glow-intensity': '0',
      'transition-speed': '0.2s'
    }
  },

  // Material Blue - Material Design Blue variant
  'material-blue': {
    id: 'material-blue',
    name: 'Material Blue',
    description: 'Material Design dark theme with Blue primary',
    colors: {
      'bg': '#0d1117',
      'surface': '#161b22',
      'surface-2': '#21262d',
      'surface-3': '#30363d',
      'primary': '#58a6ff',
      'primary-strong': '#1f6feb',
      'accent': '#56d364',
      'muted': '#8b949e',
      'muted-2': '#6e7681',
      'border': 'rgba(88, 166, 255, 0.2)',
      'success': '#56d364',
      'danger': '#f85149',
      'warning': '#d29922',
      'shadow-strong': '0 8px 24px rgba(0, 0, 0, 0.5)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.3)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '6px',
      'border-radius-md': '12px',
      'border-radius-lg': '16px',
      'border-width': '1px',
      'surface-gradient': 'none',
      'glow-intensity': '0',
      'transition-speed': '0.15s'
    }
  },

  // Material Teal - Material Design Teal/Cyan variant
  'material-teal': {
    id: 'material-teal',
    name: 'Material Teal',
    description: 'Material Design dark theme with Teal primary',
    colors: {
      'bg': '#0f1419',
      'surface': '#15202b',
      'surface-2': '#192734',
      'surface-3': '#1e3344',
      'primary': '#1da1f2',
      'primary-strong': '#0d8ecf',
      'accent': '#794bc4',
      'muted': '#8899a6',
      'muted-2': '#657786',
      'border': 'rgba(29, 161, 242, 0.2)',
      'success': '#17bf63',
      'danger': '#e0245e',
      'warning': '#ffad1f',
      'shadow-strong': '0 8px 24px rgba(29, 161, 242, 0.15)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.3)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '16px',
      'border-radius-lg': '24px',
      'border-width': '1px',
      'surface-gradient': 'none',
      'glow-intensity': '0',
      'transition-speed': '0.2s'
    }
  },

  // Material Pink - Material Design Pink variant
  'material-pink': {
    id: 'material-pink',
    name: 'Material Pink',
    description: 'Material Design dark theme with Pink/Magenta primary',
    colors: {
      'bg': '#1a1121',
      'surface': '#231a2e',
      'surface-2': '#2e2438',
      'surface-3': '#3d3048',
      'primary': '#f48fb1',
      'primary-strong': '#ec407a',
      'accent': '#7c4dff',
      'muted': '#a89cb0',
      'muted-2': '#7d6f8a',
      'border': 'rgba(244, 143, 177, 0.2)',
      'success': '#69f0ae',
      'danger': '#ff5252',
      'warning': '#ffd740',
      'shadow-strong': '0 8px 24px rgba(244, 143, 177, 0.15)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.35)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '8px',
      'border-radius-md': '16px',
      'border-radius-lg': '24px',
      'border-width': '1px',
      'surface-gradient': 'linear-gradient(180deg, rgba(244,143,177,0.03) 0%, transparent 100%)',
      'glow-intensity': '1',
      'transition-speed': '0.25s'
    }
  },

  // Material Amber - Material Design Amber/Orange variant
  'material-amber': {
    id: 'material-amber',
    name: 'Material Amber',
    description: 'Material Design dark theme with Amber/Orange primary',
    colors: {
      'bg': '#1a1714',
      'surface': '#231e1a',
      'surface-2': '#2e2720',
      'surface-3': '#3d3428',
      'primary': '#ffb300',
      'primary-strong': '#ff8f00',
      'accent': '#00e5ff',
      'muted': '#a89e8f',
      'muted-2': '#7d7468',
      'border': 'rgba(255, 179, 0, 0.2)',
      'success': '#00e676',
      'danger': '#ff5252',
      'warning': '#ffea00',
      'shadow-strong': '0 8px 24px rgba(255, 179, 0, 0.12)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.3)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '8px',
      'border-radius-lg': '12px',
      'border-width': '2px',
      'surface-gradient': 'linear-gradient(180deg, rgba(255,179,0,0.04) 0%, transparent 100%)',
      'glow-intensity': '1',
      'transition-speed': '0.2s'
    }
  }
};

export const themeOrder = [
  'default',
  'midnight-studio',
  'sunset-warmth',
  'forest-calm',
  'eventide-eclipse',
  // Material Design themes
  'material-dark',
  'material-blue',
  'material-teal',
  'material-pink',
  'material-amber',
  'material-light',
  // Light themes
  'arctic-frost',
  'corporate-blue',
  'corporate-gray',
  'corporate-green',
  'corporate-purple',
  'corporate-gold'
];

export const darkThemes = ['default', 'midnight-studio', 'sunset-warmth', 'forest-calm', 'eventide-eclipse', 'material-dark', 'material-blue', 'material-teal', 'material-pink', 'material-amber'];
export const lightThemes = ['material-light', 'arctic-frost', 'corporate-blue', 'corporate-gray', 'corporate-green', 'corporate-purple', 'corporate-gold'];
