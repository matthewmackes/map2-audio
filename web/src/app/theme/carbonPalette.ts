/**
 * Carbon Design System full color palette.
 * Values are maintained inline for the Theme Chooser's palette generation.
 */

export interface CarbonColorFamily {
  id: string;
  name: string;
  shades: Record<number, string>;
}

export const CARBON_COLOR_FAMILIES: CarbonColorFamily[] = [
  {
    id: 'blue',
    name: 'Blue',
    shades: {
      10: '#edf5ff', 20: '#d0e2ff', 30: '#a6c8ff', 40: '#78a9ff',
      50: '#4589ff', 60: '#0f62fe', 70: '#0043ce', 80: '#002d9c',
      90: '#001d6c', 100: '#001141',
    },
  },
  {
    id: 'cyan',
    name: 'Cyan',
    shades: {
      10: '#e5f6ff', 20: '#bae6ff', 30: '#82cfff', 40: '#33b1ff',
      50: '#1192e8', 60: '#0072c3', 70: '#00539a', 80: '#003a6d',
      90: '#012749', 100: '#061727',
    },
  },
  {
    id: 'teal',
    name: 'Teal',
    shades: {
      10: '#d9fbfb', 20: '#9ef0f0', 30: '#3ddbd9', 40: '#08bdba',
      50: '#009d9a', 60: '#007d79', 70: '#005d5d', 80: '#004144',
      90: '#022b30', 100: '#081a1c',
    },
  },
  {
    id: 'green',
    name: 'Green',
    shades: {
      10: '#defbe6', 20: '#a7f0ba', 30: '#6fdc8c', 40: '#42be65',
      50: '#24a148', 60: '#198038', 70: '#0e6027', 80: '#044317',
      90: '#022d0d', 100: '#071908',
    },
  },
  {
    id: 'purple',
    name: 'Purple',
    shades: {
      10: '#f6f2ff', 20: '#e8daff', 30: '#d4bbff', 40: '#be95ff',
      50: '#a56eff', 60: '#8a3ffc', 70: '#6929c4', 80: '#491d8b',
      90: '#31135e', 100: '#1c0f30',
    },
  },
  {
    id: 'magenta',
    name: 'Magenta',
    shades: {
      10: '#fff0f7', 20: '#ffd6e8', 30: '#ffafd2', 40: '#ff7eb6',
      50: '#ee5396', 60: '#d02670', 70: '#9f1853', 80: '#740937',
      90: '#510224', 100: '#2a0a18',
    },
  },
  {
    id: 'red',
    name: 'Red',
    shades: {
      10: '#fff1f1', 20: '#ffd7d9', 30: '#ffb3b8', 40: '#ff8389',
      50: '#fa4d56', 60: '#da1e28', 70: '#a2191f', 80: '#750e13',
      90: '#520408', 100: '#2d0709',
    },
  },
  {
    id: 'orange',
    name: 'Orange',
    shades: {
      10: '#fff2e8', 20: '#ffd9be', 30: '#ffb784', 40: '#ff832b',
      50: '#eb6200', 60: '#ba4e00', 70: '#8a3800', 80: '#5e2900',
      90: '#3e1a00', 100: '#231000',
    },
  },
  {
    id: 'yellow',
    name: 'Yellow',
    shades: {
      10: '#fcf4d6', 20: '#fddc69', 30: '#f1c21b', 40: '#d2a106',
      50: '#b28600', 60: '#8e6a00', 70: '#684e00', 80: '#483700',
      90: '#302400', 100: '#1c1500',
    },
  },
  {
    id: 'gray',
    name: 'Gray',
    shades: {
      10: '#f4f4f4', 20: '#e0e0e0', 30: '#c6c6c6', 40: '#a8a8a8',
      50: '#8d8d8d', 60: '#6f6f6f', 70: '#525252', 80: '#393939',
      90: '#262626', 100: '#161616',
    },
  },
  {
    id: 'coolGray',
    name: 'Cool Gray',
    shades: {
      10: '#f2f4f8', 20: '#dde1e6', 30: '#c1c7cd', 40: '#a2a9b0',
      50: '#878d96', 60: '#697077', 70: '#4d5358', 80: '#343a3f',
      90: '#21272a', 100: '#121619',
    },
  },
  {
    id: 'warmGray',
    name: 'Warm Gray',
    shades: {
      10: '#f7f3f2', 20: '#e5e0df', 30: '#cac5c4', 40: '#ada8a8',
      50: '#8f8b8b', 60: '#726e6e', 70: '#565151', 80: '#3c3838',
      90: '#272525', 100: '#171414',
    },
  },
];

export const CARBON_FAMILY_BY_ID: Record<string, CarbonColorFamily> = Object.fromEntries(
  CARBON_COLOR_FAMILIES.map((f) => [f.id, f]),
);

/** Carbon's standard neutral surface shades for dark/light modes */
export const CARBON_NEUTRALS = {
  dark: {
    g100: { bg: '#161616', l01: '#1c1c1c', l02: '#232323', l03: '#2d2d2d', border: '#393939', borderStrong: '#525252', textPrimary: '#f4f4f4', textSecondary: '#c6c6c6', textHelper: '#8d8d8d', textInverse: '#161616' },
    g90:  { bg: '#262626', l01: '#2d2d2d', l02: '#393939', l03: '#434343', border: '#525252', borderStrong: '#6f6f6f', textPrimary: '#f4f4f4', textSecondary: '#c6c6c6', textHelper: '#8d8d8d', textInverse: '#161616' },
  },
  light: {
    white: { bg: '#ffffff', l01: '#f4f4f4', l02: '#e0e0e0', l03: '#c6c6c6', border: '#e0e0e0', borderStrong: '#a8a8a8', textPrimary: '#161616', textSecondary: '#525252', textHelper: '#6f6f6f', textInverse: '#ffffff' },
    g10:   { bg: '#f4f4f4', l01: '#ffffff', l02: '#f4f4f4', l03: '#e0e0e0', border: '#c6c6c6', borderStrong: '#8d8d8d', textPrimary: '#161616', textSecondary: '#525252', textHelper: '#6f6f6f', textInverse: '#ffffff' },
  },
};

export type DarkBase = 'g100' | 'g90';
export type LightBase = 'white' | 'g10';
export type BaseShell = DarkBase | LightBase;

/** Shade to use for interactive/primary in dark mode */
export function primaryShadeForDark(familyId: string): number {
  // Warm/yellow families need lighter shades to contrast on dark backgrounds
  if (['yellow', 'orange'].includes(familyId)) return 30;
  if (['green', 'teal', 'cyan'].includes(familyId)) return 40;
  return 50;
}

/** Shade to use for interactive/primary in light mode */
export function primaryShadeForLight(familyId: string): number {
  if (['yellow', 'orange'].includes(familyId)) return 60;
  if (['green', 'teal', 'cyan'].includes(familyId)) return 60;
  return 60;
}

/** Shade for the accent/link color */
export function accentShadeForDark(familyId: string): number {
  if (['yellow', 'orange'].includes(familyId)) return 20;
  return 40;
}

export function accentShadeForLight(familyId: string): number {
  if (['yellow', 'orange'].includes(familyId)) return 70;
  return 70;
}

/** Shades to offer in the per-slot palette picker, grouped semantically */
export const PICKER_SHADES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
