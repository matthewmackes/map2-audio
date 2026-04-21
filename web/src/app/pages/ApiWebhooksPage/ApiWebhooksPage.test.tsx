import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { ApiWebhooksPage } from './ApiWebhooksPage'

describe('ApiWebhooksPage', () => {
  beforeEach(() => {
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
