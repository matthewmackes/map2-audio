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

  it('applies the selected Carbon preset and retains legacy custom themes', () => {
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

    const gray10Option = document.getElementById('theme-preset-gray-10')
    if (!(gray10Option instanceof HTMLInputElement)) {
      throw new Error('Expected Carbon gray 10 radio tile input')
    }

    fireEvent.click(gray10Option)
    fireEvent.click(screen.getByRole('button', { name: /apply theme/i }))

    expect(screen.getByRole('heading', { name: /legacy custom themes/i })).toBeTruthy()
    expect(onThemeChange).toHaveBeenCalledWith('gray-10')
    expect(onClose).toHaveBeenCalled()
  })
})
