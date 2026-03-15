import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PluginManagementCard } from './PluginManagementCard'

const mockDiscover = jest.fn()
const mockDelete = jest.fn()

jest.mock('../../map2/api', () => ({
  pluginsApi: {
    discover: (...args: unknown[]) => mockDiscover(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PluginManagementCard />
    </QueryClientProvider>,
  )
}

describe('PluginManagementCard', () => {
  beforeEach(() => {
    mockDiscover.mockReset()
    mockDelete.mockReset()
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
    mockDiscover.mockResolvedValue({
      plugins: [
        {
          uri: 'plugin://compressor',
          name: 'Studio Compressor',
          author: 'ACME Audio',
          category: 'Dynamics',
          class_label: 'Compressor',
          version: '1.0.0',
          has_ui: true,
          in_ports: 2,
          out_ports: 2,
          parameters: [],
          format: 'LV2',
        },
      ],
      count: 1,
    })
  })

  it('renders the Carbon inventory table for discovered plugins', async () => {
    renderCard()

    await waitFor(() => {
      expect(screen.getByText('Installed plugin inventory')).toBeInTheDocument()
    })

    expect(screen.getByText('Studio Compressor')).toBeInTheDocument()
    expect(screen.getByText('ACME Audio')).toBeInTheDocument()
    expect(screen.getByText('LV2')).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
  })
})
