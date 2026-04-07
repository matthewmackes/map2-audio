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
})
