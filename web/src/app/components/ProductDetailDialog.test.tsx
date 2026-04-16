import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { ProductDetailDialog, type ProductDetails } from './ProductDetailDialog'

const productFixture: ProductDetails = {
  model: 'Focusrite Scarlett 18i20',
  manufacturer: 'Focusrite',
  io_count: '18x20',
  latency_ms: 4.2,
  tier: 'A',
  linux_support: 'Excellent',
  notes: 'Solid Linux support and stable low-latency performance.',
  price_range: '$180-$260',
  release_year: 2019,
}

describe('ProductDetailDialog', () => {
  const mockWindowOpen = jest.fn()

  beforeEach(() => {
    mockWindowOpen.mockReset()

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

    Object.defineProperty(window, 'open', {
      value: mockWindowOpen,
      configurable: true,
      writable: true,
    })
  })

  it('renders overview metadata and compatibility details', () => {
    render(
      <ProductDetailDialog
        open
        onClose={jest.fn()}
        product={productFixture}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Focusrite Scarlett 18i20' })).toBeInTheDocument()
    expect(screen.getByText('Linux compatibility')).toBeInTheDocument()
    expect(screen.getAllByText('4.2 ms').length).toBeGreaterThan(0)
    expect(screen.getByText('Typical used market price')).toBeInTheDocument()
    expect(screen.getByText('Reference image unavailable')).toBeInTheDocument()
  })

  it('switches to specification tab content', () => {
    render(
      <ProductDetailDialog
        open
        onClose={jest.fn()}
        product={productFixture}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Specifications' }))

    expect(screen.getByText('Round-trip latency (64 samples)')).toBeInTheDocument()
    expect(screen.getByText('Class-compliant (no driver needed)')).toBeInTheDocument()
  })

  it('opens web search from primary action', () => {
    render(
      <ProductDetailDialog
        open
        onClose={jest.fn()}
        product={productFixture}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Search for this device' }))

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www.google.com/search?q=Focusrite%20Scarlett%2018i20%20audio%20interface',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('uses close action callback', () => {
    const onClose = jest.fn()

    render(
      <ProductDetailDialog
        open
        onClose={onClose}
        product={productFixture}
      />,
    )

    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(closeButtons[closeButtons.length - 1])

    expect(onClose).toHaveBeenCalled()
  })

  it('returns null when no product is provided', () => {
    const { container } = render(
      <ProductDetailDialog
        open
        onClose={jest.fn()}
        product={null}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
