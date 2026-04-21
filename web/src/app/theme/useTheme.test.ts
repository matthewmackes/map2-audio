import '@testing-library/jest-dom'

import type { Theme } from './types'
import { applyTheme, getSavedThemeId, initializeTheme, saveCustomTheme, toCarbonBaseTheme } from './useTheme'

describe('theme defaults', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.className = ''
    document.body.className = ''
    document.documentElement.removeAttribute('data-carbon-theme')
    document.body.removeAttribute('data-carbon-theme')
    document.documentElement.style.colorScheme = ''
  })

  it('defaults new users to the light gray-10 theme', () => {
    expect(getSavedThemeId()).toBe('gray-10')

    initializeTheme()

    expect(window.localStorage.getItem('theme')).toBe('gray-10')
    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'g10')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('preserves an existing user-selected theme override', () => {
    applyTheme('white')
    expect(getSavedThemeId()).toBe('white')

    initializeTheme()

    expect(window.localStorage.getItem('theme')).toBe('white')
    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'white')
  })

  it.each([
    ['default', 'g100', 'dark'],
    ['gray-90', 'g90', 'dark'],
    ['gray-10', 'g10', 'light'],
    ['white', 'white', 'light'],
    ['blueprint', 'blueprint', 'dark'],
  ] as const)('applies built-in theme %s using Carbon shell %s', (themeId, carbonTheme, colorScheme) => {
    applyTheme(themeId)

    expect(document.documentElement).toHaveAttribute('data-carbon-theme', carbonTheme)
    expect(document.body).toHaveAttribute('data-carbon-theme', carbonTheme)
    expect(document.documentElement.style.colorScheme).toBe(colorScheme)
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('var(--cds-background)')
    expect(document.documentElement.style.getPropertyValue('--surface')).toBe('var(--cds-layer)')
    expect(document.documentElement.style.getPropertyValue('--interactive')).toBe('var(--cds-button-primary)')
    expect(document.documentElement.style.getPropertyValue('--focus-ring')).toBe('var(--cds-focus)')
  })

  it('maps concrete custom theme colors onto Carbon CSS variables', () => {
    const customTheme: Theme = {
      id: 'custom-carbon-token-test',
      name: 'Custom Carbon Token Test',
      description: 'Test custom theme',
      carbonTheme: 'g100',
      colors: {
        bg: '#101010',
        surface: '#181818',
        'surface-2': '#222222',
        'surface-3': '#2c2c2c',
        'surface-overlay': '#222222',
        interactive: '#66d9e8',
        'interactive-hover': '#8ee8f2',
        'interactive-active': '#b5f3f7',
        'interactive-disabled': '#525252',
        primary: '#66d9e8',
        'primary-strong': '#b5f3f7',
        accent: '#ffd43b',
        'text-primary': '#f4f4f4',
        'text-secondary': '#c6c6c6',
        'text-tertiary': '#8d8d8d',
        'text-inverse': '#161616',
        muted: '#c6c6c6',
        'muted-2': '#8d8d8d',
        border: '#393939',
        'border-strong': '#525252',
        'support-success': '#42be65',
        'support-warning': '#f1c21b',
        'support-danger': '#fa4d56',
        'support-info': '#4589ff',
        success: '#42be65',
        warning: '#f1c21b',
        danger: '#fa4d56',
        'bg-empty': '#181818',
        'bg-offline': '#261818',
        'bg-fault': '#331818',
        'bg-warning': '#302818',
        'focus-ring': '#ffd43b',
        'shadow-strong': 'rgba(0,0,0,0.58)',
        'shadow-soft': 'rgba(0,0,0,0.28)',
        'color-scheme': 'dark',
      },
      widgets: {
        'border-radius-xs': '0px',
        'border-radius-sm': '0px',
        'border-radius-md': '0px',
        'border-radius-lg': '4px',
        'border-radius-xl': '6px',
        'border-radius-xxl': '10px',
        'border-width': '1px',
        'spacing-density-compact': '0.85',
        'spacing-density-default': '1',
        'spacing-density-spacious': '1.15',
        'widget-shadow': '0',
        'glow-intensity': '0',
        'transition-speed': '0.12s',
      },
    }

    saveCustomTheme(customTheme)
    applyTheme(customTheme.id)

    expect(document.documentElement.style.getPropertyValue('--cds-background')).toBe('#101010')
    expect(document.documentElement.style.getPropertyValue('--cds-button-primary')).toBe('#66d9e8')
    expect(document.documentElement.style.getPropertyValue('--cds-support-error')).toBe('#fa4d56')

    applyTheme('gray-10')

    expect(document.documentElement.style.getPropertyValue('--cds-background')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--cds-button-primary')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--cds-support-error')).toBe('')
  })
})

describe('toCarbonBaseTheme', () => {
  it('maps each Carbon base theme to itself', () => {
    expect(toCarbonBaseTheme('g100')).toBe('g100')
    expect(toCarbonBaseTheme('g90')).toBe('g90')
    expect(toCarbonBaseTheme('g10')).toBe('g10')
    expect(toCarbonBaseTheme('white')).toBe('white')
  })

  it('maps blueprint to g100 so @carbon/react Theme accepts the value', () => {
    expect(toCarbonBaseTheme('blueprint')).toBe('g100')
  })

  it('defaults null/undefined to g100', () => {
    expect(toCarbonBaseTheme(null)).toBe('g100')
    expect(toCarbonBaseTheme(undefined)).toBe('g100')
  })
})
