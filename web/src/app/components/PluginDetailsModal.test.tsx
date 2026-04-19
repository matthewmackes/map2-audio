import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Plugin } from '../../map2/types'

import { PluginDetailsModal } from './PluginDetailsModal'

const mockPushToast = jest.fn()
const mockClipboardWriteText = jest.fn()

jest.mock('./Toasts', () => ({
  useToasts: () => ({
    pushToast: mockPushToast,
  }),
}))

function buildPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    uri: 'http://example.com/plugin',
    name: 'Test Plugin',
    author: 'Unit Tester',
    category: 'Dynamics',
    class_label: 'Compressor',
    version: '1.2.3',
    license: 'MIT',
    has_ui: true,
    in_ports: 2,
    out_ports: 2,
    parameters: [
      {
        index: 0,
        name: 'Threshold',
        symbol: 'threshold',
        min: -60,
        max: 0,
        default: -18,
        is_toggled: false,
        is_log: false,
      },
    ],
    ...overrides,
  }
}

describe('PluginDetailsModal', () => {
  beforeEach(() => {
    mockPushToast.mockReset()
    mockClipboardWriteText.mockReset()
    mockClipboardWriteText.mockResolvedValue(undefined)
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
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockClipboardWriteText },
      configurable: true,
    })
  })

  it('renders plugin metadata and parameter summary', () => {
    render(
      <PluginDetailsModal
        plugin={buildPlugin()}
        open
        onClose={jest.fn()}
      />,
    )

    expect(screen.getByText('Test Plugin')).toBeInTheDocument()
    expect(screen.getByText('http://example.com/plugin')).toBeInTheDocument()
    expect(screen.getByText('Threshold')).toBeInTheDocument()
    expect(screen.getByText('2 in / 2 out')).toBeInTheDocument()
  })

  it('copies URI with the modal secondary action', async () => {
    render(
      <PluginDetailsModal
        plugin={buildPlugin()}
        open
        onClose={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy URI' }))

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith('http://example.com/plugin')
    })
    expect(mockPushToast).toHaveBeenCalledWith('URI copied to clipboard', 'info')
  })

  it('submits add action when add callback is provided', () => {
    const onAdd = jest.fn()

    render(
      <PluginDetailsModal
        plugin={buildPlugin()}
        open
        onClose={jest.fn()}
        onAdd={onAdd}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add to chain' }))

    expect(onAdd).toHaveBeenCalledWith('http://example.com/plugin')
  })

  it('closes from primary action when add callback is not provided', () => {
    const onClose = jest.fn()

    render(
      <PluginDetailsModal
        plugin={buildPlugin()}
        open
        onClose={onClose}
      />,
    )

    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(closeButtons[closeButtons.length - 1])

    expect(onClose).toHaveBeenCalled()
  })
})
