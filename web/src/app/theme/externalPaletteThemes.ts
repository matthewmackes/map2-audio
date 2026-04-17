/**
 * Additional preset themes generated from public reference palettes so the
 * workbench can offer materially different schemes without a runtime package.
 *
 * Sources:
 * - Open Color (MIT): https://github.com/yeun/open-color
 * - Material Design color palette reference:
 *   https://m1.material.io/style/color.html
 */

import { baseWidgets } from './themeFactory';
import type { Theme, ThemeColors } from './types';

type PaletteRamp = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

type ExternalThemeMode = 'light' | 'dark';

interface ExternalPaletteFamily {
  id: string;
  name: string;
  tones: PaletteRamp;
  accentId: string;
}

interface ExternalPaletteLibrary {
  id: 'material' | 'open-color';
  name: string;
  families: readonly ExternalPaletteFamily[];
}

const MATERIAL_FAMILIES: readonly ExternalPaletteFamily[] = [
  {
    id: 'red',
    name: 'Red',
    accentId: 'pink',
    tones: ['#FFEBEE', '#FFCDD2', '#EF9A9A', '#E57373', '#EF5350', '#F44336', '#E53935', '#D32F2F', '#C62828', '#B71C1C'],
  },
  {
    id: 'pink',
    name: 'Pink',
    accentId: 'purple',
    tones: ['#FCE4EC', '#F8BBD0', '#F48FB1', '#F06292', '#EC407A', '#E91E63', '#D81B60', '#C2185B', '#AD1457', '#880E4F'],
  },
  {
    id: 'purple',
    name: 'Purple',
    accentId: 'deep-purple',
    tones: ['#F3E5F5', '#E1BEE7', '#CE93D8', '#BA68C8', '#AB47BC', '#9C27B0', '#8E24AA', '#7B1FA2', '#6A1B9A', '#4A148C'],
  },
  {
    id: 'deep-purple',
    name: 'Deep Purple',
    accentId: 'indigo',
    tones: ['#EDE7F6', '#D1C4E9', '#B39DDB', '#9575CD', '#7E57C2', '#673AB7', '#5E35B1', '#512DA8', '#4527A0', '#311B92'],
  },
  {
    id: 'indigo',
    name: 'Indigo',
    accentId: 'blue',
    tones: ['#E8EAF6', '#C5CAE9', '#9FA8DA', '#7986CB', '#5C6BC0', '#3F51B5', '#3949AB', '#303F9F', '#283593', '#1A237E'],
  },
  {
    id: 'blue',
    name: 'Blue',
    accentId: 'cyan',
    tones: ['#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5', '#2196F3', '#1E88E5', '#1976D2', '#1565C0', '#0D47A1'],
  },
  {
    id: 'cyan',
    name: 'Cyan',
    accentId: 'teal',
    tones: ['#E0F7FA', '#B2EBF2', '#80DEEA', '#4DD0E1', '#26C6DA', '#00BCD4', '#00ACC1', '#0097A7', '#00838F', '#006064'],
  },
  {
    id: 'teal',
    name: 'Teal',
    accentId: 'green',
    tones: ['#E0F2F1', '#B2DFDB', '#80CBC4', '#4DB6AC', '#26A69A', '#009688', '#00897B', '#00796B', '#00695C', '#004D40'],
  },
  {
    id: 'green',
    name: 'Green',
    accentId: 'lime',
    tones: ['#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A', '#4CAF50', '#43A047', '#388E3C', '#2E7D32', '#1B5E20'],
  },
  {
    id: 'lime',
    name: 'Lime',
    accentId: 'amber',
    tones: ['#F9FBE7', '#F0F4C3', '#E6EE9C', '#DCE775', '#D4E157', '#CDDC39', '#C0CA33', '#AFB42B', '#9E9D24', '#827717'],
  },
  {
    id: 'amber',
    name: 'Amber',
    accentId: 'deep-orange',
    tones: ['#FFF8E1', '#FFECB3', '#FFE082', '#FFD54F', '#FFCA28', '#FFC107', '#FFB300', '#FFA000', '#FF8F00', '#FF6F00'],
  },
  {
    id: 'deep-orange',
    name: 'Deep Orange',
    accentId: 'red',
    tones: ['#FBE9E7', '#FFCCBC', '#FFAB91', '#FF8A65', '#FF7043', '#FF5722', '#F4511E', '#E64A19', '#D84315', '#BF360C'],
  },
] as const;

const OPEN_COLOR_FAMILIES: readonly ExternalPaletteFamily[] = [
  {
    id: 'gray',
    name: 'Gray',
    accentId: 'blue',
    tones: ['#f8f9fa', '#f1f3f5', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#868e96', '#495057', '#343a40', '#212529'],
  },
  {
    id: 'red',
    name: 'Red',
    accentId: 'pink',
    tones: ['#fff5f5', '#ffe3e3', '#ffc9c9', '#ffa8a8', '#ff8787', '#ff6b6b', '#fa5252', '#f03e3e', '#e03131', '#c92a2a'],
  },
  {
    id: 'pink',
    name: 'Pink',
    accentId: 'grape',
    tones: ['#fff0f6', '#ffdeeb', '#fcc2d7', '#faa2c1', '#f783ac', '#f06595', '#e64980', '#d6336c', '#c2255c', '#a61e4d'],
  },
  {
    id: 'grape',
    name: 'Grape',
    accentId: 'violet',
    tones: ['#f8f0fc', '#f3d9fa', '#eebefa', '#e599f7', '#da77f2', '#cc5de8', '#be4bdb', '#ae3ec9', '#9c36b5', '#862e9c'],
  },
  {
    id: 'violet',
    name: 'Violet',
    accentId: 'indigo',
    tones: ['#f3f0ff', '#e5dbff', '#d0bfff', '#b197fc', '#9775fa', '#845ef7', '#7950f2', '#7048e8', '#6741d9', '#5f3dc4'],
  },
  {
    id: 'indigo',
    name: 'Indigo',
    accentId: 'blue',
    tones: ['#edf2ff', '#dbe4ff', '#bac8ff', '#91a7ff', '#748ffc', '#5c7cfa', '#4c6ef5', '#4263eb', '#3b5bdb', '#364fc7'],
  },
  {
    id: 'blue',
    name: 'Blue',
    accentId: 'cyan',
    tones: ['#e7f5ff', '#d0ebff', '#a5d8ff', '#74c0fc', '#4dabf7', '#339af0', '#228be6', '#1c7ed6', '#1971c2', '#1864ab'],
  },
  {
    id: 'cyan',
    name: 'Cyan',
    accentId: 'teal',
    tones: ['#e3fafc', '#c5f6fa', '#99e9f2', '#66d9e8', '#3bc9db', '#22b8cf', '#15aabf', '#1098ad', '#0c8599', '#0b7285'],
  },
  {
    id: 'teal',
    name: 'Teal',
    accentId: 'green',
    tones: ['#e6fcf5', '#c3fae8', '#96f2d7', '#63e6be', '#38d9a9', '#20c997', '#12b886', '#0ca678', '#099268', '#087f5b'],
  },
  {
    id: 'green',
    name: 'Green',
    accentId: 'lime',
    tones: ['#ebfbee', '#d3f9d8', '#b2f2bb', '#8ce99a', '#69db7c', '#51cf66', '#40c057', '#37b24d', '#2f9e44', '#2b8a3e'],
  },
  {
    id: 'lime',
    name: 'Lime',
    accentId: 'yellow',
    tones: ['#f4fce3', '#e9fac8', '#d8f5a2', '#c0eb75', '#a9e34b', '#94d82d', '#82c91e', '#74b816', '#66a80f', '#5c940d'],
  },
  {
    id: 'yellow',
    name: 'Yellow',
    accentId: 'orange',
    tones: ['#fff9db', '#fff3bf', '#ffec99', '#ffe066', '#ffd43b', '#fcc419', '#fab005', '#f59f00', '#f08c00', '#e67700'],
  },
  {
    id: 'orange',
    name: 'Orange',
    accentId: 'red',
    tones: ['#fff4e6', '#ffe8cc', '#ffd8a8', '#ffc078', '#ffa94d', '#ff922b', '#fd7e14', '#f76707', '#e8590c', '#d9480f'],
  },
] as const;

const PALETTE_LIBRARIES: readonly ExternalPaletteLibrary[] = [
  {
    id: 'material',
    name: 'Material',
    families: MATERIAL_FAMILIES,
  },
  {
    id: 'open-color',
    name: 'Open Color',
    families: OPEN_COLOR_FAMILIES,
  },
] as const;

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((channel) => `${channel}${channel}`).join('')
    : normalized;

  return {
    red: Number.parseInt(full.slice(0, 2), 16),
    green: Number.parseInt(full.slice(2, 4), 16),
    blue: Number.parseInt(full.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const { red, green, blue } = hexToRgb(hex);
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function readableForeground(background: string): string {
  return relativeLuminance(background) > 0.45 ? '#161616' : '#ffffff';
}

function createExternalThemeColors(
  primaryRamp: PaletteRamp,
  accentRamp: PaletteRamp,
  mode: ExternalThemeMode,
): ThemeColors {
  const isDark = mode === 'dark';
  const primary = primaryRamp[isDark ? 4 : 6];
  const primaryStrong = primaryRamp[isDark ? 5 : 7];
  const accent = accentRamp[isDark ? 3 : 7];
  const info = accentRamp[isDark ? 4 : 6];
  const success = isDark ? '#69db7c' : '#2f9e44';
  const warning = isDark ? '#ffd43b' : '#f08c00';
  const danger = isDark ? '#ff6b6b' : '#d32f2f';

  return {
    bg: primaryRamp[isDark ? 9 : 0],
    surface: isDark ? primaryRamp[8] : '#ffffff',
    'surface-2': primaryRamp[isDark ? 7 : 1],
    'surface-3': primaryRamp[isDark ? 6 : 2],
    'surface-overlay': primaryRamp[isDark ? 7 : 1],
    interactive: primary,
    'interactive-hover': primaryStrong,
    'interactive-active': primaryRamp[isDark ? 6 : 8],
    'interactive-disabled': isDark ? '#525252' : '#c6c6c6',
    primary,
    'primary-strong': primaryStrong,
    accent,
    'text-primary': isDark ? '#f4f4f4' : '#161616',
    'text-secondary': isDark ? '#c6c6c6' : '#525252',
    'text-tertiary': isDark ? '#8d8d8d' : '#6f6f6f',
    'text-inverse': readableForeground(primaryStrong),
    muted: isDark ? '#c6c6c6' : '#525252',
    'muted-2': isDark ? '#8d8d8d' : '#6f6f6f',
    border: primaryRamp[isDark ? 7 : 3],
    'border-strong': primaryRamp[isDark ? 6 : 4],
    'support-success': success,
    'support-warning': warning,
    'support-danger': danger,
    'support-info': info,
    success,
    warning,
    danger,
    'bg-empty': isDark ? primaryRamp[8] : '#ffffff',
    'bg-offline': `color-mix(in srgb, ${danger} 16%, ${primaryRamp[isDark ? 9 : 0]})`,
    'bg-fault': `color-mix(in srgb, ${danger} 24%, ${primaryRamp[isDark ? 9 : 0]})`,
    'bg-warning': `color-mix(in srgb, ${warning} 20%, ${primaryRamp[isDark ? 9 : 0]})`,
    'focus-ring': accent,
    'shadow-strong': isDark ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.22)',
    'shadow-soft': isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)',
    'color-scheme': isDark ? 'dark' : 'light',
  };
}

function createExternalPaletteTheme(
  library: ExternalPaletteLibrary,
  family: ExternalPaletteFamily,
  accentFamily: ExternalPaletteFamily,
  mode: ExternalThemeMode,
): Theme {
  const modeLabel = mode === 'dark' ? 'Dark' : 'Light';

  return {
    id: `${library.id}-${family.id}-${mode}`,
    name: `${library.name} ${family.name} ${modeLabel}`,
    description: `${library.name} ${family.name} palette on a ${modeLabel.toLowerCase()} shell with ${accentFamily.name} accents.`,
    carbonTheme: mode === 'dark' ? 'g100' : 'g10',
    colors: createExternalThemeColors(family.tones, accentFamily.tones, mode),
    widgets: { ...baseWidgets },
  };
}

export const EXTERNAL_PALETTE_THEMES: Theme[] = PALETTE_LIBRARIES.flatMap((library) =>
  library.families.flatMap((family) => {
    const accentFamily = library.families.find((candidate) => candidate.id === family.accentId) ?? library.families[0];

    return [
      createExternalPaletteTheme(library, family, accentFamily, 'light'),
      createExternalPaletteTheme(library, family, accentFamily, 'dark'),
    ];
  }),
);
