import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { themes } from '../theme'
import { ThemeCreatorDialog } from './ThemeCreatorDialog'

describe('ThemeCreatorDialog', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    ;(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver
  })

  it('navigates from the overview modal into presets and applies the selected theme', () => {
    const onClose = jest.fn()
    const onThemeChange = jest.fn()

    render(
      <ThemeCreatorDialog
        isOpen
        onClose={onClose}
        currentTheme="default"
        onThemeChange={onThemeChange}
        customThemes={{
          'legacy-custom': {
            ...themes.default,
            id: 'legacy-custom',
            name: 'Legacy custom',
            description: 'Saved before the Carbon preset migration.',
          },
        }}
      />,
    )

    expect(screen.getByRole('button', { name: /open preset modal/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /open preset modal/i }))

    const gray10Option = document.getElementById('theme-preset-gray-10')
    if (!(gray10Option instanceof HTMLInputElement)) {
      throw new Error('Expected Carbon gray 10 radio tile input')
    }

    fireEvent.click(gray10Option)
    fireEvent.click(screen.getByRole('button', { name: /apply theme/i }))

    expect(onThemeChange).toHaveBeenCalledWith('gray-10')
    expect(onClose).toHaveBeenCalled()
  })

  it('opens the legacy theme modal from the overview and exposes retained theme actions', () => {
    render(
      <ThemeCreatorDialog
        isOpen
        onClose={jest.fn()}
        currentTheme="default"
        customThemes={{
          'legacy-custom': {
            ...themes.default,
            id: 'legacy-custom',
            name: 'Legacy custom',
            description: 'Saved before the Carbon preset migration.',
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /open legacy modal/i }))

    expect(screen.getAllByRole('heading', { name: /legacy custom themes/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /use theme/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete/i })).toBeTruthy()
  })

  it('opens the branding modal and calls the toggle handlers', () => {
    const onToggleWelcomeBanner = jest.fn()
    const onToggleBootSplash = jest.fn()

    render(
      <ThemeCreatorDialog
        isOpen
        onClose={jest.fn()}
        currentTheme="default"
        welcomeBanner={{ installed: true }}
        bootSplash={{ installed: false }}
        onToggleWelcomeBanner={onToggleWelcomeBanner}
        onToggleBootSplash={onToggleBootSplash}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /open branding modal/i }))

    fireEvent.click(screen.getByLabelText(/terminal welcome banner/i))
    fireEvent.click(screen.getByLabelText(/boot splash/i))

    expect(onToggleWelcomeBanner).toHaveBeenCalled()
    expect(onToggleBootSplash).toHaveBeenCalled()
  })
})
