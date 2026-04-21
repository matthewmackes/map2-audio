import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver

import { ApiWebhooksPage } from './ApiWebhooksPage'

describe('ApiWebhooksPage', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ targets: [], count: 0, events: [], peers: [] }),
        } as Response),
      ) as unknown as typeof fetch
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
    window.localStorage.clear()
  })

  it('renders both tabs with the Event Feed selected by default', () => {
    render(<ApiWebhooksPage />)

    expect(screen.getByRole('tab', { name: /event feed/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /web ssh/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /event feed/i })).toBeInTheDocument()
  })

  it('switches to the Web SSH tab when clicked and persists the selection', () => {
    const { unmount } = render(<ApiWebhooksPage />)

    fireEvent.click(screen.getByRole('tab', { name: /web ssh/i }))

    expect(screen.getByRole('region', { name: /web ssh/i })).toBeInTheDocument()
    expect(window.localStorage.getItem('map2_api_webhooks_active_tab')).toBe('web-ssh')

    unmount()
    render(<ApiWebhooksPage />)
    expect(screen.getByRole('region', { name: /web ssh/i })).toBeInTheDocument()
  })
})
