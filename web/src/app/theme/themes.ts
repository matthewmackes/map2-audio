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
      'bg': '#0e0e0e',
      'surface': '#1a1a1a',
      'surface-2': '#252525',
      'surface-3': '#333333',
      'primary': '#d0a0ff',
      'primary-strong': '#9b59d0',
      'accent': '#1de9b6',
      'muted': '#c5c5c5',
      'muted-2': '#909090',
      'border': 'rgba(208, 160, 255, 0.3)',
      'success': '#1de9b6',
      'danger': '#ff6b8a',
      'warning': '#ffc947',
      'shadow-strong': '0 8px 24px rgba(0, 0, 0, 0.5)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.3)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '12px',
      'border-radius-lg': '16px',
      'border-width': '1px',
      'surface-gradient': 'linear-gradient(180deg, rgba(208,160,255,0.04) 0%, transparent 100%)',
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
      'bg': '#080c10',
      'surface': '#0d1117',
      'surface-2': '#161b22',
      'surface-3': '#21262d',
      'primary': '#79b8ff',
      'primary-strong': '#388bfd',
      'accent': '#7ee787',
      'muted': '#b1bac4',
      'muted-2': '#8b949e',
      'border': 'rgba(121, 184, 255, 0.25)',
      'success': '#7ee787',
      'danger': '#ff7b72',
      'warning': '#e3b341',
      'shadow-strong': '0 8px 24px rgba(0, 0, 0, 0.6)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.4)',
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
      'bg': '#0a0f14',
      'surface': '#101820',
      'surface-2': '#1a2634',
      'surface-3': '#243442',
      'primary': '#4dc3ff',
      'primary-strong': '#1da1f2',
      'accent': '#a78bfa',
      'muted': '#a8b9c8',
      'muted-2': '#7d8e9e',
      'border': 'rgba(77, 195, 255, 0.25)',
      'success': '#34d399',
      'danger': '#f87171',
      'warning': '#fbbf24',
      'shadow-strong': '0 8px 24px rgba(29, 161, 242, 0.2)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.4)',
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
      'bg': '#100a14',
      'surface': '#1a1220',
      'surface-2': '#261a2e',
      'surface-3': '#33253d',
      'primary': '#ff9ec4',
      'primary-strong': '#f472b6',
      'accent': '#a78bfa',
      'muted': '#c4b5d0',
      'muted-2': '#9688a5',
      'border': 'rgba(255, 158, 196, 0.25)',
      'success': '#86efac',
      'danger': '#ff7b7b',
      'warning': '#fde047',
      'shadow-strong': '0 8px 24px rgba(244, 114, 182, 0.2)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.4)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '8px',
      'border-radius-md': '16px',
      'border-radius-lg': '24px',
      'border-width': '1px',
      'surface-gradient': 'linear-gradient(180deg, rgba(255,158,196,0.03) 0%, transparent 100%)',
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
      'bg': '#0f0d0a',
      'surface': '#1a1610',
      'surface-2': '#26201a',
      'surface-3': '#332c24',
      'primary': '#ffc642',
      'primary-strong': '#f59e0b',
      'accent': '#22d3ee',
      'muted': '#c9bfb0',
      'muted-2': '#9a9080',
      'border': 'rgba(255, 198, 66, 0.25)',
      'success': '#34d399',
      'danger': '#f87171',
      'warning': '#fde047',
      'shadow-strong': '0 8px 24px rgba(245, 158, 11, 0.15)',
      'shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.4)',
      'color-scheme': 'dark'
    },
    widgets: {
      'border-radius-sm': '4px',
      'border-radius-md': '8px',
      'border-radius-lg': '12px',
      'border-width': '2px',
      'surface-gradient': 'linear-gradient(180deg, rgba(255,198,66,0.03) 0%, transparent 100%)',
      'glow-intensity': '1',
      'transition-speed': '0.2s'
    }
  },

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
  'material-amber'
];
