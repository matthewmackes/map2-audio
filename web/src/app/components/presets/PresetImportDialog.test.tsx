import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PresetImportDialog } from './PresetImportDialog'

describe('PresetImportDialog', () => {
  const mockFetch = jest.fn()

  beforeEach(() => {
    mockFetch.mockReset()

    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        value: jest.fn().mockImplementation((query: string) => ({
          matches: query.includes('max-width') ? false : false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
        configurable: true,
      })
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
        configurable: true,
      })
    }

    Object.defineProperty(global, 'fetch', {
      value: mockFetch,
      configurable: true,
      writable: true,
    })
  })

  function addFile(container: HTMLElement, fileName = 'test.fxp') {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()

    const file = new File(['preset'], fileName, { type: 'application/octet-stream' })
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [file] },
    })
  }

  it('imports a selected file and emits success callback', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        preset_id: 7,
        name: 'Imported Tone',
        plugin_identifier: 'urn:test',
        original_format: 'fxp',
        parameters_imported: 24,
        message: 'Import complete',
        warnings: [],
      }),
    })

    const onImportSuccess = jest.fn()
    const { container } = render(
      <PresetImportDialog
        isOpen
        onClose={jest.fn()}
        onImportSuccess={onImportSuccess}
      />,
    )

    addFile(container)

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(await screen.findByText('Imported successfully')).toBeInTheDocument()

    await waitFor(() => {
      expect(onImportSuccess).toHaveBeenCalledWith(7, 'Imported Tone')
    })
  })

  it('shows inline error notification when import fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Unsupported preset format' }),
    })

    const { container } = render(
      <PresetImportDialog
        isOpen
        onClose={jest.fn()}
      />,
    )

    addFile(container, 'broken.ttl')

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(await screen.findByText('Import failed')).toBeInTheDocument()
    expect(screen.getByText('Unsupported preset format')).toBeInTheDocument()
  })
})
