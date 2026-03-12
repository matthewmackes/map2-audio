import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('../../map2/api', () => ({
  API_BASE: 'http://localhost:8080/api',
}))

import { ShoppingSearchDialog } from './ShoppingSearchDialog'

interface TestResult {
  title: string
  price: number
  url: string
  source: string
  condition: string
  shipping: number | null
  score: number
  matched_device: {
    model: string
    io_count: string
    latency_ms: number
    tier: string
    score: number
    linux_support: string
    notes: string
  }
}

function buildResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    title: 'Focusrite Scarlett 18i20 Rack Interface',
    price: 179.99,
    url: 'https://example.com/focusrite',
    source: 'eBay',
    condition: 'Used',
    shipping: 18,
    score: 92,
    matched_device: {
      model: 'Focusrite Scarlett 18i20',
      io_count: '18x20',
      latency_ms: 4.2,
      tier: 'A',
      score: 92,
      linux_support: 'Excellent',
      notes: 'Reliable Linux support',
    },
    ...overrides,
  }
}

describe('ShoppingSearchDialog', () => {
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

  it('auto-searches on open and renders returned results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [buildResult()] }),
    })

    render(
      <ShoppingSearchDialog
        open
        onClose={jest.fn()}
      />, 
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/shopping/search?max_price=500'))
    })

    expect(await screen.findByText('Focusrite Scarlett 18i20 Rack Interface')).toBeInTheDocument()
    expect(screen.getByText(/Found 1 of 1 results/)).toBeInTheDocument()
  })

  it('filters visible rows with search input', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          buildResult(),
          buildResult({
            title: 'MOTU 828mk3 Hybrid Rack Interface',
            url: 'https://example.com/motu',
            source: 'Reverb',
            matched_device: {
              model: 'MOTU 828mk3 Hybrid',
              io_count: '28x30',
              latency_ms: 3.9,
              tier: 'S',
              score: 95,
              linux_support: 'Good',
              notes: 'Fast interface',
            },
          }),
        ],
      }),
    })

    render(
      <ShoppingSearchDialog
        open
        onClose={jest.fn()}
      />, 
    )

    expect(await screen.findByText('MOTU 828mk3 Hybrid Rack Interface')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search results' }), {
      target: { value: 'MOTU' },
    })

    expect(screen.getByText('MOTU 828mk3 Hybrid Rack Interface')).toBeInTheDocument()
    expect(screen.queryByText('Focusrite Scarlett 18i20 Rack Interface')).not.toBeInTheDocument()
  })

  it('renders inline error notification when the search request fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    })

    render(
      <ShoppingSearchDialog
        open
        onClose={jest.fn()}
      />, 
    )

    const errorMessages = await screen.findAllByText('Search failed')
    expect(errorMessages.length).toBeGreaterThan(0)
  })
})
