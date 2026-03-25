import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { IconPickerModal } from './IconPickerModal'

describe('IconPickerModal', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    ;(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
    window.HTMLElement.prototype.scrollIntoView = jest.fn()
  })

  it('returns a selected preset icon identifier', async () => {
    const onSelect = jest.fn()

    render(
      <IconPickerModal
        open
        pluginName="Delay Deluxe"
        currentIdentifier={null}
        currentCustomSvg={null}
        fallbackCategory="Delay"
        onClose={jest.fn()}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delay' }))
    fireEvent.click(screen.getByRole('button', { name: /use icon/i }))

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({ identifier: 'fx:delay', customSvg: undefined })
    })
  })

  it('uploads a custom svg and returns the generated custom identifier', async () => {
    const onSelect = jest.fn()
    const onUploadCustomIcon = jest.fn().mockResolvedValue({
      identifier: 'custom:abc123',
      customSvg: '<svg viewBox="0 0 10 10"></svg>',
    })

    render(
      <IconPickerModal
        open
        pluginName="NAM"
        currentIdentifier={null}
        currentCustomSvg={null}
        fallbackCategory="Amplifier"
        onClose={jest.fn()}
        onSelect={onSelect}
        onUploadCustomIcon={onUploadCustomIcon}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /custom svg/i }))
    fireEvent.change(screen.getByLabelText(/upload svg icon/i), {
      target: {
        files: [new File(['<svg viewBox="0 0 10 10"></svg>'], 'custom.svg', { type: 'image/svg+xml' })],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('custom.svg')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /use icon/i }))

    await waitFor(() => {
      expect(onUploadCustomIcon).toHaveBeenCalled()
      expect(onSelect).toHaveBeenCalledWith({
        identifier: 'custom:abc123',
        customSvg: '<svg viewBox="0 0 10 10"></svg>',
      })
    })
  })
})
