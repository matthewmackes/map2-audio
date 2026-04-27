import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

const mockListDiagnostics = jest.fn()

jest.mock('../../../map2/clients/devices', () => ({
  __esModule: true,
  listDeviceDiagnostics: (...args: unknown[]) => mockListDiagnostics(...args),
}))

import { DiagnosticsAggregatePage } from './DiagnosticsAggregatePage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DiagnosticsAggregatePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(() => mockListDiagnostics.mockReset())

test('DiagnosticsAggregatePage: renders header + counts when data loads', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [
      { severity: 'error', source: 'profile_registry', code: 'pack_degraded',
        detail: 'broken yaml', pack_id: 'brokenco', file: '/x.yaml', ts: 1.0 },
      { severity: 'warning', source: 'controller_host', code: 'host_unhealthy',
        detail: 'restart count up', ts: 2.0 },
    ],
    count: 2,
    counts_by_severity: { info: 0, warning: 1, error: 1 },
  })

  renderPage()
  expect(await screen.findByText('Bench-wide diagnostics')).toBeInTheDocument()
  await waitFor(() => {
    expect(screen.getByText('1 error')).toBeInTheDocument()
  })
  expect(screen.getByText('1 warning')).toBeInTheDocument()
  // Both rows in the table.
  expect(screen.getByText('pack_degraded')).toBeInTheDocument()
  expect(screen.getByText('host_unhealthy')).toBeInTheDocument()
})

test('DiagnosticsAggregatePage: empty state when no rows', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })

  renderPage()
  await waitFor(() => {
    expect(screen.getByText(/Bench is healthy/)).toBeInTheDocument()
  })
})

test('DiagnosticsAggregatePage: error InlineNotification on failure', async () => {
  mockListDiagnostics.mockRejectedValue(new Error('500'))

  renderPage()
  await waitFor(() => {
    expect(screen.getByText('Diagnostics unavailable')).toBeInTheDocument()
  })
})

test('DiagnosticsAggregatePage: pack_id column links to device profile', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [
      { severity: 'error', source: 'profile_registry', code: 'pack_degraded',
        detail: 'x', pack_id: 'edirol-ua', ts: 1.0 },
    ],
    count: 1,
    counts_by_severity: { info: 0, warning: 0, error: 1 },
  })

  renderPage()
  await waitFor(() => {
    expect(screen.getByText('edirol-ua')).toBeInTheDocument()
  })
  const link = screen.getByText('edirol-ua').closest('a')
  expect(link?.getAttribute('href')).toBe('/devices/profile/edirol-ua/?from=diagnostics')
})
