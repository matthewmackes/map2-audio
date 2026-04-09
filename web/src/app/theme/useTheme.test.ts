import '@testing-library/jest-dom'

import { applyTheme, getSavedThemeId, initializeTheme } from './useTheme'

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
  ] as const)('applies built-in theme %s using Carbon shell %s', (themeId, carbonTheme, colorScheme) => {
    applyTheme(themeId)

    expect(document.documentElement).toHaveAttribute('data-carbon-theme', carbonTheme)
    expect(document.body).toHaveAttribute('data-carbon-theme', carbonTheme)
    expect(document.documentElement.style.colorScheme).toBe(colorScheme)
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('var(--cds-background)')
    expect(document.documentElement.style.getPropertyValue('--surface')).toBe('var(--cds-layer-01)')
    expect(document.documentElement.style.getPropertyValue('--interactive')).toBe('var(--cds-button-primary)')
    expect(document.documentElement.style.getPropertyValue('--focus-ring')).toBe('var(--cds-focus)')
  })
})
